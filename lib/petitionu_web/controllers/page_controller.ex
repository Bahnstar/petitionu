defmodule PetitionuWeb.PageController do
  use PetitionuWeb, :controller

  def home(conn, _params) do
    redirect(conn, to: "/ash-typescript")
  end

  def index(%{assigns: %{current_user: nil}} = conn, %{"path" => ["petitions"]}) do
    conn
    |> put_session(:return_to, "/ash-typescript/petitions")
    |> redirect(to: "/sign-in")
  end

  def index(conn, _params) do
    render(conn, :index)
  end
end
