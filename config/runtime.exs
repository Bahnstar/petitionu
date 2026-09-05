import Config

if System.get_env("PHX_SERVER") in ~w(true 1) do
  config :petitionu, PetitionuWeb.Endpoint, server: true
end

if config_env() == :prod do
  required = fn name ->
    case System.get_env(name) do
      value when is_binary(value) ->
        if String.trim(value) == "",
          do: raise("Missing environment variable #{name}"),
          else: value

      nil ->
        raise "Missing environment variable #{name}"
    end
  end

  email_address = fn name ->
    value = required.(name)

    unless Regex.match?(~r/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/, value),
      do: raise("Invalid email address in #{name}")

    value
  end

  host = required.("PHX_HOST")

  unless Regex.match?(~r/^[a-zA-Z0-9.-]+$/, host),
    do: raise("PHX_HOST must be a hostname without a scheme or port")

  config :petitionu, Petitionu.Repo,
    url: required.("DATABASE_URL"),
    ssl: System.get_env("DATABASE_SSL") in ~w(true 1),
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10"),
    socket_options: if(System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: [])

  config :petitionu, Petitionu.Mailer,
    adapter: Swoosh.Adapters.Resend,
    api_key: required.("RESEND_API_KEY")

  config :petitionu, :email,
    from: {"PetitionU", email_address.("MAIL_FROM")},
    support: email_address.("SUPPORT_EMAIL")

  config :petitionu, :dns_cluster_query, System.get_env("DNS_CLUSTER_QUERY")
  config :petitionu, token_signing_secret: required.("TOKEN_SIGNING_SECRET")

  config :petitionu, PetitionuWeb.Endpoint,
    url: [host: host, port: 443, scheme: "https"],
    http: [ip: {0, 0, 0, 0}, port: String.to_integer(System.get_env("PORT") || "4000")],
    secret_key_base: required.("SECRET_KEY_BASE")
else
  config :petitionu, :email,
    from: {"PetitionU", "noreply@localhost.test"},
    support: "support@localhost.test"
end
