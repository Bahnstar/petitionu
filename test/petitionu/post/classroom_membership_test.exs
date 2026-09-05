defmodule Petitionu.Post.ClassroomMembershipTest do
  use Petitionu.DataCase, async: true

  import Swoosh.TestAssertions

  alias Petitionu.Accounts.User
  alias Petitionu.Post.{Classroom, ClassroomMembership}

  setup do
    professor = user(:professor)
    student = user(:student)
    classroom = Petitionu.Post.create_classroom!(%{name: "Civics"}, actor: professor)
    %{professor: professor, student: student, classroom: classroom}
  end

  test "a verified outsider joins by code and can then read the classroom", context do
    %{student: student, classroom: classroom} = context
    assert {:error, _} = Petitionu.Post.get_classroom_by_id(classroom.id, actor: student)
    assert {:ok, membership} = join(classroom, student)
    assert membership.user_id == student.id
    assert membership.role == :student
    assert membership.status == :active
    assert membership.joined_at

    assert {:ok, joined_classroom} =
             Petitionu.Post.get_classroom_by_id(classroom.id, actor: student)

    assert joined_classroom.id == classroom.id
  end

  test "anonymous and unconfirmed users cannot join", %{classroom: classroom} do
    assert {:error, _} = join(classroom, nil)
    assert {:error, _} = join(classroom, user(:student, nil))
  end

  test "invalid and archived codes do not grant membership", context do
    %{classroom: classroom, professor: professor, student: student} = context

    assert {:error, _} =
             Petitionu.Post.join_classroom_by_code(%{join_code: Ash.UUID.generate()},
               actor: student
             )

    archived = Petitionu.Post.archive_classroom!(classroom, actor: professor)
    assert {:error, _} = join(archived, student)

    assert {:error, _} =
             Petitionu.Post.request_to_join_classroom(%{classroom_id: archived.id},
               actor: student
             )
  end

  test "active, pending and removed rows cannot be replaced by a join", context do
    %{classroom: classroom, student: student} = context

    for {status, expected} <- [
          active: "already a member",
          pending: "awaiting approval",
          removed: "removed"
        ] do
      member = membership(classroom, student, status)
      assert {:error, error} = join(classroom, student)
      assert Exception.message(error) =~ expected
      assert Ash.get!(ClassroomMembership, member.id, authorize?: false).status == status
      Ash.destroy!(member, authorize?: false)
    end
  end

  test "professor does not acquire a duplicate student membership", context do
    assert {:error, error} = join(context.classroom, context.professor)
    assert Exception.message(error) =~ "professor"
  end

  test "join rejects browser-supplied identity and role", context do
    for extra <- [%{role: :ta}, %{user_id: context.professor.id}] do
      assert {:error, _} =
               Petitionu.Post.join_classroom_by_code(
                 Map.merge(%{join_code: context.classroom.join_code}, extra),
                 actor: context.student
               )
    end
  end

  test "code lookup requires confirmation and does not permit ordinary outsider reads", context do
    assert {:ok, _} =
             Petitionu.Post.get_classroom_by_join_code(context.classroom.join_code,
               actor: context.student
             )

    assert {:error, _} =
             Petitionu.Post.get_classroom_by_join_code(context.classroom.join_code,
               actor: user(:student, nil)
             )

    assert Ash.read!(Classroom, actor: context.student) == []
  end

  test "professor can invite and approve without leaking private user fields", context do
    assert {:ok, invited} =
             Petitionu.Post.invite_to_classroom(
               %{classroom_id: context.classroom.id, email: context.student.email},
               actor: context.professor
             )

    assert invited.status == :pending
    assert invited.invited_by_id == context.professor.id
    assert %Ash.NotLoaded{} = invited.user

    assert_email_sent(
      to: {"", to_string(context.student.email)},
      subject: "You've been invited to join Civics"
    )

    assert {:ok, approved} =
             Petitionu.Post.approve_classroom_membership(invited, actor: context.professor)

    assert approved.status == :active
    assert %Ash.NotLoaded{} = approved.user

    assert_email_sent(
      to: {"", to_string(context.student.email)},
      subject: "You've been approved to join Civics"
    )
  end

  test "outsiders cannot invite, and archived classrooms do not accept invitations", context do
    params = %{classroom_id: context.classroom.id, email: user(:student).email}
    assert {:error, _} = Petitionu.Post.invite_to_classroom(params, actor: context.student)
    Petitionu.Post.archive_classroom!(context.classroom, actor: context.professor)
    assert {:error, _} = Petitionu.Post.invite_to_classroom(params, actor: context.professor)
  end

  test "TA authority does not extend to promotion or another classroom", context do
    ta = user(:student)
    membership(context.classroom, ta, :active, :ta)
    member = membership(context.classroom, context.student, :active)
    assert {:error, _} = Petitionu.Post.promote_member_to_ta(member, actor: ta)

    assert {:error, _} =
             Petitionu.Post.invite_to_classroom(
               %{classroom_id: context.classroom.id, email: user(:student).email, role: :ta},
               actor: ta
             )

    other_classroom = Petitionu.Post.create_classroom!(%{name: "Other"}, actor: user(:professor))
    other_member = membership(other_classroom, user(:student), :pending)
    assert {:error, _} = Petitionu.Post.approve_classroom_membership(other_member, actor: ta)
    assert {:error, _} = Petitionu.Post.remove_from_classroom(other_member, actor: ta)
  end

  test "requests require verification and never revive removed memberships", context do
    params = %{classroom_id: context.classroom.id}

    for actor <- [nil, user(:student, nil)] do
      assert {:error, _} = Petitionu.Post.request_to_join_classroom(params, actor: actor)
    end

    assert {:ok, requested} =
             Petitionu.Post.request_to_join_classroom(params, actor: context.student)

    assert requested.status == :pending
    removed = Petitionu.Post.remove_from_classroom!(requested, actor: context.professor)

    assert {:error, error} =
             Petitionu.Post.request_to_join_classroom(params, actor: context.student)

    assert Exception.message(error) =~ "removed"

    assert {:error, _} =
             Petitionu.Post.approve_classroom_membership(removed, actor: context.professor)
  end

  test "active TAs can invite students and approve their requests", context do
    ta = user(:student)
    membership(context.classroom, ta, :active, :ta)

    assert {:ok, invited} =
             Petitionu.Post.invite_to_classroom(
               %{classroom_id: context.classroom.id, email: context.student.email},
               actor: ta
             )

    assert {:ok, approved} = Petitionu.Post.approve_classroom_membership(invited, actor: ta)
    assert approved.status == :active
    assert {:error, _} = Petitionu.Post.demote_member_to_student(approved, actor: ta)
    assert {:ok, _} = Petitionu.Post.promote_member_to_ta(approved, actor: context.professor)
  end

  test "archiving also blocks approval of an existing pending request", context do
    member = membership(context.classroom, context.student, :pending)
    Petitionu.Post.archive_classroom!(context.classroom, actor: context.professor)

    assert {:error, _} =
             Petitionu.Post.approve_classroom_membership(member, actor: context.professor)
  end

  defp join(classroom, actor),
    do: Petitionu.Post.join_classroom_by_code(%{join_code: classroom.join_code}, actor: actor)

  defp user(role, confirmed_at \\ DateTime.utc_now()) do
    Ash.Seed.seed!(User, %{
      email: "classroom-#{System.unique_integer([:positive])}@example.com",
      role: role,
      confirmed_at: confirmed_at
    })
  end

  defp membership(classroom, user, status, role \\ :student) do
    Ash.Seed.seed!(ClassroomMembership, %{
      classroom_id: classroom.id,
      user_id: user.id,
      status: status,
      role: role
    })
  end
end
