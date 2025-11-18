defmodule Petitionu.Post do
  use Ash.Domain,
    extensions: [AshTypescript.Rpc]

  typescript_rpc do
    resource Petitionu.Post.Petition do
      rpc_action :list_petitions, :read
      rpc_action :create_petition, :create
    end

    resource Petitionu.Post.Comment do
      rpc_action :list_comments, :read
      rpc_action :create_comment, :create
    end

    # resource Petitionu.Post.UserPetition do
    #   rpc_action :list_user_petitions, :read
    #   rpc_action :create_user_petition, :create
    # end
  end

  resources do
    resource Petitionu.Post.Petition
    resource Petitionu.Post.Comment
    # resource Petitionu.Post.UserPetition
  end
end
