defmodule Petitionu.Post do
  use Ash.Domain,
    extensions: [AshTypescript.Rpc]

  typescript_rpc do
    resource Petitionu.Post.Petition do
      rpc_action :get_petitions, :read
      rpc_action :get_petition_by_id, :get_by_id
      rpc_action :create_petition, :create
      rpc_action :create_classroom_petition, :create_classroom_petition
      rpc_action :get_classroom_petitions, :for_classroom
      rpc_action :get_public_petitions, :public_petitions
    end

    resource Petitionu.Post.Update do
      rpc_action :get_updates, :read
      rpc_action :get_updates_for_petition, :for_petition
      rpc_action :create_update, :create
    end

    resource Petitionu.Post.Signature do
      rpc_action :get_signatures, :read
      rpc_action :create_signature, :create
    end

    resource Petitionu.Post.Comment do
      rpc_action :get_comments, :read
      rpc_action :create_comment, :create
    end

    resource Petitionu.Post.Category do
      rpc_action :get_categories, :read
    end

    resource Petitionu.Post.Classroom do
      rpc_action :get_classrooms, :read
      rpc_action :get_classroom_by_id, :get_by_id
      rpc_action :get_my_classrooms, :my_classrooms
      rpc_action :create_classroom, :create
      rpc_action :update_classroom, :update
      rpc_action :archive_classroom, :archive
      rpc_action :unarchive_classroom, :unarchive
      rpc_action :regenerate_join_code, :regenerate_join_code
    end

    resource Petitionu.Post.ClassroomMembership do
      rpc_action :get_classroom_memberships, :read
      rpc_action :get_memberships_for_classroom, :for_classroom
      rpc_action :get_pending_memberships, :pending_for_classroom
      rpc_action :join_classroom_by_code, :join_by_code
      rpc_action :request_to_join_classroom, :request_to_join
      rpc_action :invite_to_classroom, :invite_by_email
      rpc_action :approve_membership, :approve
      rpc_action :remove_from_classroom, :remove
      rpc_action :promote_to_ta, :promote_to_ta
      rpc_action :demote_to_student, :demote_to_student
    end
  end

  resources do
    resource Petitionu.Post.Petition do
      define :create_classroom_petition, action: :create_classroom_petition
      define :list_classroom_petitions, action: :for_classroom, args: [:classroom_id]
      define :list_public_petitions, action: :public_petitions
    end

    resource Petitionu.Post.Update do
      define :create_update, action: :create
      define :list_petition_updates, action: :for_petition, args: [:petition_id]
    end

    resource Petitionu.Post.Signature
    resource Petitionu.Post.Comment
    resource Petitionu.Post.Category

    resource Petitionu.Post.Classroom do
      define :create_classroom, action: :create
      define :get_classroom_by_id, action: :get_by_id, args: [:id]
      define :get_classroom_by_join_code, action: :get_by_join_code, args: [:join_code]
      define :list_my_classrooms, action: :my_classrooms
      define :archive_classroom, action: :archive
      define :unarchive_classroom, action: :unarchive
      define :regenerate_classroom_join_code, action: :regenerate_join_code
    end

    resource Petitionu.Post.ClassroomMembership do
      define :join_classroom_by_code, action: :join_by_code
      define :request_to_join_classroom, action: :request_to_join
      define :invite_to_classroom, action: :invite_by_email
      define :approve_classroom_membership, action: :approve
      define :remove_from_classroom, action: :remove
      define :promote_member_to_ta, action: :promote_to_ta
      define :demote_member_to_student, action: :demote_to_student
      define :list_classroom_memberships, action: :for_classroom, args: [:classroom_id]
      define :list_pending_memberships, action: :pending_for_classroom, args: [:classroom_id]
    end
  end
end
