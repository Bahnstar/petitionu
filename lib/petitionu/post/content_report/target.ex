defmodule Petitionu.Post.ContentReport.Target do
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, context) do
    Ash.Changeset.before_action(changeset, fn changeset ->
      comment_id = Ash.Changeset.get_argument(changeset, :comment_id)
      petition_id = Ash.Changeset.get_argument(changeset, :petition_id)

      with {:ok, target_petition_id, comment_text} <-
             petition_id(comment_id, petition_id, context.actor),
           {:ok, %Petitionu.Post.Petition{} = petition} <-
             Ash.get(Petitionu.Post.Petition, target_petition_id, actor: context.actor) do
        Ash.Changeset.force_change_attributes(changeset, %{
          petition_id: petition.id,
          target_title: petition.title,
          target_text: comment_text || petition.description,
          comment_id: comment_id,
          organization_id: petition.organization_id
        })
      else
        _ ->
          Ash.Changeset.add_error(changeset,
            field: :petition_id,
            message: "This content is unavailable."
          )
      end
    end)
  end

  defp petition_id(nil, nil, _actor), do: {:error, :missing_target}
  defp petition_id(nil, petition_id, _actor), do: {:ok, petition_id, nil}

  defp petition_id(comment_id, _petition_id, actor) do
    case Ash.get(Petitionu.Post.Comment, comment_id, actor: actor) do
      {:ok, %Petitionu.Post.Comment{petition_id: id, text: text}} -> {:ok, id, text}
      _ -> {:error, :unavailable}
    end
  end
end
