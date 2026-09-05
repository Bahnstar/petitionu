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

    update :moderator_hide do
      accept []
      change set_attribute(:hidden_at, &DateTime.utc_now/0)
    end

    create :create do
      primary? true
      accept [:text, :parent_comment_id, :petition_id]

      validate present([:text, :petition_id])
      validate Petitionu.Post.Validations.Participant
      change relate_actor(:user)
      change {Petitionu.Post.Changes.CheckPetition, mode: :comment}
      change Petitionu.Post.Changes.CommentParent
    end

    update :update do
      primary? true
      accept [:text]
      validate present(:text)
    end
  end

  policies do
    policy action(:moderator_hide) do
      authorize_if actor_attribute_equals(:role, :superadmin)

      authorize_if expr(
                     not is_nil(petition.organization_id) and
                       petition.organization_id == ^actor(:organization_id) and
                       ^actor(:role) == :admin
                   )
    end

    policy action_type(:read) do
      forbid_unless expr(is_nil(hidden_at) and is_nil(petition.hidden_at))
      authorize_if expr(is_nil(petition.classroom_id))
      authorize_if expr(petition.classroom.professor_id == ^actor(:id))

      authorize_if expr(
                     exists(
                       petition.classroom.memberships,
                       user_id == ^actor(:id) and status == :active
                     )
                   )
    end

    policy action(:create) do
      authorize_if actor_present()
    end

    policy action([:update, :destroy]) do
      forbid_unless expr(is_nil(hidden_at) and is_nil(petition.hidden_at))

      forbid_unless expr(
                      is_nil(petition.classroom_id) or
                        petition.classroom.professor_id == ^actor(:id) or
                        exists(
                          petition.classroom.memberships,
                          user_id == ^actor(:id) and status == :active
                        )
                    )

      authorize_if relates_to_actor_via(:user)
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :text, :string do
      public? true
      constraints min_length: 1, max_length: 5000, trim?: true
    end

    attribute :sentiment, :string do
      public? true
    end

    attribute :parent_comment_id, :uuid_v7, allow_nil?: true

    attribute :hidden_at, :utc_datetime_usec

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

  calculations do
    calculate :author, :string, {Petitionu.Post.Calculations.Author, anonymous?: false} do
      public? true
      filterable? false
      sortable? false
    end
  end
end
