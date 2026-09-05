defmodule Petitionu.Post.Changes.PetitionCampus do
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, context) do
    case Ash.Changeset.get_attribute(changeset, :classroom_id) do
      nil ->
        Ash.Changeset.force_change_attribute(
          changeset,
          :organization_id,
          context.actor && context.actor.organization_id
        )

      classroom_id ->
        Ash.Changeset.before_action(changeset, fn changeset ->
          case Ash.get(Petitionu.Post.Classroom, classroom_id, actor: context.actor) do
            {:ok, %{archived: false} = classroom} ->
              if classroom.professor_id == context.actor.id or classroom.allow_student_petitions do
                Ash.Changeset.force_change_attribute(
                  changeset,
                  :organization_id,
                  classroom.organization_id || context.actor.organization_id
                )
              else
                Ash.Changeset.add_error(changeset,
                  field: :classroom_id,
                  message: "Only the professor can create petitions in this classroom."
                )
              end

            _ ->
              Ash.Changeset.add_error(changeset,
                field: :classroom_id,
                message: "This classroom is unavailable."
              )
          end
        end)
    end
  end
end
