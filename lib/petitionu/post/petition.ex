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
      accept [:title, :description, :goal, :deadline, :allow_comments, :is_anonymous]

      argument :category_id, :uuid_v7 do
        allow_nil? false
      end

      change manage_relationship(:category_id, :category,
               type: :append_and_remove,
               on_lookup: :relate
             )

      change relate_actor(:user)
      validate present([:title, :description, :goal])
      validate Petitionu.Post.Validations.FutureDeadline
      validate Petitionu.Post.Validations.Participant
      change Petitionu.Post.Changes.PetitionCampus
    end

    create :create_classroom_petition do
      description "Create a petition scoped to a classroom"
      accept [:title, :description, :goal, :deadline, :allow_comments, :is_anonymous]

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
      validate present([:title, :description, :goal])
      validate Petitionu.Post.Validations.FutureDeadline
      validate Petitionu.Post.Validations.Participant
      change Petitionu.Post.Changes.PetitionCampus
    end

    update :update do
      primary? true
      accept [:title, :description, :goal, :deadline, :allow_comments, :is_anonymous]
      require_atomic? false
      validate present([:title, :description, :goal])
      validate Petitionu.Post.Validations.FutureDeadline
    end

    update :close do
      accept []
      change set_attribute(:status, :closed)
    end

    update :mark_victory do
      accept []
      change set_attribute(:status, :victory)
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
    policy action_type(:read) do
      forbid_unless expr(is_nil(hidden_at))
      authorize_if expr(is_nil(classroom_id))
      authorize_if expr(classroom.professor_id == ^actor(:id))

      authorize_if expr(
                     exists(
                       classroom.memberships,
                       user_id == ^actor(:id) and status == :active
                     )
                   )
    end

    policy action(:create) do
      authorize_if actor_present()
    end

    policy action(:create_classroom_petition) do
      authorize_if actor_present()
    end

    policy action([:update, :close, :mark_victory, :destroy]) do
      forbid_unless expr(is_nil(hidden_at))

      forbid_unless expr(
                      is_nil(classroom_id) or classroom.professor_id == ^actor(:id) or
                        exists(
                          classroom.memberships,
                          user_id == ^actor(:id) and status == :active
                        )
                    )

      authorize_if expr(user_id == ^actor(:id))
      authorize_if expr(classroom.professor_id == ^actor(:id))
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :title, :string do
      public? true
      constraints min_length: 1, max_length: 200, trim?: true
    end

    attribute :description, :string do
      public? true
      constraints min_length: 1, max_length: 20000, trim?: true
    end

    attribute :status, :atom do
      constraints one_of: [:open, :closed, :victory]
      default :open
      public? true
    end

    attribute :goal, :integer do
      public? true
      constraints min: 1
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

    attribute :hidden_at, :utc_datetime_usec

    timestamps public?: true
  end

  relationships do
    belongs_to :user, Petitionu.Accounts.User do
      public? false
      attribute_public? false
      filterable? false
    end

    belongs_to :organization, Petitionu.Accounts.Organization do
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
  end

  calculations do
    calculate :can_manage,
              :boolean,
              expr(
                if not is_nil(^actor(:id)) and is_nil(hidden_at) and
                     (user_id == ^actor(:id) or classroom.professor_id == ^actor(:id)),
                   do: true,
                   else: false
              ) do
      public? true
    end

    calculate :has_signed, :boolean, expr(exists(signatures, user_id == ^actor(:id))) do
      public? true
    end

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

    calculate :author, :string, {Petitionu.Post.Calculations.Author, anonymous?: true} do
      public? true
      filterable? false
      sortable? false
    end

    calculate :trending,
              :boolean,
              expr(
                signatures_count > 5 and
                  signatures_count / goal >= 0.5
              ) do
      public? true
    end
  end
end
