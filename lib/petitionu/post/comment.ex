defmodule Petitionu.Post.Comment do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "comment"
    repo Petitionu.Repo
  end

  typescript do
    type_name "Comment"
  end

  actions do
    defaults [:read, :create]
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :text, :string do
      public? true
    end

    attribute :sentiment, :string do
      public? true
    end

    attribute :created_at, :utc_datetime_usec
    attribute :updated_at, :utc_datetime_usec
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User
    belongs_to :petition, Petitionu.Post.Petition
  end
end
