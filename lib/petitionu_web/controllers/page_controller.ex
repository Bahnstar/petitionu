defmodule PetitionuWeb.PageController do
  use PetitionuWeb, :controller

  def home(conn, _params) do
    redirect(conn, to: "/ash-typescript")
  end

  def index conn, _params do
    render(conn, :index)
  end
end
