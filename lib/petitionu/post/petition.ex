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
      accept [:title, :description, :status, :goal, :deadline]
    end

    read :get_by_id do
      get_by :id
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

    attribute :status, :atom do
      constraints one_of: [:open, :closed, :victory]
      default :open
      public? true
    end

    attribute :goal, :integer do
      public? true
      default 1000
    end

    attribute :allow_comments, :boolean do
      public? true
      default true
    end

    attribute :is_anonymous, :boolean do
      public? true
      default false
    end

    attribute :deadline, :utc_datetime do
      public? true
      allow_nil? true
    end

    timestamps()
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User do
      public? true
      attribute_public? true
    end

    belongs_to :category, Petitionu.Post.Category do
      public? true
      attribute_public? true
    end

    has_many :comments, Petitionu.Post.Comment do
      public? true
    end

    has_many :signatures, Petitionu.Post.Signature do
      public? true
    end

    # has_many :user_petitions, Petitionu.Post.UserPetition
  end

  calculations do
    calculate :signatures_count, :integer, expr(count(signatures)) do
      public? true
    end

    calculate :days_left,
              :integer,
              expr(
                if is_nil(deadline) do
                  fragment("30 - EXTRACT(DAY FROM (? - ?))::integer", now(), inserted_at)
                else
                  fragment("EXTRACT(DAY FROM (? - ?))::integer", deadline, now())
                end
              ) do
      public? true
    end

    calculate :author, :string, expr(user.first_name <> " " <> user.last_name) do
      public? true
    end
  end
end
