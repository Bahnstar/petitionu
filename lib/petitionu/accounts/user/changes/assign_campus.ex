defmodule Petitionu.Accounts.User.Changes.AssignCampus do
  use Ash.Resource.Change
  require Ash.Query

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.before_action(changeset, fn changeset ->
      cond do
        is_nil(changeset.data.confirmed_at) ->
          Ash.Changeset.add_error(changeset,
            field: :email,
            message: "Confirm your email before completing your profile."
          )

        not is_nil(changeset.data.organization_id) ->
          changeset

        true ->
          domain =
            changeset.data.email
            |> to_string()
            |> String.split("@")
            |> List.last()
            |> String.downcase()
            |> String.trim()

          organizations =
            Petitionu.Accounts.Organization
            |> Ash.Query.filter(fragment("lower(trim(?))", domain) == ^domain)
            |> Ash.Query.limit(2)
            |> Ash.read!(authorize?: false)

          case organizations do
            [%{verification_status: status} = organization]
            when status in [:approved, :verified] ->
              changeset
              |> Ash.Changeset.force_change_attribute(:organization_id, organization.id)
              |> Ash.Changeset.force_change_attribute(:pending_organization_id, nil)

            _ ->
              Ash.Changeset.add_error(changeset,
                field: :email,
                message:
                  "We could not match your email to one supported campus. Contact support for help."
              )
          end
      end
    end)
  end
end
