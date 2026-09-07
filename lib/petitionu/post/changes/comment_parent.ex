defmodule Petitionu.Post.Changes.CommentParent do
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, context) do
    Ash.Changeset.before_action(changeset, fn changeset ->
      parent_id = Ash.Changeset.get_attribute(changeset, :parent_comment_id)
      petition_id = Ash.Changeset.get_attribute(changeset, :petition_id)

      if parent_id do
        case Ash.get(Petitionu.Post.Comment, parent_id, actor: context.actor) do
          {:ok, %{petition_id: ^petition_id}} ->
            changeset

          _ ->
            Ash.Changeset.add_error(changeset,
              field: :parent_comment_id,
              message: "Reply to a comment in this petition."
            )
        end
      else
        changeset
      end
    end)
  end
end
