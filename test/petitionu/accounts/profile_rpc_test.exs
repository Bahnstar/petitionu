defmodule Petitionu.Accounts.ProfileRpcTest do
  use Petitionu.DataCase, async: true

  alias Petitionu.Accounts.{Organization, User}

  defp rpc(actor, params) do
    conn = Plug.Test.conn(:post, "/rpc/run") |> Ash.PlugHelpers.set_actor(actor)
    AshTypescript.Rpc.run_action(:petitionu, conn, params)
  end

  test "actor-scoped RPC updates self even for an admin and returns profile fields" do
    organization = Ash.Seed.seed!(Organization, %{name: "RPC Campus", domain: "rpc.edu"})

    other =
      Ash.Seed.seed!(User, %{
        email: "other-#{System.unique_integer([:positive])}@rpc.edu",
        organization_id: organization.id
      })

    actor =
      Ash.Seed.seed!(User, %{
        email: "admin-#{System.unique_integer([:positive])}@rpc.edu",
        confirmed_at: DateTime.utc_now(),
        role: :admin,
        organization_id: organization.id
      })

    assert %{"success" => true, "data" => data} =
             rpc(actor, %{
               "action" => "update_my_profile",
               "input" => %{
                 "firstName" => "RPC",
                 "lastName" => "Person",
                 "graduationYear" => 2028
               },
               "fields" => [
                 "id",
                 "emailVerified",
                 "profileComplete",
                 "organizationId",
                 %{"organization" => ["name"]}
               ]
             })

    assert data["id"] == actor.id
    assert data["emailVerified"] == true
    assert data["profileComplete"] == true
    assert data["organizationId"] == organization.id
    assert data["organization"]["name"] == "RPC Campus"
    assert Ash.get!(User, other.id, authorize?: false).first_name == nil
  end

  test "anonymous RPC updates and forged authority inputs are rejected" do
    actor =
      Ash.Seed.seed!(User, %{
        email: "forged-#{System.unique_integer([:positive])}@rpc.edu",
        confirmed_at: DateTime.utc_now()
      })

    params = %{
      "action" => "update_my_profile",
      "input" => %{"firstName" => "RPC", "lastName" => "Person", "graduationYear" => 2028},
      "fields" => ["id"]
    }

    assert %{"success" => false} = rpc(nil, params)

    for {field, value} <- [
          {"role", "superadmin"},
          {"email", "other@rpc.edu"},
          {"organizationId", Ash.UUID.generate()},
          {"confirmedAt", DateTime.utc_now() |> DateTime.to_iso8601()}
        ] do
      assert %{"success" => false} = rpc(actor, put_in(params, ["input", field], value))
    end
  end
end
