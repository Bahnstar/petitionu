defmodule Petitionu.Accounts.VerifySchoolMembership do
  use Oban.Worker,
    queue: :school_registry,
    max_attempts: 20,
    unique: [
      period: :infinity,
      fields: [:worker, :args],
      states: [:available, :scheduled, :executing, :retryable]
    ]

  alias Petitionu.Accounts.{EmailDomain, Organization, SchoolRegistry, User}

  @impl Oban.Worker
  def perform(%Oban.Job{args: %{"user_id" => id}}) do
    case Ash.get(User, id, authorize?: false, not_found_error?: false) do
      {:ok,
       %{
         organization_id: nil,
         pending_organization_id: organization_id,
         confirmed_at: %DateTime{}
       } = user}
      when not is_nil(organization_id) ->
        with {:ok, organization} <- Ash.get(Organization, organization_id, authorize?: false),
             true <- matches_domain?(user, organization),
             {:ok, verified} <- verify(organization) do
          activate(user, verified)
        else
          false -> {:cancel, "email domain no longer matches the requested organization"}
          other -> other
        end

      {:ok, _} ->
        :ok

      {:error, error} ->
        {:error, error}
    end
  end

  @impl Oban.Worker
  def backoff(%Oban.Job{attempt: attempt}), do: min(60 * Integer.pow(2, attempt - 1), 86_400)

  @impl Oban.Worker
  def timeout(_job), do: 20_000

  defp matches_domain?(user, organization) do
    host = EmailDomain.from_email(user.email)
    domain = to_string(organization.domain)
    (host && (host == domain || EmailDomain.school_domain(host) == domain)) || false
  end

  defp verify(%{verification_status: status} = organization)
       when status in [:approved, :verified],
       do: {:ok, organization}

  defp verify(organization) do
    if organization.registry_error && organization.registry_checked_at &&
         DateTime.diff(DateTime.utc_now(), organization.registry_checked_at) < 60 do
      {:snooze, 60}
    else
      lookup(organization)
    end
  end

  defp lookup(organization) do
    domain = to_string(organization.domain)
    registry = Application.get_env(:petitionu, :school_registry, SchoolRegistry)

    case registry.lookup(domain) do
      {:ok, %{name: name, source: source}} ->
        organization
        |> Ash.Changeset.for_update(:verify_registry, %{
          domain: domain,
          registered_name: name,
          source: source
        })
        |> Ash.update(authorize?: false)

      {:error, reason} ->
        with {:ok, _} <-
               organization
               |> Ash.Changeset.for_update(:record_registry_failure, %{
                 domain: domain,
                 reason: reason
               })
               |> Ash.update(authorize?: false) do
          {:error, reason}
        end
    end
  end

  defp activate(user, organization) do
    with {:ok, _} <-
           user
           |> Ash.Changeset.for_update(:activate_pending_organization, %{
             organization_id: organization.id,
             domain: organization.domain,
             email: user.email
           })
           |> Ash.update(authorize?: false) do
      :ok
    end
  end
end
