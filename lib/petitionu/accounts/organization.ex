defmodule Petitionu.Accounts.Organization do
  use Ash.Resource,
    domain: Petitionu.Accounts,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "organization"
    repo Petitionu.Repo
  end

  typescript do
    type_name "Organization"
  end

  actions do
    defaults [:read, :destroy]

    read :by_domain do
      get_by :domain
    end

    create :get_or_create_by_domain do
      accept [:domain]
      upsert? true
      upsert_identity :unique_domain
      upsert_fields [:domain]
      validate present(:domain)

      change fn changeset, _context ->
        domain = Ash.Changeset.get_attribute(changeset, :domain)
        Ash.Changeset.change_attribute(changeset, :name, to_string(domain))
      end
    end

    create :create do
      primary? true
      accept [:name, :description, :domain, :logo_url, :allow_public_signatures]
      change set_attribute(:verification_status, :approved)
    end

    update :verify_registry do
      accept []
      atomic_upgrade? false
      require_atomic? false
      argument :domain, :ci_string, allow_nil?: false
      argument :registered_name, :string, allow_nil?: false
      argument :source, :string, allow_nil?: false
      change filter(expr(domain == ^arg(:domain) and verification_status == :pending))
      change set_attribute(:verification_status, :verified)

      change atomic_update(
               :name,
               expr(
                 if is_nil(name) or name == type(domain, :string),
                   do: ^arg(:registered_name),
                   else: name
               )
             )

      change set_attribute(:registry_name, arg(:registered_name))
      change set_attribute(:registry_source, arg(:source))
      change set_attribute(:registry_checked_at, &DateTime.utc_now/0)
      change set_attribute(:registry_error, nil)
    end

    update :record_registry_failure do
      accept []
      atomic_upgrade? false
      require_atomic? false
      argument :domain, :ci_string, allow_nil?: false

      argument :reason, :atom,
        allow_nil?: false,
        constraints: [one_of: [:unavailable, :not_found, :inconclusive, :unsupported_domain]]

      change filter(expr(domain == ^arg(:domain) and verification_status == :pending))
      change set_attribute(:registry_error, arg(:reason))
      change set_attribute(:registry_checked_at, &DateTime.utc_now/0)
    end

    update :update do
      primary? true
      accept [:name, :description, :domain, :logo_url, :allow_public_signatures]
      change set_attribute(:verification_status, :pending), where: [changing(:domain)]
      change set_attribute(:registry_name, nil), where: [changing(:domain)]
      change set_attribute(:registry_source, nil), where: [changing(:domain)]
      change set_attribute(:registry_checked_at, nil), where: [changing(:domain)]
      change set_attribute(:registry_error, nil), where: [changing(:domain)]
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :verification_status, :atom do
      constraints one_of: [:pending, :verified, :approved]
      default :pending
      allow_nil? false
      public? true
    end

    attribute :registry_name, :string
    attribute :registry_source, :string
    attribute :registry_checked_at, :utc_datetime_usec

    attribute :registry_error, :atom do
      constraints one_of: [:unavailable, :not_found, :inconclusive, :unsupported_domain]
    end

    attribute :name, :string do
      public? true
    end

    attribute :description, :string do
      public? true
    end

    attribute :domain, :ci_string do
      public? true
      constraints casing: :lower
    end

    attribute :logo_url, :string do
      public? true
      allow_nil? true
    end

    attribute :allow_public_signatures, :boolean do
      public? true
      default false
    end

    timestamps public?: true
  end

  relationships do
    has_many :users, Petitionu.Accounts.User
  end

  identities do
    identity :unique_domain, [:domain]
  end
end
