defmodule PetitionuWeb.PageControllerTest do
  use PetitionuWeb.ConnCase

  test "GET / redirects to the SPA", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert redirected_to(conn) == "/ash-typescript"
  end
end
