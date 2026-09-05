defmodule PetitionuWeb.AuthReturnToTest do
  use ExUnit.Case, async: true

  import Plug.Conn
  import Plug.Test
  alias PetitionuWeb.AuthReturnTo

  test "captures query and fragment on entry and preserves it through registration" do
    destination = "/ash-typescript/create?classroomId=class-1#details"

    conn =
      conn(:get, "/sign-in?" <> URI.encode_query(%{return_to: destination}))
      |> init_test_session(%{})
      |> AuthReturnTo.call([])

    assert get_session(conn, :return_to) == destination

    registration =
      conn(:get, "/register")
      |> init_test_session(get_session(conn))
      |> AuthReturnTo.call([])

    assert get_session(registration, :return_to) == destination
  end

  test "ignores destinations supplied outside authentication entry pages" do
    conn =
      conn(:get, "/ash-typescript?return_to=/ash-typescript/create")
      |> init_test_session(%{})
      |> AuthReturnTo.call([])

    assert get_session(conn, :return_to) == nil
  end

  test "rejects external URLs, authentication loops, malformed values and path tricks" do
    for destination <- [
          nil,
          %{},
          ["/ash-typescript"],
          "https://example.com",
          "//example.com",
          "/\\example.com",
          "/sign-in",
          "/auth/user/password/sign_in",
          "/ash-typescript/../sign-in",
          "/ash-typescript/%2e%2e/sign-in",
          "/ash-typescript/%5cexample.com",
          "/ash-typescript\n"
        ] do
      assert AuthReturnTo.safe_destination(destination) == nil
    end
  end

  test "invalid entry clears an older destination" do
    conn =
      conn(:get, "/sign-in?return_to=https://example.com")
      |> init_test_session(%{return_to: "/ash-typescript/create"})
      |> AuthReturnTo.call([])

    assert get_session(conn, :return_to) == nil
  end
end
