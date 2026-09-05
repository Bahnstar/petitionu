defmodule Petitionu.Post.PetitionChangesetTest do
  use ExUnit.Case, async: true

  alias Petitionu.Accounts.User
  alias Petitionu.Post.Petition

  test "public creation assigns the actor's user ID before persistence" do
    user = %User{id: "01900000-0000-7000-8000-000000000001"}

    changeset =
      Ash.Changeset.for_create(
        Petition,
        :create,
        %{title: "Library hours", category_id: "01900000-0000-7000-8000-000000000002"},
        actor: user
      )

    assert changeset.valid?
    assert Ash.Changeset.get_attribute(changeset, :user_id) == user.id
  end
end
