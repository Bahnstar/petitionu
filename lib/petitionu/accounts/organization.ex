defmodule Petitionu.Accounts.Organization do
  use Ash.Resource,
    domain: Petitionu.Accounts,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "organization"
    repo Petitionu.Repo
  end

  typescript do
    type_name "Organization"
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:name, :description, :domain, :logo_url, :allow_public_signatures]
    end

    update :update do
      primary? true
      accept [:name, :description, :domain, :logo_url, :allow_public_signatures]
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :name, :string do
      public? true
    end

    attribute :description, :string do
      public? true
    end

    attribute :domain, :string do
      public? true
    end

    attribute :logo_url, :string do
      public? true
      allow_nil? true
    end

    attribute :allow_public_signatures, :boolean do
      public? true
      default false
    end

    timestamps public?: true
  end

  relationships do
    has_many :users, Petitionu.Accounts.User
  end
end
