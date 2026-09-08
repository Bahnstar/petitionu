defmodule Petitionu.Accounts.SchoolRegistry do
  @moduledoc """
  Checks a school domain against its authoritative WHOIS registry.

  A match confirms the domain's registry entry, not current accreditation.
  Only the domain, registrant name, and registry server are retained.
  """

  alias Petitionu.Accounts.EmailDomain

  @type result ::
          {:ok, %{name: String.t(), source: String.t()}}
          | {:error, :unavailable | :not_found | :inconclusive | :unsupported_domain}
  @callback lookup(String.t()) :: result()

  def lookup(domain, transport \\ &query/2) do
    with {:ok, server} <- server(domain),
         {:ok, response} <- transport.(server, domain) do
      parse(domain, server, response)
    end
  end

  defp server(domain) do
    cond do
      EmailDomain.from_email("registry@" <> domain) != domain -> {:error, :unsupported_domain}
      EmailDomain.school_domain(domain) != domain -> {:error, :unsupported_domain}
      String.ends_with?(domain, ".edu") -> {:ok, "whois.educause.edu"}
      String.ends_with?(domain, ".ac.uk") -> {:ok, "whois.ja.net"}
      true -> {:error, :unsupported_domain}
    end
  end

  defp parse(domain, server, response) do
    response = String.replace(response, "\r\n", "\n")

    if String.valid?(response) do
      {domain_pattern, name_pattern} = patterns(server)
      registered_domain = field(response, domain_pattern)
      name = field(response, name_pattern)

      cond do
        registered_domain && String.downcase(registered_domain) == domain && name &&
            byte_size(name) <= 512 ->
          {:ok, %{name: name, source: server}}

        Regex.match?(~r/^(?:No match for|NOT FOUND|No such domain)\b/im, response) ->
          {:error, :not_found}

        true ->
          {:error, :inconclusive}
      end
    else
      {:error, :inconclusive}
    end
  end

  defp patterns("whois.educause.edu") do
    {~r/^Domain Name:[ \t]*([^\r\n]+)$/im, ~r/^Registrant:[ \t]*\r?\n[ \t]+([^\r\n]+)$/im}
  end

  defp patterns("whois.ja.net") do
    {~r/^Domain:[ \t]*\r?\n[ \t]+([^\r\n]+)$/im,
     ~r/^Registered For:[ \t]*\r?\n[ \t]+([^\r\n]+)$/im}
  end

  defp field(response, pattern) do
    case Regex.run(pattern, response) do
      [_, value] ->
        case String.trim(value) do
          "" -> nil
          value -> value
        end

      nil ->
        nil
    end
  end

  defp query(server, domain) do
    case :gen_tcp.connect(String.to_charlist(server), 43, [:binary, active: false], 5_000) do
      {:ok, socket} ->
        try do
          with :ok <- :gen_tcp.send(socket, domain <> "\r\n") do
            receive_response(socket, "", System.monotonic_time(:millisecond) + 10_000)
          else
            {:error, _} -> {:error, :unavailable}
          end
        after
          :gen_tcp.close(socket)
        end

      {:error, _} ->
        {:error, :unavailable}
    end
  end

  defp receive_response(_socket, response, _deadline) when byte_size(response) > 131_072,
    do: {:error, :inconclusive}

  defp receive_response(socket, response, deadline) do
    remaining = deadline - System.monotonic_time(:millisecond)

    if remaining <= 0 do
      {:error, :unavailable}
    else
      case :gen_tcp.recv(socket, 0, remaining) do
        {:ok, chunk} -> receive_response(socket, response <> chunk, deadline)
        {:error, :closed} -> {:ok, response}
        {:error, _} -> {:error, :unavailable}
      end
    end
  end
end
