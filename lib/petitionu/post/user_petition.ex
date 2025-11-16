defmodule Petitionu.Post.UserPetition do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "user_petitions"
    repo Petitionu.Repo
  end

  actions do
    defaults [:read, :create, :update, :destroy]
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :user_id, :uuid do
      allow_nil? false
    end

    attribute :petition_id, :uuid do
      allow_nil? false
    end

    attribute :relationship, :atom do
      constraints one_of: [:owner, :signee]
      default :signee
      allow_nil? false
    end

    attribute :bookmarked, :boolean do
      default false
      allow_nil? false
    end

    attribute :created_at, :utc_datetime_usec
    attribute :updated_at, :utc_datetime_usec
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User
    belongs_to :petition, Petitionu.Post.Petition
  end
end
