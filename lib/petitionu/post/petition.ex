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
    defaults [:read, :update, :destroy]

    create :create do
      primary? true
      accept [:title, :description, :status, :category, :goal]
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

    attribute :category, :string do
      public? true
    end

    attribute :goal, :integer do
      public? true
      default 1000
    end

    attribute :trending, :boolean do
      public? true
      default false
    end

    attribute :created_at, :utc_datetime_usec
    attribute :updated_at, :utc_datetime_usec
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User
    has_many :comments, Petitionu.Post.Comment
    # has_many :user_petitions, Petitionu.Post.UserPetition
  end

  calculations do
    calculate :signatures, :integer, expr(count(user_petitions, relationship: :signee))

    calculate :days_left, :integer, expr(greatest(0, 30 - date_diff(now(), created_at, :day)))

    calculate :author, :string, expr(user.name)
  end
end
