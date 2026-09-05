defmodule Petitionu.Post.ContentReport do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshTypescript.Resource]

  postgres do
    table "content_reports"
    repo Petitionu.Repo
  end

  typescript do
    type_name "ContentReport"
  end

  actions do
    defaults [:read]

    create :create do
      accept [:reason, :details]
      argument :petition_id, :uuid_v7
      argument :comment_id, :uuid_v7
      change relate_actor(:reporter)
      validate Petitionu.Post.Validations.Participant
      change Petitionu.Post.ContentReport.Target
    end

    update :resolve do
      accept []
      require_atomic? false
      touches_resources [Petitionu.Post.Petition, Petitionu.Post.Comment]
      argument :outcome, :atom, allow_nil?: false, constraints: [one_of: [:resolved, :dismissed]]
      argument :hide_content, :boolean, allow_nil?: false, default: false

      argument :resolution_note, :string,
        allow_nil?: false,
        constraints: [min_length: 1, max_length: 5000, trim?: true]

      change Petitionu.Post.ContentReport.Resolve
    end
  end

  policies do
    policy action(:create) do
      authorize_if actor_present()
    end

    policy action_type(:read) do
      authorize_if expr(reporter_id == ^actor(:id))
      authorize_if actor_attribute_equals(:role, :superadmin)

      authorize_if expr(
                     not is_nil(organization_id) and organization_id == ^actor(:organization_id) and
                       ^actor(:role) == :admin
                   )
    end

    policy action(:resolve) do
      authorize_if actor_attribute_equals(:role, :superadmin)

      authorize_if expr(
                     not is_nil(organization_id) and organization_id == ^actor(:organization_id) and
                       ^actor(:role) == :admin
                   )
    end
  end

  attributes do
    uuid_v7_primary_key :id
    attribute :target_title, :string, public?: true, allow_nil?: false
    attribute :target_text, :string, public?: true, allow_nil?: false

    attribute :reason, :atom,
      allow_nil?: false,
      public?: true,
      constraints: [one_of: [:spam, :harassment, :privacy, :other]]

    attribute :details, :string, public?: true, constraints: [max_length: 5000, trim?: true]

    attribute :state, :atom,
      allow_nil?: false,
      public?: true,
      default: :open,
      constraints: [one_of: [:open, :resolved, :dismissed]]

    attribute :resolution_note, :string, public?: true
    attribute :resolved_at, :utc_datetime_usec, public?: true
    timestamps public?: true
  end

  relationships do
    belongs_to :petition, Petitionu.Post.Petition, allow_nil?: false, attribute_public?: true
    belongs_to :comment, Petitionu.Post.Comment, attribute_public?: true
    belongs_to :organization, Petitionu.Accounts.Organization
    belongs_to :reporter, Petitionu.Accounts.User, allow_nil?: false
    belongs_to :resolver, Petitionu.Accounts.User
  end
end
