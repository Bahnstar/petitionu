defmodule Petitionu.Accounts.Notification do
  use Ash.Resource,
    domain: Petitionu.Accounts,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "notification"
    repo Petitionu.Repo
  end

  typescript do
    type_name "Notification"
  end

  actions do
    defaults [:read, :destroy]
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :reference_id, :string do
      allow_nil? true
    end

    attribute :title, :string do
      public? true
      allow_nil? false
    end

    attribute :body, :string do
      public? true
      allow_nil? true
    end

    attribute :status, :atom do
      constraints one_of: [:unread, :read, :archived]
      public? true
      allow_nil? false
    end

    timestamps(public?: true)
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User
  end
end
