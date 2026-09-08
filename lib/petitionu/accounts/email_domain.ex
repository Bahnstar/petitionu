defmodule Petitionu.Accounts.EmailDomain do
  @moduledoc """
  School-domain rules for automatic organization membership.

  Known organizations match their exact email host. New organizations are created
  only beneath .edu and .ac.uk, with student subdomains grouped under the school.
  """

  @personal_domains ~w(gmail.com googlemail.com outlook.com hotmail.com live.com
                       yahoo.com ymail.com aol.com icloud.com me.com mac.com
                       proton.me protonmail.com pm.me mail.com gmx.com gmx.net)
  @hostname ~r/\A[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+\z/

  def from_email(email) do
    case email |> to_string() |> String.downcase() |> String.split("@") do
      [local, host] when local != "" and byte_size(host) <= 253 ->
        if Regex.match?(@hostname, host) and host not in @personal_domains, do: host

      _ ->
        nil
    end
  end

  def school_domain(host) do
    case host |> String.split(".") |> Enum.reverse() do
      ["edu", school | _] -> school <> ".edu"
      ["uk", "ac", school | _] -> school <> ".ac.uk"
      _ -> nil
    end
  end
end
