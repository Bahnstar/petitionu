defmodule Petitionu.Post.Signature do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
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
      accept [:reason, :ip_address, :user_agent, :is_verified, :petition_id, :user_id]
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :reason, :string do
      public? true
    end

    attribute :ip_address, :string do
      public? true
      description "IP Address for fraud prevention"
    end

    attribute :user_agent, :string do
      public? true
    end

    attribute :is_verified, :boolean do
      public? true
      default true
    end

    timestamps()
  end

  relationships do
    belongs_to :petition, Petitionu.Post.Petition do
      allow_nil? false
    end

    belongs_to :user, Petitionu.Accounts.User do
      allow_nil? false
    end
  end

  identities do
    identity :unique_signature, [:petition_id, :user_id]
  end
end
