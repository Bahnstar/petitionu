defmodule Petitionu.Accounts.ProfileTest do
  use Petitionu.DataCase, async: true

  alias Petitionu.Accounts.{Organization, User}
  require Ash.Query

  defp user!(attrs \\ %{}) do
    Ash.Seed.seed!(
      User,
      Map.merge(
        %{
          email: "profile-#{System.unique_integer([:positive])}@campus.edu",
          confirmed_at: DateTime.utc_now()
        },
        attrs
      )
    )
  end

  defp organization!(domain \\ "campus.edu") do
    Ash.Seed.seed!(Organization, %{name: "Campus", domain: domain})
  end

  defp save_profile(user, attrs, actor) do
    user
    |> Ash.Changeset.for_update(:update_my_profile, attrs, actor: actor)
    |> Ash.update()
  end

  @profile %{first_name: "Ada", last_name: "Lovelace", graduation_year: 2028}

  test "profile is saved for the actor and campus comes from the exact confirmed email domain" do
    organization = organization!("  CAMPUS.edu  ")
    user = user!()
    assert {:ok, updated} = save_profile(user, @profile, user)
    assert updated.organization_id == organization.id
    assert updated.first_name == "Ada"

    own =
      User
      |> Ash.Query.for_read(:me, %{}, actor: updated)
      |> Ash.Query.load([:email_verified, :profile_complete, organization: [:name]])
      |> Ash.read_one!()

    assert own.email_verified
    assert own.profile_complete
    assert own.organization.name == "Campus"
  end

  test "unconfirmed accounts cannot save a participating profile" do
    organization!()
    user = user!(%{confirmed_at: nil})
    assert {:error, error} = save_profile(user, @profile, user)
    assert Exception.message(error) =~ "Confirm your email"
  end

  test "unknown, suffix and ambiguous campus domains require support" do
    organization!("othercampus.edu")
    user = user!()
    assert {:error, error} = save_profile(user, @profile, user)
    assert Exception.message(error) =~ "support"
    organization!()
    organization!(" CAMPUS.EDU ")
    assert {:error, error} = save_profile(user, @profile, user)
    assert Exception.message(error) =~ "support"
  end

  test "required names and optional graduation year are validated" do
    organization!()
    user = user!()

    for attrs <- [
          %{@profile | first_name: "  "},
          %{@profile | last_name: nil},
          %{@profile | graduation_year: 12}
        ] do
      assert {:error, %Ash.Error.Invalid{}} = save_profile(user, attrs, user)
    end
  end

  test "graduation year is optional and name whitespace is trimmed" do
    organization!()
    user = user!()

    assert {:ok, updated} =
             save_profile(user, %{first_name: "  Ada  ", last_name: "  Lovelace  "}, user)

    assert updated.first_name == "Ada"
    assert updated.last_name == "Lovelace"
    assert is_nil(updated.graduation_year)
    assert Ash.load!(updated, :profile_complete, actor: updated).profile_complete
  end

  test "profile cannot update another user or accept identity and authority fields" do
    organization!()
    user = user!()
    other = user!()
    assert {:error, _} = save_profile(other, @profile, user)

    for attrs <- [
          %{role: :superadmin},
          %{organization_id: Ash.UUID.generate()},
          %{email: "other@campus.edu"},
          %{confirmed_at: DateTime.utc_now()}
        ] do
      assert {:error, %Ash.Error.Invalid{}} = save_profile(user, Map.merge(@profile, attrs), user)
    end
  end

  test "public and unrelated user reads cannot expose inverse activity or filter ownership" do
    owner = user!()
    viewer = user!()

    petition =
      Ash.Seed.seed!(Petitionu.Post.Petition, %{
        title: "Anonymous",
        description: "Private owner",
        user_id: owner.id,
        is_anonymous: true
      })

    signature =
      Ash.Seed.seed!(Petitionu.Post.Signature, %{petition_id: petition.id, user_id: owner.id})

    for actor <- [nil, viewer] do
      query =
        User
        |> Ash.Query.for_read(:read_users, %{}, actor: actor)
        |> Ash.Query.filter(id == ^owner.id)
        |> Ash.Query.load([
          :petitions,
          :signatures,
          :num_petitions,
          :num_signed,
          :total_petition_signatures
        ])

      assert Ash.read!(query) == []

      query =
        User
        |> Ash.Query.for_read(:read_users, %{}, actor: actor)
        |> Ash.Query.filter(exists(petitions, id == ^petition.id))

      assert Ash.read!(query) == []

      query =
        User
        |> Ash.Query.for_read(:read_users, %{}, actor: actor)
        |> Ash.Query.filter(exists(signatures, id == ^signature.id))

      assert Ash.read!(query) == []

      query =
        User
        |> Ash.Query.for_read(:read_users, %{}, actor: actor)
        |> Ash.Query.filter(num_signed > 0)
        |> Ash.Query.sort(:num_petitions)

      assert {:error, _} = Ash.read(query)
    end
  end

  test "org admins cannot change other campuses, unassigned users, or superadmins" do
    organization = organization!()
    admin = user!(%{organization_id: organization.id, role: :admin})

    for target <- [
          user!(),
          user!(%{organization_id: organization!().id}),
          user!(%{organization_id: organization.id, role: :superadmin})
        ] do
      assert {:error, _} =
               target
               |> Ash.Changeset.for_update(:set_role, %{role: :student}, actor: admin)
               |> Ash.update()
    end

    target = user!(%{organization_id: organization.id})

    assert {:ok, updated} =
             target
             |> Ash.Changeset.for_update(:set_role, %{role: :professor}, actor: admin)
             |> Ash.update()

    assert updated.role == :professor
  end
end
