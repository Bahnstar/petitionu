defmodule Petitionu.Post.Petition do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "petition"
    repo Petitionu.Repo
  end

  typescript do
    type_name "Petition"
  end

  actions do
    defaults [:read, :create]

    create :create_2 do
      primary? true
      accept [:title, :description, :status]
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :title, :string do
      public? true
    end

    attribute :description, :string do
      public? true
    end

    attribute :status, :string do
      public? true
    end

    attribute :created_at, :utc_datetime_usec
    attribute :updated_at, :utc_datetime_usec
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User
    has_many :comments, Petitionu.Post.Comment
    has_many :user_petitions, Petitionu.Post.UserPetition
  end
end
