defmodule Petitionu.Post.ModerationTest do
  use Petitionu.DataCase, async: false
  alias Petitionu.Accounts.{User, Organization, SupportRequest}

  alias Petitionu.Post.{
    Petition,
    Comment,
    Signature,
    ContentReport,
    Classroom,
    ClassroomMembership
  }

  setup do
    school = Ash.Seed.seed!(Organization, %{name: "School", domain: "school.edu"})
    other = Ash.Seed.seed!(Organization, %{name: "Other", domain: "other.edu"})
    reporter = user(school, :student)
    admin = user(school, :admin)
    outsider = user(other, :admin)
    superadmin = user(other, :superadmin)

    petition =
      Ash.Seed.seed!(Petition, %{
        title: "Library",
        description: "Open later",
        user_id: reporter.id,
        organization_id: school.id
      })

    %{
      reporter: reporter,
      admin: admin,
      outsider: outsider,
      superadmin: superadmin,
      petition: petition
    }
  end

  defp user(school, role),
    do:
      Ash.Seed.seed!(User, %{
        email: "#{Ash.UUID.generate()}@school.edu",
        first_name: "Student",
        last_name: "Name",
        organization_id: school.id,
        confirmed_at: DateTime.utc_now(),
        role: role
      })

  defp create(resource, input, actor),
    do: resource |> Ash.Changeset.for_create(:create, input, actor: actor) |> Ash.create()

  defp resolve(record, input, actor),
    do: record |> Ash.Changeset.for_update(:resolve, input, actor: actor) |> Ash.update()

  defp report(ctx),
    do: create(ContentReport, %{petition_id: ctx.petition.id, reason: :privacy}, ctx.reporter)

  test "report identity and campus are derived and only scoped operators resolve", ctx do
    assert {:ok, report} = report(ctx)
    assert report.reporter_id == ctx.reporter.id
    assert report.organization_id == ctx.petition.organization_id
    assert [own] = Ash.read!(ContentReport, actor: ctx.reporter)
    assert own.id == report.id
    assert Ash.read!(ContentReport, actor: ctx.outsider) == []
    input = %{outcome: :resolved, resolution_note: "Reviewed", hide_content: true}
    assert {:error, _} = resolve(report, input, ctx.reporter)
    assert {:error, _} = resolve(report, input, ctx.outsider)
    assert {:ok, resolved} = resolve(report, input, ctx.admin)
    assert resolved.state == :resolved
    assert resolved.resolver_id == ctx.admin.id
    assert resolved.resolved_at
    assert resolved.resolution_note == "Reviewed"
    assert {:error, _} = resolve(report, input, ctx.admin)
    assert Ash.read!(Petition, actor: ctx.reporter) == []
    assert {:error, _} = create(Signature, %{petition_id: ctx.petition.id}, ctx.reporter)

    assert {:error, _} =
             create(Comment, %{petition_id: ctx.petition.id, text: "Hello"}, ctx.reporter)

    assert {:error, _} = report(ctx)
  end

  test "comment target determines petition and hide leaves petition available", ctx do
    comment =
      Ash.Seed.seed!(Comment, %{
        petition_id: ctx.petition.id,
        user_id: ctx.reporter.id,
        text: "Personal information"
      })

    assert {:ok, report} =
             create(
               ContentReport,
               %{comment_id: comment.id, petition_id: Ash.UUID.generate(), reason: :privacy},
               ctx.reporter
             )

    assert report.petition_id == ctx.petition.id

    assert {:ok, _} =
             resolve(
               report,
               %{
                 outcome: :resolved,
                 resolution_note: "Removed personal information",
                 hide_content: true
               },
               ctx.superadmin
             )

    assert Ash.read!(Comment, actor: ctx.reporter) == []
    assert [_] = Ash.read!(Petition, actor: ctx.reporter)

    assert {:error, _} =
             comment
             |> Ash.Changeset.for_update(:update, %{text: "Again"}, actor: ctx.reporter)
             |> Ash.update()
  end

  test "removed members cannot report private content and guests or unconfirmed actors cannot report",
       ctx do
    classroom =
      Ash.Seed.seed!(Classroom, %{
        name: "Class",
        professor_id: ctx.admin.id,
        join_code: Ash.UUID.generate()
      })

    petition = Ash.Seed.update!(ctx.petition, %{classroom_id: classroom.id})

    Ash.Seed.seed!(ClassroomMembership, %{
      classroom_id: classroom.id,
      user_id: ctx.reporter.id,
      status: :removed
    })

    assert {:error, _} =
             create(ContentReport, %{petition_id: petition.id, reason: :spam}, ctx.reporter)

    assert {:error, _} = create(ContentReport, %{petition_id: petition.id, reason: :spam}, nil)
    unconfirmed = Ash.Seed.update!(ctx.admin, %{confirmed_at: nil})

    assert {:error, _} =
             create(ContentReport, %{petition_id: petition.id, reason: :spam}, unconfirmed)
  end

  test "invalid resolution cannot hide content and dismiss preserves content", ctx do
    assert {:ok, report} = report(ctx)

    assert {:error, _} =
             resolve(
               report,
               %{outcome: :resolved, resolution_note: "", hide_content: true},
               ctx.admin
             )

    assert {:error, _} =
             resolve(
               report,
               %{outcome: :dismissed, resolution_note: "No violation", hide_content: true},
               ctx.admin
             )

    assert [_] = Ash.read!(Petition, actor: ctx.reporter)

    assert {:ok, dismissed} =
             resolve(report, %{outcome: :dismissed, resolution_note: "No violation"}, ctx.admin)

    assert dismissed.state == :dismissed
    assert [_] = Ash.read!(Petition, actor: ctx.reporter)
  end

  test "support and deletion requests persist without deleting an account", ctx do
    for kind <- [:support, :account_deletion] do
      assert {:ok, request} =
               create(
                 SupportRequest,
                 %{kind: kind, message: "Please help with my account"},
                 ctx.reporter
               )

      assert request.user_id == ctx.reporter.id
      assert request.organization_id == ctx.reporter.organization_id
      assert {:error, _} = resolve(request, %{resolution_note: "Done"}, ctx.reporter)
      assert {:error, _} = resolve(request, %{resolution_note: "Done"}, ctx.outsider)

      assert {:ok, resolved} =
               resolve(request, %{resolution_note: "Contacted the requester"}, ctx.admin)

      assert resolved.state == :resolved
      assert resolved.resolver_id == ctx.admin.id
      assert resolved.resolved_at
      assert {:error, _} = resolve(request, %{resolution_note: "Again"}, ctx.admin)
    end

    assert Ash.get!(User, ctx.reporter.id, authorize?: false)
    assert length(Ash.read!(SupportRequest, actor: ctx.reporter)) == 2
    assert Ash.read!(SupportRequest, actor: ctx.outsider) == []
  end

  test "unmatched campus support is reserved for superadmins", ctx do
    user = Ash.Seed.update!(ctx.reporter, %{organization_id: nil, confirmed_at: nil})

    assert {:ok, request} =
             create(SupportRequest, %{kind: :support, message: "My campus is missing"}, user)

    assert Ash.read!(SupportRequest, actor: ctx.admin) == []
    assert {:error, _} = resolve(request, %{resolution_note: "Done"}, ctx.admin)
    assert {:ok, _} = resolve(request, %{resolution_note: "Contacted campus"}, ctx.superadmin)
    assert {:error, _} = create(SupportRequest, %{kind: :support, message: "Guest"}, nil)
  end

  test "guest contact reads the configured support mailbox" do
    assert {:ok, email} =
             SupportRequest
             |> Ash.ActionInput.for_action(:support_contact, %{})
             |> Ash.run_action()

    assert email == Application.fetch_env!(:petitionu, :email)[:support]
  end

  test "forged ownership and oversized requests are rejected", ctx do
    assert {:error, _} =
             create(
               ContentReport,
               %{petition_id: ctx.petition.id, reason: :spam, reporter_id: ctx.admin.id},
               ctx.reporter
             )

    assert {:error, _} =
             create(
               ContentReport,
               %{
                 petition_id: ctx.petition.id,
                 reason: :spam,
                 details: String.duplicate("x", 5001)
               },
               ctx.reporter
             )

    assert {:error, _} =
             create(
               SupportRequest,
               %{kind: :support, message: "Help", organization_id: ctx.outsider.organization_id},
               ctx.reporter
             )

    assert {:error, _} =
             create(
               SupportRequest,
               %{kind: :support, message: String.duplicate("x", 5001)},
               ctx.reporter
             )
  end

  test "campus-less reports require a superadmin", ctx do
    petition = Ash.Seed.update!(ctx.petition, %{organization_id: nil})

    assert {:ok, report} =
             create(ContentReport, %{petition_id: petition.id, reason: :spam}, ctx.reporter)

    input = %{outcome: :resolved, resolution_note: "Reviewed", hide_content: true}
    assert {:error, _} = resolve(report, input, ctx.admin)
    assert {:ok, _} = resolve(report, input, ctx.superadmin)
  end

  test "a failed audit write rolls back hiding", ctx do
    assert {:ok, report} = report(ctx)
    invalid_resolver = %{ctx.admin | id: Ash.UUIDv7.generate()}

    assert {:error, _} =
             resolve(
               report,
               %{outcome: :resolved, resolution_note: "Review", hide_content: true},
               invalid_resolver
             )

    assert [_] = Ash.read!(Petition, actor: ctx.reporter)
    assert Ash.get!(ContentReport, report.id, actor: ctx.reporter).state == :open
  end
end
