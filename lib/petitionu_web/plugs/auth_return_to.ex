defmodule PetitionuWeb.AuthReturnTo do
  @moduledoc "Stores a local application destination before entering authentication."
  import Plug.Conn

  def init(opts), do: opts

  def call(%{method: "GET", request_path: path} = conn, _opts)
      when path in ["/sign-in", "/register", "/reset"] do
    conn = fetch_query_params(conn)

    case conn.query_params do
      %{"return_to" => destination} ->
        store_destination(conn, safe_destination(destination))

      _ ->
        conn
    end
  end

  def call(conn, _opts), do: conn

  defp store_destination(conn, nil), do: delete_session(conn, :return_to)
  defp store_destination(conn, destination), do: put_session(conn, :return_to, destination)

  # Keep destinations inside the React application, excluding authentication loops
  # and encoded path separators that browsers may interpret differently.
  def safe_destination(destination) when is_binary(destination) do
    with {:ok, %{scheme: nil, host: nil, path: path}} when is_binary(path) <-
           URI.new(destination),
         path = URI.decode(path),
         true <- path == "/ash-typescript" or String.starts_with?(path, "/ash-typescript/"),
         false <- String.contains?(path, ["\\", "//", "/../", "/./"]),
         false <- Regex.match?(~r/[\x00-\x20\x7f]/, path) do
      destination
    else
      _ -> nil
    end
  end

  def safe_destination(_), do: nil
end
