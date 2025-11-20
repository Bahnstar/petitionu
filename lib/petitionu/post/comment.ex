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
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:text, :parent_comment_id]

      argument :petition_id, :uuid do
        allow_nil? false
      end

      argument :user_id, :uuid do
        allow_nil? false
      end

      change manage_relationship(:petition_id, :petition, type: :append_and_remove)
      change manage_relationship(:user_id, :user, type: :append_and_remove)
    end

    update :update do
      primary? true
      accept [:text]
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :text, :string do
      public? true
    end

    attribute :sentiment, :string do
      public? true
    end

    attribute :parent_comment_id, :uuid_v7, allow_nil?: true

    timestamps()
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User
    belongs_to :petition, Petitionu.Post.Petition
  end
end
