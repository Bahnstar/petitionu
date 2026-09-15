defmodule PetitionuWeb.PageControllerTest do
  use PetitionuWeb.ConnCase

  test "GET / redirects to the SPA", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert redirected_to(conn) == "/ash-typescript"
  end

  test "guest browsing redirects through login", %{conn: conn} do
    conn = get(conn, "/ash-typescript/petitions")
    assert redirected_to(conn) == "/sign-in"
    assert get_session(conn, :return_to) == "/ash-typescript/petitions"
  end

  test "shared petition links load without login", %{conn: conn} do
    conn = get(conn, "/ash-typescript/petitions/01900000-0000-7000-8000-000000000001")
    assert html_response(conn, 200)
  end
end
