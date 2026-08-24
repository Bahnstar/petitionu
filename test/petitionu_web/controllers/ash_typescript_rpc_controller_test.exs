defmodule PetitionuWeb.AshTypescriptRpcControllerTest do
  use PetitionuWeb.ConnCase, async: true

  alias Petitionu.Accounts

  describe "get_users RPC" do
    test "anonymous getUsers succeeds and returns email as null for other users", %{conn: conn} do
      _user =
        Accounts.User
        |> Ash.Changeset.for_create(:register_with_password, %{
          email: "rpc-get-users@example.com",
          password: "password123",
          password_confirmation: "password123"
        })
        |> Ash.create!(authorize?: false)
        |> Ash.Seed.update!(%{first_name: "RPC", last_name: "User"})

      conn =
        post(conn, "/rpc/run", %{
          "action" => "get_users",
          "fields" => ["firstName", "lastName", "email"]
        })

      assert %{"success" => true, "data" => users} = json_response(conn, 200)

      rpc_view = Enum.find(users, &(&1["firstName"] == "RPC"))
      refute is_nil(rpc_view)
      assert rpc_view["lastName"] == "User"
      assert rpc_view["email"] == nil
    end
  end
end
