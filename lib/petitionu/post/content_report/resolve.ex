defmodule Petitionu.Post.ContentReport.Resolve do
  use Ash.Resource.Change
  require Ash.Query

  @impl true
  def change(changeset, _opts, context) do
    Ash.Changeset.before_action(changeset, fn changeset ->
      query =
        changeset.resource
        |> Ash.Query.filter(id == ^changeset.data.id)
        |> Ash.Query.lock(:for_update)

      outcome = Ash.Changeset.get_argument(changeset, :outcome)
      hide? = Ash.Changeset.get_argument(changeset, :hide_content)

      with {:ok, %{state: :open} = report} <- Ash.read_one(query, actor: context.actor),
           :ok <- hide(report, outcome, hide?, context.actor) do
        Ash.Changeset.force_change_attributes(changeset, %{
          state: outcome,
          resolution_note: Ash.Changeset.get_argument(changeset, :resolution_note),
          resolver_id: context.actor.id,
          resolved_at: DateTime.utc_now()
        })
      else
        {:ok, _} -> Ash.Changeset.add_error(changeset, "This report has already been reviewed.")
        {:error, error} -> Ash.Changeset.add_error(changeset, error)
      end
    end)
  end

  defp hide(_report, :dismissed, true, _actor),
    do: {:error, "Dismissed reports cannot hide content."}

  defp hide(_report, _outcome, false, _actor), do: :ok

  defp hide(report, :resolved, true, actor) do
    {resource, id} =
      if report.comment_id,
        do: {Petitionu.Post.Comment, report.comment_id},
        else: {Petitionu.Post.Petition, report.petition_id}

    with {:ok, target} <- Ash.get(resource, id, authorize?: false),
         {:ok, _hidden} <-
           target |> Ash.Changeset.for_update(:moderator_hide, %{}, actor: actor) |> Ash.update() do
      :ok
    end
  end
end
