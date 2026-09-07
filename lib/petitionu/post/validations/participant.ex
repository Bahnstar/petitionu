defmodule Petitionu.Post.Validations.Participant do
  use Ash.Resource.Validation

  @impl true
  def validate(_changeset, _opts, %{actor: actor}) do
    cond do
      is_nil(actor) ->
        {:error, "Sign in to participate."}

      is_nil(actor.confirmed_at) ->
        {:error, "Confirm your email before participating."}

      is_nil(actor.organization_id) or blank?(actor.first_name) or blank?(actor.last_name) ->
        {:error, "Complete your campus profile before participating."}

      true ->
        :ok
    end
  end

  defp blank?(value), do: is_nil(value) or String.trim(value) == ""
end
