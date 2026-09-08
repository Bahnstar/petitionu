defmodule Petitionu.Accounts.User.Changes.AssignOrganization do
  use Ash.Resource.Change

  alias Petitionu.Accounts
  alias Petitionu.Accounts.EmailDomain

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_action(changeset, fn _changeset, user -> assign(user) end)
  end

  @impl true
  def atomic(changeset, opts, context), do: {:ok, change(changeset, opts, context)}

  defp assign(%{organization_id: nil, confirmed_at: %DateTime{}} = user) do
    with host when is_binary(host) <- EmailDomain.from_email(user.email),
         {:ok, organization} <- find_organization(host),
         %{id: _} <- organization,
         {:ok, updated} <- save_membership(user, organization) do
      {:ok,
       %{
         user
         | organization_id: updated.organization_id,
           pending_organization_id: updated.pending_organization_id,
           updated_at: updated.updated_at
       }}
    else
      nil -> {:ok, user}
      {:error, error} -> {:error, error}
    end
  end

  defp assign(user), do: {:ok, user}

  defp save_membership(user, %{verification_status: :pending} = organization) do
    with {:ok, updated} <-
           user
           |> Ash.Changeset.for_update(:assign_organization, %{
             pending_organization_id: organization.id
           })
           |> Ash.update(authorize?: false),
         {:ok, _job} <-
           %{user_id: user.id}
           |> Petitionu.Accounts.VerifySchoolMembership.new()
           |> Oban.insert() do
      {:ok, updated}
    end
  end

  defp save_membership(user, organization) do
    user
    |> Ash.Changeset.for_update(:assign_organization, %{
      organization_id: organization.id,
      pending_organization_id: nil
    })
    |> Ash.update(authorize?: false)
  end

  defp find_organization(host) do
    case Accounts.organization_by_domain(host, authorize?: false) do
      {:ok, nil} -> create_school_organization(EmailDomain.school_domain(host))
      result -> result
    end
  end

  defp create_school_organization(nil), do: {:ok, nil}

  defp create_school_organization(domain) do
    Accounts.get_or_create_organization_by_domain(domain, authorize?: false)
  end
end
