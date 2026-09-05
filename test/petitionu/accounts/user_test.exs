defmodule Petitionu.Accounts.UserTest do
  use Petitionu.DataCase, async: true

  alias Petitionu.Accounts
  alias Petitionu.Accounts.Organization

  import Ash.Query

  @password "password123"

  defp create_organization! do
    Organization
    |> Ash.Changeset.for_create(:create, %{name: "Test University"})
    |> Ash.create!(authorize?: false)
  end

  defp create_user!(attrs) do
    attrs = Map.merge(%{first_name: "Test", last_name: "User", role: :student}, Map.new(attrs))

    user =
      Accounts.User
      |> Ash.Changeset.for_create(:register_with_password, %{
        email: attrs.email,
        password: @password,
        password_confirmation: @password
      })
      |> Ash.create!(authorize?: false)

    Ash.Seed.update!(
      user,
      Map.take(attrs, [
        :first_name,
        :last_name,
        :student_id,
        :graduation_year,
        :role,
        :organization_id
      ])
    )
  end

  describe "reading users" do
    test "anonymous user reads return no profiles or inverse activity" do
      create_user!(email: "other-user@example.com", first_name: "Jane", last_name: "Doe")

      users =
        Accounts.User
        |> for_read(:read_users)
        |> load([
          :petitions,
          :signatures,
          :num_petitions,
          :num_signed,
          :total_petition_signatures
        ])
        |> Ash.read!(actor: nil)

      assert users == []
      public_attrs = Accounts.User |> Ash.Resource.Info.public_attributes() |> Enum.map(& &1.name)
      refute :student_id in public_attrs
      refute :hashed_password in public_attrs
    end

    test "(b) a user reading their own record sees email/role/stats" do
      user =
        create_user!(
          email: "self-owner@example.com",
          first_name: "Ada",
          last_name: "Lovelace",
          student_id: "S777",
          graduation_year: 2026
        )

      own_view =
        Accounts.User
        |> for_read(:read_users)
        |> load([:num_petitions, :num_signed, :num_petition_signees])
        |> load(:total_petition_signatures)
        |> Ash.read!(actor: user)
        |> Enum.find(&(&1.id == user.id))

      assert own_view.first_name == "Ada"
      assert own_view.last_name == "Lovelace"
      assert to_string(own_view.email) == "self-owner@example.com"
      assert own_view.role == :student
      assert own_view.student_id == "S777"
      assert own_view.graduation_year == 2026
      assert own_view.num_petitions == 0
      assert own_view.num_signed == 0
      assert own_view.num_petition_signees == 0
    end

    test "reading another user by id returns no profile" do
      actor = create_user!(email: "reader@example.com", first_name: "Reader", last_name: "One")

      other =
        create_user!(
          email: "target@example.com",
          first_name: "Target",
          last_name: "Two",
          role: :professor
        )

      other_view =
        Accounts.User
        |> for_read(:read_by_id, %{id: other.id, include_stats: true})
        |> Ash.read_one!(actor: actor)

      assert is_nil(other_view)
    end

    test "(d) set_role still requires an admin actor" do
      organization = create_organization!()

      admin =
        create_user!(
          email: "admin-role@example.com",
          role: :admin,
          organization_id: organization.id
        )

      student = create_user!(email: "student-role@example.com", role: :student)

      target =
        create_user!(
          email: "target-role@example.com",
          role: :student,
          organization_id: organization.id
        )

      assert {:error, %Ash.Error.Forbidden{}} =
               target
               |> Ash.Changeset.for_update(:set_role, %{role: :admin}, actor: student)
               |> Ash.update(actor: student)

      assert {:ok, %Accounts.User{} = updated} =
               target
               |> Ash.Changeset.for_update(:set_role, %{role: :professor}, actor: admin)
               |> Ash.update(actor: admin)

      own_read =
        Accounts.User
        |> Ash.Query.for_read(:read_users)
        |> Ash.read!(actor: target)
        |> Enum.find(&(&1.id == updated.id))

      assert own_read.role == :professor

      assert {:error, %Ash.Error.Invalid{}} =
               target
               |> Ash.Changeset.for_update(:set_role, %{role: :superadmin}, actor: admin)
               |> Ash.update(actor: admin)

      superadmin = create_user!(email: "global-role@example.com", role: :superadmin)

      assert {:ok, _updated} =
               target
               |> Ash.Changeset.for_update(:set_role, %{role: :admin}, actor: superadmin)
               |> Ash.update(actor: superadmin)

      assert {:error, %Ash.Error.Forbidden{}} =
               target
               |> Ash.Changeset.for_update(:set_role, %{role: :admin})
               |> Ash.update(actor: nil)
    end

    test "an admin can read sensitive fields for users in the same organization" do
      organization = create_organization!()

      admin =
        create_user!(
          email: "org-admin@example.com",
          role: :admin,
          organization_id: organization.id
        )

      target =
        create_user!(
          email: "org-target@example.com",
          role: :student,
          organization_id: organization.id
        )

      target_view =
        Accounts.User
        |> for_read(:read_by_id, %{id: target.id, include_stats: true})
        |> Ash.read_one!(actor: admin)

      assert to_string(target_view.email) == "org-target@example.com"
      assert target_view.role == :student
      assert %Ash.ForbiddenField{} = target_view.num_petitions
    end

    test "an admin cannot read sensitive fields outside their organization" do
      admin_org = create_organization!()
      other_org = create_organization!()

      admin =
        create_user!(
          email: "scoped-admin@example.com",
          role: :admin,
          organization_id: admin_org.id
        )

      target =
        create_user!(
          email: "other-org@example.com",
          role: :student,
          organization_id: other_org.id
        )

      target_view =
        Accounts.User
        |> for_read(:read_by_id, %{id: target.id, include_stats: true})
        |> Ash.read_one!(actor: admin)

      assert is_nil(target_view)
    end

    test "a superadmin can read sensitive fields across organizations" do
      organization = create_organization!()
      superadmin = create_user!(email: "global-admin@example.com", role: :superadmin)

      target =
        create_user!(
          email: "global-target@example.com",
          role: :student,
          organization_id: organization.id
        )

      target_view =
        Accounts.User
        |> for_read(:read_by_id, %{id: target.id, include_stats: true})
        |> Ash.read_one!(actor: superadmin)

      assert to_string(target_view.email) == "global-target@example.com"
      assert target_view.role == :student
      assert %Ash.ForbiddenField{} = target_view.num_petitions
    end
  end

  describe "ash_authentication internal flows" do
    test "sign_in_with_password still works (internal reads bypass field policies)" do
      user = create_user!(email: "signin@example.com", first_name: "Sign", last_name: "In")

      assert {:ok, signed_in} =
               Accounts.User
               |> Ash.Query.for_read(:sign_in_with_password, %{
                 email: "signin@example.com",
                 password: @password
               })
               |> Ash.read_one()

      assert signed_in.id == user.id
      refute is_nil(signed_in.__metadata__.token)

      assert %Ash.ForbiddenField{} = signed_in.email
      assert %Ash.ForbiddenField{} = signed_in.role
    end

    test "get_by_email internal read (used by password reset) keeps email/role" do
      user = create_user!(email: "reset@example.com", first_name: "Reset", last_name: "Me")

      assert {:ok, found} =
               Accounts.User
               |> Ash.Query.new()
               |> Ash.Query.set_context(%{private: %{ash_authentication?: true}})
               |> Ash.Query.for_read(:get_by_email, %{email: "reset@example.com"})
               |> Ash.read_one()

      assert found.id == user.id
      assert to_string(found.email) == "reset@example.com"
      assert found.role == :student
    end

    test "actor loaded via subject_to_user keeps email/role (drives role-based policies)" do
      admin =
        create_user!(
          email: "admindata@example.com",
          first_name: "Admin",
          last_name: "Data",
          role: :admin
        )

      assert {:ok, loaded} =
               AshAuthentication.subject_to_user(
                 AshAuthentication.user_to_subject(admin),
                 Accounts.User
               )

      assert loaded.id == admin.id
      assert loaded.role == :admin
      assert to_string(loaded.email) == "admindata@example.com"
    end
  end
end
