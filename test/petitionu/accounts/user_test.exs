defmodule Petitionu.Accounts.UserTest do
  use Petitionu.DataCase, async: true

  alias Petitionu.Accounts

  import Ash.Query

  @password "password123"

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
      Map.take(attrs, [:first_name, :last_name, :student_id, :graduation_year, :role])
    )
  end

  describe "reading users" do
    test "(a) anonymous read of users succeeds and returns first/last name but not email/role/stats" do
      other =
        create_user!(
          email: "other-user@example.com",
          first_name: "Jane",
          last_name: "Doe",
          student_id: "S12345",
          graduation_year: 2025,
          role: :admin
        )

      users =
        Accounts.User
        |> for_read(:read_users)
        |> load([:num_petitions, :num_signed, :num_petition_signees])
        |> load(:total_petition_signatures)
        |> Ash.read!(actor: nil)

      assert users != []

      anonymous_view = Enum.find(users, &(&1.id == other.id))
      refute is_nil(anonymous_view)

      # Public display fields stay visible to anonymous visitors
      assert anonymous_view.first_name == "Jane"
      assert anonymous_view.last_name == "Doe"

      # Sensitive fields are hidden from anonymous visitors
      assert %Ash.ForbiddenField{} = anonymous_view.email
      assert %Ash.ForbiddenField{} = anonymous_view.role
      assert %Ash.ForbiddenField{} = anonymous_view.graduation_year
      assert %Ash.ForbiddenField{} = anonymous_view.num_petitions
      assert %Ash.ForbiddenField{} = anonymous_view.num_signed
      assert %Ash.ForbiddenField{} = anonymous_view.num_petition_signees
      assert %Ash.ForbiddenField{} = anonymous_view.total_petition_signatures

      # student_id is a private (non-public) attribute: it is never included
      # in public interfaces (RPC responses / generated client), even though
      # plain Ash reads still see it.
      public_attrs =
        Accounts.User
        |> Ash.Resource.Info.public_attributes()
        |> Enum.map(& &1.name)

      refute :student_id in public_attrs
      assert :hashed_password not in public_attrs
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

    test "(c) reading another user's record by id hides email/role/stats" do
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

      refute is_nil(other_view)
      assert other_view.first_name == "Target"
      assert other_view.last_name == "Two"

      assert %Ash.ForbiddenField{} = other_view.email
      assert %Ash.ForbiddenField{} = other_view.role
      assert %Ash.ForbiddenField{} = other_view.num_petitions
      assert %Ash.ForbiddenField{} = other_view.num_signed
      assert %Ash.ForbiddenField{} = other_view.num_petition_signees
      assert %Ash.ForbiddenField{} = other_view.total_petition_signatures
    end

    test "(d) set_role still requires an admin actor" do
      admin = create_user!(email: "admin-role@example.com", role: :admin)
      student = create_user!(email: "student-role@example.com", role: :student)
      target = create_user!(email: "target-role@example.com", role: :student)

      # A non-admin actor is forbidden from changing roles
      assert {:error, %Ash.Error.Forbidden{}} =
               target
               |> Ash.Changeset.for_update(:set_role, %{role: :admin}, actor: student)
               |> Ash.update(actor: student)

      # The updated record, returned to an admin acting on another user,
      # has role scrubbed (role is only visible to the user themself), so
      # verify the write succeeded by reading the target as the target.
      assert {:ok, %Accounts.User{} = updated} =
               target
               |> Ash.Changeset.for_update(:set_role, %{role: :professor}, actor: admin)
               |> Ash.update(actor: admin)

      # The target's own read now shows the new role.
      own_read =
        Accounts.User
        |> Ash.Query.for_read(:read_users)
        |> Ash.read!(actor: target)
        |> Enum.find(&(&1.id == updated.id))

      assert own_read.role == :professor

      # Anonymous actors are forbidden as well
      assert {:error, %Ash.Error.Forbidden{}} =
               target
               |> Ash.Changeset.for_update(:set_role, %{role: :admin})
               |> Ash.update(actor: nil)
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

      # The record returned by the sign-in action itself has its sensitive
      # fields scrubbed (the actor that would authorize them isn't present
      # yet), so clients must use `getMe` to load the full profile.
      assert %Ash.ForbiddenField{} = signed_in.email
      assert %Ash.ForbiddenField{} = signed_in.role
    end

    test "get_by_email internal read (used by password reset) keeps email/role" do
      user = create_user!(email: "reset@example.com", first_name: "Reset", last_name: "Me")

      # Mirrors AshAuthentication.Strategy.Password.RequestPasswordReset.run/5,
      # which reads the user with `private.ash_authentication?: true` set.
      # The private context is only set by AshAuthentication's own internals
      # (the public RPC pipeline forwards only `shared` context), so this
      # exemption cannot be triggered by anonymous clients; their
      # get_user_by_email calls get these fields scrubbed.
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
