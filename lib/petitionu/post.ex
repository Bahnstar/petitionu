defmodule Petitionu.Post do
  use Ash.Domain,
    extensions: [AshTypescript.Rpc]

  typescript_rpc do
    resource Petitionu.Post.Petition do
      rpc_action :get_petitions, :read
      rpc_action :get_petition_by_id, :get_by_id
      rpc_action :create_petition, :create
    end

    resource Petitionu.Post.Update do
      rpc_action :get_updates, :read
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

    # resource Petitionu.Post.UserPetition do
    #   rpc_action :list_user_petitions, :read
    #   rpc_action :create_user_petition, :create
    # end
  end

  resources do
    resource Petitionu.Post.Petition
    resource Petitionu.Post.Update
    resource Petitionu.Post.Signature
    resource Petitionu.Post.Comment
    resource Petitionu.Post.Category
    # resource Petitionu.Post.UserPetition
  end
end
