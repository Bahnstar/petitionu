defmodule Petitionu.Accounts.ActivityPrivacyTest do
  use Petitionu.DataCase, async: true
  alias Petitionu.Accounts.{Organization, User}
  alias Petitionu.Post.{Petition, Signature}

  setup do
    campus = Ash.Seed.seed!(Organization, %{name: "Activity campus"})

    owner =
      Ash.Seed.seed!(User, %{
        email: "owner-#{System.unique_integer([:positive])}@activity.test",
        organization_id: campus.id
      })

    petition =
      Ash.Seed.seed!(Petition, %{
        title: "Private author",
        description: "Example",
        is_anonymous: true,
        user_id: owner.id
      })

    signature = Ash.Seed.seed!(Signature, %{user_id: owner.id, petition_id: petition.id})
    %{campus: campus, owner: owner, petition: petition, signature: signature}
  end

  test "administrators cannot load another user's petition or signature activity", context do
    for role <- [:admin, :superadmin] do
      actor = operator(role, context.campus)

      result =
        rpc(actor, %{
          "action" => "get_user_by_id",
          "input" => %{"id" => context.owner.id, "includeStats" => true},
          "fields" => [
            "id",
            "numPetitions",
            "numSigned",
            "totalPetitionSignatures",
            %{"petitions" => ["id"]},
            %{"signatures" => ["id", "petitionId"]}
          ]
        })

      encoded = Jason.encode!(result)
      refute encoded =~ context.petition.id
      refute encoded =~ context.signature.id
      assert get_in(result, ["data", "numPetitions"]) in [nil, 0]
      assert get_in(result, ["data", "numSigned"]) in [nil, 0]
      assert get_in(result, ["data", "totalPetitionSignatures"]) in [nil, 0]
    end
  end

  test "activity cannot be used to filter or sort user identities", context do
    for role <- [:admin, :superadmin],
        selector <- [
          %{"filter" => %{"petitions" => %{"id" => %{"eq" => context.petition.id}}}},
          %{"filter" => %{"signatures" => %{"id" => %{"eq" => context.signature.id}}}},
          %{"filter" => %{"numPetitions" => %{"eq" => 1}}},
          %{"sort" => "numSigned"}
        ] do
      result =
        rpc(
          operator(role, context.campus),
          Map.merge(%{"action" => "get_users", "fields" => ["id"]}, selector)
        )

      assert result["success"] == false
    end
  end

  test "owners retain their own dashboard activity", context do
    assert %{"success" => true, "data" => data} =
             rpc(context.owner, %{
               "action" => "get_user_by_id",
               "input" => %{"id" => context.owner.id, "includeStats" => true},
               "fields" => [
                 "numPetitions",
                 "numSigned",
                 %{"petitions" => ["id"]},
                 %{"signatures" => ["id"]}
               ]
             })

    assert data["numPetitions"] == 1
    assert data["numSigned"] == 1
    assert data["petitions"] == [%{"id" => context.petition.id}]
    assert data["signatures"] == [%{"id" => context.signature.id}]
  end

  defp operator(role, campus),
    do:
      Ash.Seed.seed!(User, %{
        email: "#{role}-#{System.unique_integer([:positive])}@activity.test",
        role: role,
        organization_id: campus.id
      })

  defp rpc(actor, params),
    do:
      AshTypescript.Rpc.run_action(
        :petitionu,
        Plug.Test.conn(:post, "/rpc/run") |> Ash.PlugHelpers.set_actor(actor),
        params
      )
end
