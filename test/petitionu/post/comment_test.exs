defmodule Petitionu.Post.CommentTest do
  use Petitionu.DataCase, async: false

  alias Petitionu.Accounts.Organization
  alias Petitionu.Accounts.User
  alias Petitionu.Post.Category
  alias Petitionu.Post.Comment
  alias Petitionu.Post.Petition

  setup do
    organization =
      Organization
      |> Ash.Changeset.for_create(:create, %{
        name: "Test University",
        description: "A test university",
        domain: "test.edu",
        allow_public_signatures: true
      })
      |> Ash.create!(authorize?: false)

    category =
      Category
      |> Ash.Changeset.for_create(:create, %{
        name: "Academic",
        description: "Academic petitions",
        organization_id: organization.id
      })
      |> Ash.create!(authorize?: false)

    user = create_user("alice@example.com", organization)
    other_user = create_user("bob@example.com", organization)

    petition =
      Petition
      |> Ash.Seed.seed!(%{
        title: "Test petition",
        description: "A petition used by comment tests",
        goal: 100,
        status: :open,
        user_id: user.id,
        category_id: category.id
      })

    %{user: user, other_user: other_user, petition: petition}
  end

  defp create_user(email, organization) do
    User
    |> Ash.Changeset.for_create(:register_with_password, %{
      email: email,
      password: "password123",
      password_confirmation: "password123"
    })
    |> Ash.create!(authorize?: false)
    |> Ash.Seed.update!(%{
      first_name: "Test",
      last_name: "Student",
      confirmed_at: DateTime.utc_now(),
      organization_id: organization.id
    })
  end

  defp create_comment(text, petition, user) do
    Comment
    |> Ash.Changeset.for_create(:create, %{text: text, petition_id: petition.id}, actor: user)
    |> Ash.create!(actor: user)
  end

  describe "create" do
    test "sets user_id from the authenticated actor", %{user: user, petition: petition} do
      comment = create_comment("Love this!", petition, user)

      assert comment.user_id == user.id
      assert comment.petition_id == petition.id
      assert comment.text == "Love this!"
    end

    test "rejects a client-supplied user_id", %{
      user: user,
      other_user: other_user,
      petition: petition
    } do
      # The action no longer declares a user_id argument, so a spoofed value
      # is rejected instead of being honored.
      assert_raise Ash.Error.Invalid, ~r/user_id/, fn ->
        Comment
        |> Ash.Changeset.for_create(
          :create,
          %{
            text: "Spoofed author",
            petition_id: petition.id,
            user_id: other_user.id
          },
          actor: user
        )
        |> Ash.create!(actor: user)
      end
    end

    test "accepts a petition_id of a petition whose id is a uuid_v7",
         %{user: user, petition: petition} do
      # Petition.id is a uuid_v7; the petition_id argument must cast it
      comment = create_comment("uuid_v7 petition id works", petition, user)

      assert comment.petition_id == petition.id
    end

    test "is forbidden without an authenticated actor", %{petition: petition} do
      changeset =
        Comment
        |> Ash.Changeset.for_create(:create, %{text: "anon", petition_id: petition.id})

      assert_raise Ash.Error.Invalid, fn ->
        Ash.create!(changeset)
      end
    end
  end

  describe "update/destroy" do
    test "allows the author to update and destroy their comment",
         %{user: user, petition: petition} do
      comment = create_comment("original", petition, user)

      updated =
        comment
        |> Ash.Changeset.for_update(:update, %{text: "edited"})
        |> Ash.update!(actor: user)

      assert updated.text == "edited"

      Ash.destroy!(updated, actor: user)

      require Ash.Query
      assert Ash.read!(Ash.Query.filter(Comment, id == ^updated.id)) == []
    end

    test "forbids a non-author from updating",
         %{user: user, other_user: other_user, petition: petition} do
      comment = create_comment("original", petition, user)

      assert_raise Ash.Error.Forbidden, fn ->
        comment
        |> Ash.Changeset.for_update(:update, %{text: "hacked"})
        |> Ash.update!(actor: other_user)
      end
    end

    test "forbids a non-author from destroying",
         %{user: user, other_user: other_user, petition: petition} do
      comment = create_comment("original", petition, user)

      assert_raise Ash.Error.Forbidden, fn ->
        Ash.destroy!(comment, actor: other_user)
      end
    end
  end

  describe "read" do
    test "comments are readable without an authenticated actor",
         %{user: user, petition: petition} do
      comment = create_comment("public comment", petition, user)

      fetched = Ash.get!(Comment, comment.id)

      assert fetched.id == comment.id
      assert fetched.user_id == user.id
      assert fetched.text == "public comment"
    end
  end
end
