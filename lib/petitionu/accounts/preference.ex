defmodule Petitionu.Accounts.Preference do
  use Ash.Resource,
    domain: Petitionu.Accounts,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "preference"
    repo Petitionu.Repo
  end

  typescript do
    type_name "Preference"
  end

  actions do
    defaults [:read, :create]
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :name, :string do
      public? true
    end

    attribute :value, :string do
      public? true
    end

    attribute :created_at, :utc_datetime_usec
    attribute :updated_at, :utc_datetime_usec
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User
  end
end
