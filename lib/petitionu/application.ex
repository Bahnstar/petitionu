defmodule Petitionu.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      PetitionuWeb.Telemetry,
      Petitionu.Repo,
      {DNSCluster, query: Application.get_env(:petitionu, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: Petitionu.PubSub},
      # Start a worker by calling: Petitionu.Worker.start_link(arg)
      # {Petitionu.Worker, arg},
      # Start to serve requests, typically the last entry
      PetitionuWeb.Endpoint,
      {AshAuthentication.Supervisor, [otp_app: :petitionu]}
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: Petitionu.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    PetitionuWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
