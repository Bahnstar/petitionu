defmodule Petitionu.Post.Classroom do
  use Ash.Resource,
    otp_app: :petitionu,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshTypescript.Resource]

  postgres do
    table "classrooms"
    repo Petitionu.Repo

    references do
      reference :professor, on_delete: :delete
      reference :organization, on_delete: :nilify
    end
  end

  typescript do
    type_name "Classroom"
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:name, :description, :allow_student_petitions]

      argument :organization_id, :uuid do
        allow_nil? true
      end

      change set_attribute(:organization_id, arg(:organization_id))
      change relate_actor(:professor)
      change {Petitionu.Post.Classroom.Changes.GenerateJoinCode, []}
    end

    update :update do
      primary? true
      accept [:name, :description, :allow_student_petitions]
    end

    update :archive do
      accept []
      change set_attribute(:archived, true)
    end

    update :unarchive do
      accept []
      change set_attribute(:archived, false)
    end

    update :regenerate_join_code do
      accept []
      require_atomic? false
      change {Petitionu.Post.Classroom.Changes.GenerateJoinCode, []}
    end

    read :get_by_id do
      get_by :id
    end

    read :get_by_join_code do
      get_by :join_code
    end

    read :my_classrooms do
      description "Get classrooms where the user is a professor or member"

      prepare fn query, context ->
        actor = context.actor

        if actor do
          require Ash.Query

          query
          |> Ash.Query.filter(
            professor_id == ^actor.id or
              exists(memberships, user_id == ^actor.id and status == :active)
          )
        else
          query
        end
      end
    end
  end

  policies do
    # Professors and admins can create classrooms
    policy action(:create) do
      authorize_if actor_attribute_equals(:role, :professor)
      authorize_if actor_attribute_equals(:role, :admin)
    end

    # Professor (owner) can update, archive, unarchive, regenerate code, destroy
    policy action([:update, :archive, :unarchive, :regenerate_join_code, :destroy]) do
      authorize_if relates_to_actor_via(:professor)
    end

    # Members and professor can read their classrooms
    policy action_type(:read) do
      authorize_if relates_to_actor_via(:professor)
      authorize_if expr(exists(memberships, user_id == ^actor(:id) and status == :active))
    end

    # Allow reading by join code for joining (anyone authenticated)
    policy action(:get_by_join_code) do
      authorize_if actor_present()
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :name, :string do
      allow_nil? false
      public? true
      constraints min_length: 1, max_length: 255
    end

    attribute :description, :string do
      allow_nil? true
      public? true
      constraints max_length: 2000
    end

    attribute :join_code, :uuid do
      allow_nil? false
      public? true
    end

    attribute :archived, :boolean do
      default false
      allow_nil? false
      public? true
    end

    attribute :allow_student_petitions, :boolean do
      default true
      allow_nil? false
      public? true
    end

    timestamps public?: true
  end

  relationships do
    belongs_to :professor, Petitionu.Accounts.User do
      allow_nil? false
      public? true
    end

    belongs_to :organization, Petitionu.Accounts.Organization do
      allow_nil? true
      public? true
    end

    has_many :memberships, Petitionu.Post.ClassroomMembership do
      public? true
    end

    has_many :petitions, Petitionu.Post.Petition do
      public? true
    end
  end

  calculations do
    calculate :member_count,
              :integer,
              expr(count(memberships, query: [filter: expr(status == :active)])) do
      public? true
    end

    calculate :petition_count, :integer, expr(count(petitions)) do
      public? true
    end
  end

  identities do
    identity :unique_join_code, [:join_code]
  end
end

defmodule Petitionu.Post.Classroom.Changes.GenerateJoinCode do
  @moduledoc "Generates a unique UUID join code for a classroom"
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.force_change_attribute(changeset, :join_code, Ash.UUID.generate())
  end
end
