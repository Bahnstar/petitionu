defmodule Petitionu.Post.Update do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshTypescript.Resource]

  postgres do
    table "update"
    repo Petitionu.Repo

    references do
      reference :petition, on_delete: :delete
    end
  end

  typescript do
    type_name "Update"
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:title, :body, :petition_id]
      validate present(:petition_id)
      validate Petitionu.Post.Validations.Participant
      change {Petitionu.Post.Changes.CheckPetition, mode: :manage}
    end

    update :update do
      primary? true
      accept [:title, :body]
    end

    read :for_petition do
      description "Get all updates for a specific petition"

      argument :petition_id, :uuid_v7 do
        allow_nil? false
      end

      prepare fn query, _context ->
        petition_id = Ash.Query.get_argument(query, :petition_id)

        require Ash.Query

        Ash.Query.filter(query, petition_id == ^petition_id)
        |> Ash.Query.sort(inserted_at: :desc)
      end
    end
  end

  policies do
    policy action_type(:read) do
      forbid_unless expr(is_nil(petition.hidden_at))
      authorize_if expr(is_nil(petition.classroom_id))
      authorize_if expr(petition.classroom.professor_id == ^actor(:id))

      authorize_if expr(
                     exists(
                       petition.classroom.memberships,
                       user_id == ^actor(:id) and status == :active
                     )
                   )
    end

    policy action(:create) do
      authorize_if actor_present()
    end

    policy action([:update, :destroy]) do
      forbid_unless expr(is_nil(petition.hidden_at))

      forbid_unless expr(
                      is_nil(petition.classroom_id) or
                        petition.classroom.professor_id == ^actor(:id) or
                        exists(
                          petition.classroom.memberships,
                          user_id == ^actor(:id) and status == :active
                        )
                    )

      authorize_if expr(petition.user_id == ^actor(:id))
      authorize_if expr(petition.classroom.professor_id == ^actor(:id))
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :title, :string do
      constraints min_length: 1, max_length: 200, trim?: true
      allow_nil? false
      public? true
    end

    attribute :body, :string do
      constraints min_length: 1, max_length: 20000, trim?: true
      allow_nil? false
      public? true
    end

    timestamps public?: true
  end

  relationships do
    belongs_to :petition, Petitionu.Post.Petition do
      public? true
      attribute_public? true
    end
  end
end
