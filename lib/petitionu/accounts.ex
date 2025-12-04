defmodule Petitionu.Accounts do
  use Ash.Domain, otp_app: :petitionu, extensions: [AshAdmin.Domain, AshTypescript.Rpc]

  admin do
    show? true
  end

  typescript_rpc do
    resource Petitionu.Accounts.Organization do
      rpc_action :get_organizations, :read
    end

    resource Petitionu.Accounts.User do
      rpc_action :get_users, :read_users
      rpc_action :get_user_by_id, :read_by_id
    end

    resource Petitionu.Accounts.Preference do
      rpc_action :get_preferences, :read
    end

    resource Petitionu.Accounts.Notification do
      rpc_action :get_notifications, :read
    end
  end

  resources do
    resource Petitionu.Accounts.Token
    resource Petitionu.Accounts.User
    resource Petitionu.Accounts.Organization
    resource Petitionu.Accounts.Preference
    resource Petitionu.Accounts.Notification
  end
end
