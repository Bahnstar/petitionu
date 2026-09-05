defmodule PetitionuWeb.AuthControllerTest do
  use ExUnit.Case, async: true

  import Plug.Conn
  import Plug.Test
  import Phoenix.ConnTest, only: [redirected_to: 1]

  defp enter_auth(path, destination) do
    conn(:get, path <> "?" <> URI.encode_query(%{return_to: destination}))
    |> init_test_session(%{})
    |> PetitionuWeb.AuthReturnTo.call([])
    |> Phoenix.Controller.fetch_flash()
  end

  alias PetitionuWeb.AuthController

  test "sign-in stores the full local destination" do
    destination = "/ash-typescript/create?classroomId=class-1#details"
    conn = enter_auth("/sign-in", destination)
    assert get_session(conn, :return_to) == destination
  end

  test "registration stores the destination too" do
    conn = enter_auth("/register", "/ash-typescript/dashboard")
    assert get_session(conn, :return_to) == "/ash-typescript/dashboard"
  end

  test "authentication failures retain the destination" do
    conn = enter_auth("/sign-in", "/ash-typescript/create")
    conn = AuthController.failure(conn, {:password, :sign_in}, :invalid_credentials)
    assert get_session(conn, :return_to) == "/ash-typescript/create"
  end

  test "success consumes the destination" do
    user = %Petitionu.Accounts.User{
      id: "11111111-1111-4111-8111-111111111111",
      __metadata__: %{token: "test-session-token"}
    }

    destination = "/ash-typescript/create?classroomId=class-1#details"
    conn = enter_auth("/sign-in", destination)
    conn = AuthController.success(conn, {:password, :sign_in}, user, nil)
    assert redirected_to(conn) == destination
    assert get_session(conn, :return_to) == nil
  end

  test "unsafe destinations cannot become redirects" do
    for destination <- [
          "https://example.com",
          "//example.com",
          "/\\example.com",
          "/%5cexample.com",
          "/sign-in",
          "/auth/user/password/sign_in"
        ] do
      result = enter_auth("/sign-in", destination)
      assert get_session(result, :return_to) == nil
    end
  end
end
