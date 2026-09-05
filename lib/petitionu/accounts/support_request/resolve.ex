defmodule Petitionu.Accounts.SupportRequest.Resolve do
  use Ash.Resource.Change
  require Ash.Query

  @impl true
  def change(changeset, _opts, context) do
    Ash.Changeset.before_action(changeset, fn changeset ->
      query =
        changeset.resource
        |> Ash.Query.filter(id == ^changeset.data.id)
        |> Ash.Query.lock(:for_update)

      case Ash.read_one(query, actor: context.actor) do
        {:ok, %{state: :open}} ->
          Ash.Changeset.force_change_attributes(changeset, %{
            state: :resolved,
            resolution_note: Ash.Changeset.get_argument(changeset, :resolution_note),
            resolver_id: context.actor.id,
            resolved_at: DateTime.utc_now()
          })

        {:ok, _} ->
          Ash.Changeset.add_error(changeset, "This request has already been resolved.")

        {:error, error} ->
          Ash.Changeset.add_error(changeset, error)
      end
    end)
  end
end
