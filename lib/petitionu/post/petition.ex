defmodule Petitionu.Post.Petition do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshTypescript.Resource]

  postgres do
    table "petition"
    repo Petitionu.Repo

    references do
      reference :classroom, on_delete: :delete
    end
  end

  typescript do
    type_name "Petition"
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:title, :description, :status, :goal, :deadline, :allow_comments, :is_anonymous]

      argument :category_id, :uuid_v7 do
        allow_nil? false
      end

      change manage_relationship(:category_id, :category,
               type: :append_and_remove,
               on_lookup: :relate
               # on_no_match: :errror
             )
    end

    create :create_classroom_petition do
      description "Create a petition scoped to a classroom"
      accept [:title, :description, :status, :goal, :deadline, :allow_comments, :is_anonymous]

      argument :category_id, :uuid_v7 do
        allow_nil? false
      end

      argument :classroom_id, :uuid_v7 do
        allow_nil? false
      end

      change manage_relationship(:category_id, :category,
               type: :append_and_remove,
               on_lookup: :relate
             )

      change set_attribute(:classroom_id, arg(:classroom_id))
      change relate_actor(:user)
    end

    update :update do
      primary? true
      accept [:title, :description, :status, :goal, :deadline]
    end

    read :get_by_id do
      get_by :id
    end

    read :for_classroom do
      description "Get all petitions for a specific classroom"

      argument :classroom_id, :uuid_v7 do
        allow_nil? false
      end

      prepare fn query, _context ->
        classroom_id = Ash.Query.get_argument(query, :classroom_id)

        require Ash.Query
        Ash.Query.filter(query, classroom_id == ^classroom_id)
      end
    end

    read :public_petitions do
      description "Get all public petitions (not in any classroom)"

      prepare fn query, _context ->
        require Ash.Query
        Ash.Query.filter(query, is_nil(classroom_id))
      end
    end
  end

  policies do
    # Public petitions (no classroom_id) can be read by anyone
    policy action_type(:read) do
      authorize_if expr(is_nil(classroom_id))
      # Classroom petitions: must be professor or active member
      authorize_if expr(classroom.professor_id == ^actor(:id))

      authorize_if expr(
                     exists(
                       classroom.memberships,
                       user_id == ^actor(:id) and status == :active
                     )
                   )
    end

    # Anyone authenticated can create public petitions
    policy action(:create) do
      authorize_if actor_present()
    end

    # Classroom petition creation: professor OR (member when allowed)
    policy action(:create_classroom_petition) do
      # Professor can always create
      authorize_if expr(classroom.professor_id == ^actor(:id))
      # Active members can create if allowed
      authorize_if expr(
                     classroom.allow_student_petitions == true and
                       exists(
                         classroom.memberships,
                         user_id == ^actor(:id) and status == :active
                       )
                   )
    end

    # Only petition owner can update/destroy
    policy action([:update, :destroy]) do
      authorize_if relates_to_actor_via(:user)
      # Professor can also update/destroy classroom petitions
      authorize_if expr(classroom.professor_id == ^actor(:id))
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

    timestamps(public?: true)
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

    belongs_to :classroom, Petitionu.Post.Classroom do
      public? true
      attribute_public? true
      allow_nil? true
    end

    has_many :updates, Petitionu.Post.Update do
      public? true
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

    calculate :is_classroom_petition, :boolean, expr(not is_nil(classroom_id)) do
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

    calculate :trending,
              :boolean,
              expr(
                # Trending if:
                # 1. Has more than 10 signatures
                # 2. Created within the last 7 days
                # 3. Has a good signature velocity (signatures per day)
                # 4. Is 50% or more of the way to its goal
                # fragment("p0.inserted_at > NOW() - INTERVAL '7 days'") and
                # signatures_count /
                #   fragment("GREATEST(1, EXTRACT(EPOCH FROM (NOW() - p0.inserted_at)) / 86400)") >
                #   2.0 and
                signatures_count > 5 and
                  signatures_count / goal >= 0.5
              ) do
      public? true
    end
  end
end
