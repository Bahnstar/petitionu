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

  test "classroom campus is actor-owned and creation requires a complete profile", context do
    assert context.classroom.organization_id == context.professor.organization_id

    assert {:error, _} =
             Petitionu.Post.create_classroom(
               %{name: "Forged campus", organization_id: context.student.organization_id},
               actor: context.professor
             )

    for actor <- [
          %{context.professor | first_name: nil},
          %{context.professor | confirmed_at: nil}
        ] do
      assert {:error, _} = Petitionu.Post.create_classroom(%{name: "Incomplete"}, actor: actor)
    end
  end

  test "authorized roster displays names without opening private account reads", context do
    membership = membership(context.classroom, context.student, :active)
    loaded = Ash.load!(membership, [:member_name, :user], actor: context.professor)
    assert loaded.member_name == "Test Member"
    assert is_nil(loaded.user)
    assert {:error, _} = Ash.get(ClassroomMembership, membership.id, actor: user(:student))
  end

  test "students can leave only their own active membership and lose classroom access", context do
    member = membership(context.classroom, context.student, :active)
    other = membership(context.classroom, user(:student), :active)
    assert {:error, _} = Petitionu.Post.remove_from_classroom(other, actor: context.student)
    assert {:ok, removed} = Petitionu.Post.remove_from_classroom(member, actor: context.student)
    assert removed.status == :removed

    assert {:error, _} =
             Petitionu.Post.get_classroom_by_id(context.classroom.id, actor: context.student)

    assert {:ok, []} = Petitionu.Post.list_my_classrooms(actor: context.student)
  end

  test "students cannot self-remove pending or already removed memberships", context do
    for status <- [:pending, :removed] do
      member = membership(context.classroom, user(:student), status)
      actor = Ash.get!(User, member.user_id, authorize?: false)
      assert {:error, _} = Petitionu.Post.remove_from_classroom(member, actor: actor)
    end
  end

  test "classroom pagination applies archive filtering before limiting", context do
    for index <- 1..13 do
      Petitionu.Post.create_classroom!(%{name: "Class #{index}"}, actor: context.professor)
    end

    Petitionu.Post.archive_classroom!(context.classroom, actor: context.professor)
    require Ash.Query

    query =
      Classroom
      |> Ash.Query.for_read(:my_classrooms, %{}, actor: context.professor)
      |> Ash.Query.filter(archived == false)
      |> Ash.Query.sort([:name, :id])

    first = Ash.read!(query, page: [limit: 12, offset: 0, count: true])
    second = Ash.read!(query, page: [limit: 12, offset: 12, count: true])
    assert length(first.results) == 12
    assert first.count == 13
    assert length(second.results) == 1
    refute Enum.any?(first.results, & &1.archived)
    refute hd(second.results).id in Enum.map(first.results, & &1.id)
  end

  test "management capabilities agree with actions across actor roles and archive state",
       context do
    active_ta = user(:student)
    pending_ta = user(:student)
    removed_ta = user(:student)
    membership(context.classroom, active_ta, :active, :ta)
    membership(context.classroom, pending_ta, :pending, :ta)
    membership(context.classroom, removed_ta, :removed, :ta)
    membership(context.classroom, context.student, :active)

    actors = [
      {context.professor, true, true},
      {active_ta, true, false},
      {pending_ta, false, false},
      {removed_ta, false, false},
      {context.student, false, false},
      {user(:student), false, false},
      {%{context.professor | confirmed_at: nil}, false, false}
    ]

    for archived <- [false, true] do
      classroom =
        if archived,
          do: Petitionu.Post.archive_classroom!(context.classroom, actor: context.professor),
          else: context.classroom

      for {actor, manages_members, changes_roles} <- actors do
        loaded = Ash.load!(classroom, [:can_manage_classroom, :can_manage_members], actor: actor)
        assert loaded.can_manage_classroom == (actor.id == context.professor.id)
        assert loaded.can_manage_members == manages_members

        pending = membership(classroom, user(:student), :pending)
        active = membership(classroom, user(:student), :active)
        capabilities = [:can_approve, :can_remove, :can_change_role]
        # Bypass only roster visibility so denied actors can be covered by the same matrix.
        loaded_pending = Ash.load!(pending, capabilities, actor: actor, authorize?: false)
        loaded_active = Ash.load!(active, capabilities, actor: actor, authorize?: false)
        assert loaded_pending.can_approve == (manages_members and not archived)
        refute loaded_active.can_approve
        assert loaded_active.can_remove == manages_members
        assert loaded_active.can_change_role == changes_roles

        assert match?(
                 {:ok, _},
                 Petitionu.Post.approve_classroom_membership(pending, actor: actor)
               ) ==
                 loaded_pending.can_approve

        assert match?({:ok, _}, Petitionu.Post.promote_member_to_ta(active, actor: actor)) ==
                 loaded_active.can_change_role

        assert match?({:ok, _}, Petitionu.Post.remove_from_classroom(active, actor: actor)) ==
                 loaded_active.can_remove
      end
    end
  end

  test "capabilities refresh after TA removal and archive without granting stale authority",
       context do
    ta = user(:student)
    ta_membership = membership(context.classroom, ta, :active, :ta)
    pending = membership(context.classroom, context.student, :pending)
    assert Ash.load!(pending, :can_approve, actor: ta).can_approve

    Petitionu.Post.remove_from_classroom!(ta_membership, actor: context.professor)
    refute Ash.load!(pending, :can_approve, actor: ta, authorize?: false).can_approve
    assert {:error, _} = Petitionu.Post.approve_classroom_membership(pending, actor: ta)

    Petitionu.Post.archive_classroom!(context.classroom, actor: context.professor)
    refute Ash.load!(pending, :can_approve, actor: context.professor).can_approve
    Petitionu.Post.unarchive_classroom!(context.classroom, actor: context.professor)
    assert Ash.load!(pending, :can_approve, actor: context.professor).can_approve
  end

  test "RPC projects actor capabilities without requiring readable roster user records",
       context do
    ta = user(:student)
    membership(context.classroom, ta, :active, :ta)
    pending = membership(context.classroom, context.student, :pending)

    for actor <- [context.professor, ta] do
      conn = Plug.Test.conn(:post, "/rpc/run") |> Ash.PlugHelpers.set_actor(actor)

      assert %{"success" => true, "data" => classroom} =
               AshTypescript.Rpc.run_action(:petitionu, conn, %{
                 "action" => "get_classroom_by_id",
                 "input" => %{"id" => context.classroom.id},
                 "fields" => ["canManageClassroom", "canManageMembers"]
               })

      assert classroom["canManageClassroom"] == (actor.id == context.professor.id)
      assert classroom["canManageMembers"]

      assert %{"success" => true, "data" => memberships} =
               AshTypescript.Rpc.run_action(:petitionu, conn, %{
                 "action" => "get_memberships_for_classroom",
                 "input" => %{"classroomId" => context.classroom.id},
                 "fields" => [
                   "id",
                   "canApprove",
                   "canRemove",
                   "canChangeRole",
                   %{"user" => ["id"]}
                 ]
               })

      request = Enum.find(memberships, &(&1["id"] == pending.id))
      assert request["canApprove"]
      assert request["canRemove"]
      assert request["canChangeRole"] == (actor.id == context.professor.id)
      assert is_nil(request["user"])
    end
  end

  defp join(classroom, actor),
    do: Petitionu.Post.join_classroom_by_code(%{join_code: classroom.join_code}, actor: actor)

  defp user(role, confirmed_at \\ DateTime.utc_now()) do
    campus =
      Ash.Seed.seed!(Petitionu.Accounts.Organization, %{
        name: "Test campus",
        domain: "classroom-#{System.unique_integer([:positive])}.test"
      })

    Ash.Seed.seed!(User, %{
      email: "classroom-#{System.unique_integer([:positive])}@example.com",
      role: role,
      first_name: "Test",
      last_name: "Member",
      organization_id: campus.id,
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
