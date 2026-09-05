defmodule Petitionu.Post.Changes.CheckPetition do
  use Ash.Resource.Change

  @impl true
  def change(changeset, opts, context) do
    Ash.Changeset.before_action(changeset, fn changeset ->
      petition_id = Ash.Changeset.get_attribute(changeset, :petition_id)

      query =
        Petitionu.Post.Petition
        |> Ash.Query.for_read(:get_by_id, %{id: petition_id}, actor: context.actor)
        |> Ash.Query.lock(:for_update)

      case Ash.read_one(query) do
        {:ok, %Petitionu.Post.Petition{} = petition} ->
          if classroom_open?(petition, context.actor) do
            check(changeset, petition, context.actor, opts[:mode])
          else
            error(changeset, "This classroom is archived or unavailable.")
          end

        _ ->
          Ash.Changeset.add_error(changeset,
            field: :petition_id,
            message: "This petition is unavailable."
          )
      end
    end)
  end

  defp classroom_open?(%{classroom_id: nil}, _actor), do: true

  defp classroom_open?(petition, actor) do
    case Ash.get(Petitionu.Post.Classroom, petition.classroom_id, actor: actor) do
      {:ok, %{archived: false}} -> true
      _ -> false
    end
  end

  defp check(changeset, petition, actor, :manage) do
    case Ash.load(petition, :can_manage, actor: actor) do
      {:ok, %{can_manage: true}} ->
        changeset

      _ ->
        Ash.Changeset.add_error(changeset,
          field: :petition_id,
          message: "Only the petition owner or classroom professor can publish updates."
        )
    end
  end

  defp check(changeset, petition, actor, mode) do
    cond do
      petition.status != :open ->
        error(changeset, "This petition is closed.")

      petition.deadline && DateTime.compare(petition.deadline, DateTime.utc_now()) != :gt ->
        error(changeset, "This petition's deadline has passed.")

      mode == :comment and not petition.allow_comments ->
        error(changeset, "Comments are disabled for this petition.")

      mode == :signature ->
        check_campus(changeset, petition, actor)

      true ->
        changeset
    end
  end

  defp check_campus(changeset, %{classroom_id: classroom_id}, _actor)
       when not is_nil(classroom_id), do: changeset

  defp check_campus(changeset, %{organization_id: nil}, _actor), do: changeset

  defp check_campus(changeset, %{organization_id: organization_id}, %{
         organization_id: organization_id
       }),
       do: changeset

  defp check_campus(changeset, petition, _actor) do
    case Ash.get(Petitionu.Accounts.Organization, petition.organization_id) do
      {:ok, %{allow_public_signatures: true}} -> changeset
      _ -> error(changeset, "Only students at this campus can sign this petition.")
    end
  end

  defp error(changeset, message),
    do: Ash.Changeset.add_error(changeset, field: :petition_id, message: message)
end
