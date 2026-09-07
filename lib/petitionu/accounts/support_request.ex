defmodule Petitionu.Accounts.SupportRequest do
  use Ash.Resource,
    domain: Petitionu.Accounts,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshTypescript.Resource]

  postgres do
    table "support_requests"
    repo Petitionu.Repo
  end

  typescript do
    type_name "SupportRequest"
  end

  actions do
    defaults [:read]

    read :mine do
      filter expr(user_id == ^actor(:id))
    end

    action :support_contact, :string do
      run fn _input, _context ->
        {:ok, Application.fetch_env!(:petitionu, :email)[:support]}
      end
    end

    create :create do
      accept [:kind, :message]
      change relate_actor(:user)
      change set_attribute(:requester_email, actor(:email))
      change set_attribute(:organization_id, actor(:organization_id))
    end

    update :resolve do
      accept []
      require_atomic? false

      argument :resolution_note, :string,
        allow_nil?: false,
        constraints: [min_length: 1, max_length: 5000, trim?: true]

      change Petitionu.Accounts.SupportRequest.Resolve
    end
  end

  policies do
    policy action(:support_contact) do
      authorize_if always()
    end

    policy action(:create) do
      authorize_if actor_present()
    end

    policy action_type(:read) do
      authorize_if expr(user_id == ^actor(:id))
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
    attribute :requester_email, :ci_string, public?: true, allow_nil?: false

    attribute :kind, :atom,
      public?: true,
      allow_nil?: false,
      constraints: [one_of: [:support, :account_deletion]]

    attribute :message, :string,
      public?: true,
      allow_nil?: false,
      constraints: [min_length: 1, max_length: 5000, trim?: true]

    attribute :state, :atom,
      public?: true,
      allow_nil?: false,
      default: :open,
      constraints: [one_of: [:open, :resolved]]

    attribute :resolution_note, :string, public?: true
    attribute :resolved_at, :utc_datetime_usec, public?: true
    timestamps public?: true
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User, allow_nil?: false
    belongs_to :organization, Petitionu.Accounts.Organization
    belongs_to :resolver, Petitionu.Accounts.User
  end
end
