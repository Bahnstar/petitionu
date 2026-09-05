defmodule Petitionu.Post.PetitionTest do
  use Petitionu.DataCase, async: false

  alias Petitionu.Accounts.User
  alias Petitionu.Post.{Category, Petition, Signature}

  test "public creation belongs to the actor and contributes to their dashboard" do
    user = Ash.Seed.seed!(User, %{email: "petition-owner@example.edu"})
    category = Ash.Seed.seed!(Category, %{name: "Campus"})

    petition =
      Petition
      |> Ash.Changeset.for_create(
        :create,
        %{title: "Longer library hours", category_id: category.id}, actor: user)
      |> Ash.create!(actor: user)

    assert petition.user_id == user.id

    Ash.Seed.seed!(Signature, %{petition_id: petition.id, user_id: user.id})

    dashboard =
      Ash.load!(user, [:petitions, :num_petitions, :total_petition_signatures], actor: user)

    assert Enum.any?(dashboard.petitions, &(&1.id == petition.id))
    assert dashboard.num_petitions == 1
    assert dashboard.total_petition_signatures == 1
  end
end
