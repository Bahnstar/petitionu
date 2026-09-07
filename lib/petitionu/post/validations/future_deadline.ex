defmodule Petitionu.Post.Validations.FutureDeadline do
  use Ash.Resource.Validation

  @impl true
  def validate(changeset, _opts, _context) do
    deadline = Ash.Changeset.get_attribute(changeset, :deadline)

    if (Ash.Changeset.changing_attribute?(changeset, :deadline) and deadline) &&
         DateTime.compare(deadline, DateTime.utc_now()) != :gt do
      {:error, field: :deadline, message: "Choose a deadline in the future."}
    else
      :ok
    end
  end
end
