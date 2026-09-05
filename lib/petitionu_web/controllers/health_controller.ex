defmodule PetitionuWeb.HealthController do
  use PetitionuWeb, :controller

  def index(conn, _params) do
    case Ecto.Adapters.SQL.query(Petitionu.Repo, "SELECT 1", [], timeout: 2_000, queue: false) do
      {:ok, _} -> json(conn, %{status: "ok"})
      {:error, _} -> unavailable(conn)
    end
  rescue
    _error in [DBConnection.ConnectionError, Postgrex.Error] -> unavailable(conn)
  catch
    :exit, _reason -> unavailable(conn)
  end

  defp unavailable(conn) do
    conn |> put_status(:service_unavailable) |> json(%{status: "unavailable"})
  end
end
