defmodule Petitionu.Post.ClassroomMembership do
  use Ash.Resource,
    otp_app: :petitionu,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    authorizers: [Ash.Policy.Authorizer],
    extensions: [AshTypescript.Resource]

  postgres do
    table "classroom_memberships"
    repo Petitionu.Repo

    references do
      reference :classroom, on_delete: :delete
      reference :user, on_delete: :delete
      reference :invited_by, on_delete: :nilify
    end
  end

  typescript do
    type_name "ClassroomMembership"
  end

  actions do
    defaults [:read, :destroy]

    create :join_by_code do
      description "Join a classroom using a join code"
      accept []

      argument :join_code, :uuid do
        allow_nil? false
      end

      change fn changeset, context ->
        join_code = Ash.Changeset.get_argument(changeset, :join_code)

        case Petitionu.Post.get_classroom_by_join_code(join_code) do
          {:ok, classroom} ->
            changeset
            |> Ash.Changeset.force_change_attribute(:classroom_id, classroom.id)
            |> Ash.Changeset.force_change_attribute(:status, :active)
            |> Ash.Changeset.force_change_attribute(:role, :student)
            |> Ash.Changeset.force_change_attribute(:joined_at, DateTime.utc_now())

          {:error, _} ->
            Ash.Changeset.add_error(changeset, field: :join_code, message: "Invalid join code")
        end
      end

      change relate_actor(:user)
    end

    create :request_to_join do
      description "Request to join a classroom (requires approval)"
      accept []

      argument :classroom_id, :uuid do
        allow_nil? false
      end

      change set_attribute(:classroom_id, arg(:classroom_id))
      change set_attribute(:status, :pending)
      change set_attribute(:role, :student)
      change relate_actor(:user)
    end

    create :invite_by_email do
      description "Professor/TA invites a user by email"
      accept []

      argument :classroom_id, :uuid do
        allow_nil? false
      end

      argument :email, :ci_string do
        allow_nil? false
      end

      argument :role, :atom do
        constraints one_of: [:student, :ta]
        default :student
      end

      change fn changeset, context ->
        email = Ash.Changeset.get_argument(changeset, :email)
        role = Ash.Changeset.get_argument(changeset, :role) || :student
        classroom_id = Ash.Changeset.get_argument(changeset, :classroom_id)

        case Petitionu.Accounts.get_user_by_email(email) do
          {:ok, user} ->
            changeset
            |> Ash.Changeset.force_change_attribute(:user_id, user.id)
            |> Ash.Changeset.force_change_attribute(:classroom_id, classroom_id)
            |> Ash.Changeset.force_change_attribute(:status, :pending)
            |> Ash.Changeset.force_change_attribute(:role, role)
            |> Ash.Changeset.force_change_attribute(
              :invited_by_id,
              context.actor && context.actor.id
            )

          {:error, _} ->
            Ash.Changeset.add_error(changeset, field: :email, message: "User not found")
        end
      end

      change {Petitionu.Post.ClassroomMembership.Changes.SendInviteEmail, []}
    end

    update :approve do
      description "Approve a pending membership request or invitation"
      accept []
      require_atomic? false
      change set_attribute(:status, :active)
      change set_attribute(:joined_at, &DateTime.utc_now/0)
      change {Petitionu.Post.ClassroomMembership.Changes.SendApprovalEmail, []}
    end

    update :remove do
      description "Remove a member from the classroom"
      accept []
      change set_attribute(:status, :removed)
    end

    update :promote_to_ta do
      description "Promote a member to TA role"
      accept []
      change set_attribute(:role, :ta)
    end

    update :demote_to_student do
      description "Demote a TA to student role"
      accept []
      change set_attribute(:role, :student)
    end

    read :get_by_id do
      get_by :id
    end

    read :for_classroom do
      description "Get all memberships for a classroom"

      argument :classroom_id, :uuid do
        allow_nil? false
      end

      prepare fn query, _context ->
        classroom_id = Ash.Query.get_argument(query, :classroom_id)

        require Ash.Query
        Ash.Query.filter(query, classroom_id == ^classroom_id)
      end
    end

    read :pending_for_classroom do
      description "Get pending memberships for a classroom"

      argument :classroom_id, :uuid do
        allow_nil? false
      end

      prepare fn query, _context ->
        classroom_id = Ash.Query.get_argument(query, :classroom_id)

        require Ash.Query
        Ash.Query.filter(query, classroom_id == ^classroom_id and status == :pending)
      end
    end
  end

  policies do
    # Anyone authenticated can join by code or request to join
    policy action([:join_by_code, :request_to_join]) do
      authorize_if actor_present()
    end

    # Professor or TA can invite, approve, remove, promote, demote
    policy action([:invite_by_email, :approve, :remove, :promote_to_ta, :demote_to_student]) do
      authorize_if expr(classroom.professor_id == ^actor(:id))

      authorize_if expr(
                     exists(
                       classroom.memberships,
                       user_id == ^actor(:id) and role == :ta and status == :active
                     )
                   )
    end

    # Only professor can destroy memberships
    policy action(:destroy) do
      authorize_if expr(classroom.professor_id == ^actor(:id))
    end

    # Members can read their own membership, professor/TA can read all
    policy action_type(:read) do
      authorize_if relates_to_actor_via(:user)
      authorize_if expr(classroom.professor_id == ^actor(:id))

      authorize_if expr(
                     exists(
                       classroom.memberships,
                       user_id == ^actor(:id) and role == :ta and status == :active
                     )
                   )
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :role, :atom do
      constraints one_of: [:student, :ta]
      default :student
      allow_nil? false
      public? true
    end

    attribute :status, :atom do
      constraints one_of: [:pending, :active, :removed]
      default :pending
      allow_nil? false
      public? true
    end

    attribute :joined_at, :utc_datetime_usec do
      allow_nil? true
      public? true
    end

    timestamps(public?: true)
  end

  relationships do
    belongs_to :classroom, Petitionu.Post.Classroom do
      allow_nil? false
      public? true
    end

    belongs_to :user, Petitionu.Accounts.User do
      allow_nil? false
      public? true
    end

    belongs_to :invited_by, Petitionu.Accounts.User do
      allow_nil? true
      public? true
    end
  end

  identities do
    identity :unique_membership, [:classroom_id, :user_id]
  end
end

defmodule Petitionu.Post.ClassroomMembership.Changes.SendInviteEmail do
  @moduledoc "Sends an invitation email when a user is invited to a classroom"
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_action(changeset, fn _changeset, membership ->
      # Load the necessary relationships for sending the email
      membership = Ash.load!(membership, [:user, :invited_by, classroom: [:professor]])

      Petitionu.Post.ClassroomMembership.Senders.SendClassroomInviteEmail.send(
        membership.user,
        membership.classroom,
        membership.invited_by
      )

      {:ok, membership}
    end)
  end
end

defmodule Petitionu.Post.ClassroomMembership.Changes.SendApprovalEmail do
  @moduledoc "Sends an approval email when a membership is approved"
  use Ash.Resource.Change

  @impl true
  def change(changeset, _opts, _context) do
    Ash.Changeset.after_action(changeset, fn _changeset, membership ->
      # Load the necessary relationships for sending the email
      membership = Ash.load!(membership, [:user, classroom: [:professor]])

      Petitionu.Post.ClassroomMembership.Senders.SendMembershipApprovalEmail.send(
        membership.user,
        membership.classroom
      )

      {:ok, membership}
    end)
  end
end
