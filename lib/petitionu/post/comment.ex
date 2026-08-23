defmodule Petitionu.Post.Comment do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
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

      argument :petition_id, :uuid_v7 do
        allow_nil? false
      end

      change relate_actor(:user, allow_nil?: true)
      change manage_relationship(:petition_id, :petition, type: :append_and_remove)
    end

    update :update do
      primary? true
      accept [:text]
    end
  end

  policies do
    # Comments are public content
    policy action_type(:read) do
      authorize_if always()
    end

    # Only authenticated users can create comments
    policy action(:create) do
      authorize_if actor_present()
    end

    # Only the author can update or destroy their comment
    policy action([:update, :destroy]) do
      authorize_if relates_to_actor_via(:user)
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

    timestamps public?: true
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User do
      public? true
    end

    belongs_to :petition, Petitionu.Post.Petition do
      public? true
    end
  end
end
