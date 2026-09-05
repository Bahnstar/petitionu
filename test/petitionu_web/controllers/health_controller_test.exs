defmodule PetitionuWeb.HealthControllerTest do
  use PetitionuWeb.ConnCase, async: true

  test "readiness checks the database without exposing details", %{conn: conn} do
    conn = PetitionuWeb.HealthController.index(conn, %{})
    assert json_response(conn, 200) == %{"status" => "ok"}
  end
end
