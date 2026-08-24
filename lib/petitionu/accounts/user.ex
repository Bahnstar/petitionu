defmodule Petitionu.Accounts.User do
  use Ash.Resource,
    otp_app: :petitionu,
    domain: Petitionu.Accounts,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshAuthentication, AshTypescript.Resource]

  authentication do
    add_ons do
      log_out_everywhere do
        apply_on_password_change? true
      end

      confirmation :confirm_new_user do
        monitor_fields [:email]
        confirm_on_create? true
        confirm_on_update? false
        require_interaction? true
        confirmed_at_field :confirmed_at
        auto_confirm_actions [:sign_in_with_magic_link, :reset_password_with_token]
        sender Petitionu.Accounts.User.Senders.SendNewUserConfirmationEmail
      end
    end

    tokens do
      enabled? true
      token_resource Petitionu.Accounts.Token
      signing_secret Petitionu.Secrets
      store_all_tokens? true
      require_token_presence_for_authentication? true
    end

    strategies do
      password :password do
        identity_field :email
        hash_provider AshAuthentication.BcryptProvider

        resettable do
          sender Petitionu.Accounts.User.Senders.SendPasswordResetEmail
          # these configurations will be the default in a future release
          password_reset_action_name :reset_password_with_token
          request_password_reset_action_name :request_password_reset_token
        end
      end

      magic_link do
        identity_field :email
        registration_enabled? true
        require_interaction? true

        sender Petitionu.Accounts.User.Senders.SendMagicLinkEmail
      end
    end
  end

  postgres do
    table "users"
    repo Petitionu.Repo
  end

  field_policies do
    field_policy [:email, :role, :graduation_year] do
      authorize_if {AshAuthentication.Checks.AshAuthenticationInteraction, []}
      authorize_if expr(id == ^actor(:id))
      authorize_if actor_attribute_equals(:role, :superadmin)
      authorize_if expr(organization_id == ^actor(:organization_id) and ^actor(:role) == :admin)
    end

    field_policy [
      :num_petitions,
      :num_signed,
      :num_petition_signees,
      :total_petition_signatures
    ] do
      authorize_if {AshAuthentication.Checks.AshAuthenticationInteraction, []}
      authorize_if expr(id == ^actor(:id))
      authorize_if actor_attribute_equals(:role, :superadmin)
      authorize_if expr(organization_id == ^actor(:organization_id) and ^actor(:role) == :admin)
    end

    field_policy :* do
      authorize_if always()
    end
  end

  typescript do
    type_name "User"
  end

  code_interface do
    define :get_by_email, args: [:email]
    # define :read_by_id
  end

  actions do
    defaults [:read]

    # update :update do
    #       primary? true
    #       accept [:first_name, :last_name, :student_id, :graduation_year]
    #     end
    read :read_users do
      primary? true
    end

    read :read_by_id do
      get_by :id
      argument :include_stats, :boolean, default: false

      prepare fn query, context ->
        load_user_stats(query, Ash.Query.get_argument(query, :include_stats))
      end
    end

    read :me do
      description "Get the currently authenticated user"
      get? true
      filter expr(id == ^actor(:id))
    end

    read :get_by_subject do
      description "Get a user by the subject claim in a JWT"
      argument :subject, :string, allow_nil?: false
      get? true
      prepare AshAuthentication.Preparations.FilterBySubject

      prepare fn query, _ ->
        Ash.Query.set_context(query, %{private: %{internal?: true}})
      end
    end

    update :change_password do
      # Use this action to allow users to change their password by providing
      # their current password and a new password.

      require_atomic? false
      accept []
      argument :current_password, :string, sensitive?: true, allow_nil?: false

      argument :password, :string,
        sensitive?: true,
        allow_nil?: false,
        constraints: [min_length: 8]

      argument :password_confirmation, :string, sensitive?: true, allow_nil?: false

      validate confirm(:password, :password_confirmation)

      validate {AshAuthentication.Strategy.Password.PasswordValidation,
                strategy_name: :password, password_argument: :current_password}

      change {AshAuthentication.Strategy.Password.HashPasswordChange, strategy_name: :password}
    end

    read :sign_in_with_password do
      description "Attempt to sign in using a email and password."
      get? true

      argument :email, :ci_string do
        description "The email to use for retrieving the user."
        allow_nil? false
      end

      argument :password, :string do
        description "The password to check for the matching user."
        allow_nil? false
        sensitive? true
      end

      # validates the provided email and password and generates a token
      prepare AshAuthentication.Strategy.Password.SignInPreparation

      metadata :token, :string do
        description "A JWT that can be used to authenticate the user."
        allow_nil? false
      end
    end

    read :sign_in_with_token do
      # In the generated sign in components, we validate the
      # email and password directly in the LiveView
      # and generate a short-lived token that can be used to sign in over
      # a standard controller action, exchanging it for a standard token.
      # This action performs that exchange. If you do not use the generated
      # liveviews, you may remove this action, and set
      # `sign_in_tokens_enabled? false` in the password strategy.

      description "Attempt to sign in using a short-lived sign in token."
      get? true

      argument :token, :string do
        description "The short-lived sign in token."
        allow_nil? false
        sensitive? true
      end

      # validates the provided sign in token and generates a token
      prepare AshAuthentication.Strategy.Password.SignInWithTokenPreparation

      metadata :token, :string do
        description "A JWT that can be used to authenticate the user."
        allow_nil? false
      end
    end

    create :register_with_password do
      description "Register a new user with a email and password."

      argument :email, :ci_string do
        allow_nil? false
      end

      argument :password, :string do
        description "The proposed password for the user, in plain text."
        allow_nil? false
        constraints min_length: 8
        sensitive? true
      end

      argument :password_confirmation, :string do
        description "The proposed password for the user (again), in plain text."
        allow_nil? false
        sensitive? true
      end

      # Sets the email from the argument
      change set_attribute(:email, arg(:email))

      # Hashes the provided password
      change AshAuthentication.Strategy.Password.HashPasswordChange

      # Generates an authentication token for the user
      change AshAuthentication.GenerateTokenChange

      # validates that the password matches the confirmation
      validate AshAuthentication.Strategy.Password.PasswordConfirmationValidation

      metadata :token, :string do
        description "A JWT that can be used to authenticate the user."
        allow_nil? false
      end
    end

    action :request_password_reset_token do
      description "Send password reset instructions to a user if they exist."

      argument :email, :ci_string do
        allow_nil? false
      end

      # creates a reset token and invokes the relevant senders
      run {AshAuthentication.Strategy.Password.RequestPasswordReset, action: :get_by_email}
    end

    read :get_by_email do
      description "Looks up a user by their email"
      get_by :email
    end

    update :update do
      primary? true
      accept [:first_name, :last_name, :student_id, :graduation_year]
    end

    update :set_role do
      description "Admin action to set a user's role"
      accept [:role]
      require_atomic? false

      validate fn changeset, context ->
        requested_role = Ash.Changeset.get_attribute(changeset, :role)
        actor_role = context.actor && context.actor.role

        if requested_role == :superadmin and actor_role != :superadmin do
          {:error, "only a superadmin can assign the superadmin role"}
        else
          :ok
        end
      end
    end

    update :reset_password_with_token do
      argument :reset_token, :string do
        allow_nil? false
        sensitive? true
      end

      argument :password, :string do
        description "The proposed password for the user, in plain text."
        allow_nil? false
        constraints min_length: 8
        sensitive? true
      end

      argument :password_confirmation, :string do
        description "The proposed password for the user (again), in plain text."
        allow_nil? false
        sensitive? true
      end

      # validates the provided reset token
      validate AshAuthentication.Strategy.Password.ResetTokenValidation

      # validates that the password matches the confirmation
      validate AshAuthentication.Strategy.Password.PasswordConfirmationValidation

      # Hashes the provided password
      change AshAuthentication.Strategy.Password.HashPasswordChange

      # Generates an authentication token for the user
      change AshAuthentication.GenerateTokenChange
    end

    create :sign_in_with_magic_link do
      description "Sign in or register a user with magic link."

      argument :token, :string do
        description "The token from the magic link that was sent to the user"
        allow_nil? false
      end

      upsert? true
      upsert_identity :unique_email
      upsert_fields [:email]

      # Uses the information from the token to create or sign in the user
      change AshAuthentication.Strategy.MagicLink.SignInChange

      metadata :token, :string do
        allow_nil? false
      end
    end

    action :request_magic_link do
      argument :email, :ci_string do
        allow_nil? false
      end

      run AshAuthentication.Strategy.MagicLink.Request
    end
  end

  policies do
    bypass AshAuthentication.Checks.AshAuthenticationInteraction do
      authorize_if always()
    end

    # Only admins can set user roles
    policy action(:set_role) do
      authorize_if actor_attribute_equals(:role, :admin)
      authorize_if actor_attribute_equals(:role, :superadmin)
    end

    policy action_type(:read) do
      authorize_if always()
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :first_name, :string do
      allow_nil? true
      public? true
    end

    attribute :last_name, :string do
      allow_nil? true
      public? true
    end

    attribute :email, :ci_string do
      allow_nil? false
      public? true
    end

    attribute :hashed_password, :string do
      sensitive? true
    end

    attribute :student_id, :string do
      allow_nil? true
      public? false
    end

    attribute :graduation_year, :integer do
      allow_nil? true
      public? true
    end

    attribute :role, :atom do
      constraints one_of: [:student, :professor, :admin, :superadmin]
      default :student
      allow_nil? false
      public? true
    end

    attribute :confirmed_at, :utc_datetime_usec

    timestamps public?: true
  end

  relationships do
    belongs_to :organization, Petitionu.Accounts.Organization

    has_many :petitions, Petitionu.Post.Petition do
      public? true
    end

    has_many :signatures, Petitionu.Post.Signature do
      public? true
    end

    has_many :classroom_memberships, Petitionu.Post.ClassroomMembership do
      public? true
    end

    has_many :owned_classrooms, Petitionu.Post.Classroom do
      destination_attribute :professor_id
      public? true
    end
  end

  calculations do
    calculate :total_petition_signatures, :integer, expr(count(petitions.signatures)) do
      public? true
    end
  end

  aggregates do
    count :num_petitions, :petitions do
      public? true
    end

    count :num_signed, :signatures do
      public? true
    end

    count :num_petition_signees, :signatures do
      public? true
    end
  end

  identities do
    identity :unique_email, [:email]
  end

  defp load_user_stats(query, true) do
    query
    |> Ash.Query.load([:num_petitions, :num_signed, :num_petition_signees])
    |> Ash.Query.load(:total_petition_signatures)
    |> Ash.Query.load(
      petitions: [
        Petitionu.Post.Petition
        |> Ash.Query.sort(inserted_at: :desc)
        |> Ash.Query.limit(4)
      ]
    )
    |> Ash.Query.load(
      signatures: [
        Petitionu.Post.Signature
        |> Ash.Query.sort(inserted_at: :desc)
        |> Ash.Query.limit(4)
      ]
    )
  end

  defp load_user_stats(query, _), do: query
end
