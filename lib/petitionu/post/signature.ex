defmodule Petitionu.Post.Signature do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshTypescript.Resource]

  postgres do
    table "signature"
    repo Petitionu.Repo

    references do
      reference :petition, on_delete: :delete
      reference :user, on_delete: :delete
    end
  end

  typescript do
    type_name "Signature"
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:reason, :petition_id]
      validate Petitionu.Post.Validations.Participant
      change relate_actor(:user)
      change set_attribute(:is_verified, true)
      change {Petitionu.Post.Changes.CheckPetition, mode: :signature}
    end
  end

  policies do
    policy action(:create) do
      authorize_if actor_present()
    end

    policy action(:destroy) do
      authorize_if expr(user_id == ^actor(:id))
    end

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
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :reason, :string do
      public? true
      constraints max_length: 2000
    end

    attribute :ip_address, :string do
      public? false
      description "IP Address for fraud prevention"
    end

    attribute :user_agent, :string do
      public? false
    end

    attribute :is_verified, :boolean do
      public? true
      default false
    end

    timestamps public?: true
  end

  relationships do
    belongs_to :petition, Petitionu.Post.Petition do
      allow_nil? false
      public? true
    end

    belongs_to :user, Petitionu.Accounts.User do
      allow_nil? false
      public? false
      attribute_public? false
      filterable? false
    end
  end

  identities do
    identity :unique_signature, [:petition_id, :user_id]
  end
end
