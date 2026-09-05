defmodule Petitionu.Accounts do
  use Ash.Domain, otp_app: :petitionu, extensions: [AshAdmin.Domain, AshTypescript.Rpc]

  admin do
    show? true
  end

  typescript_rpc do
    resource Petitionu.Accounts.SupportRequest do
      rpc_action :get_support_requests, :read
      rpc_action :get_my_support_requests, :mine
      rpc_action :create_support_request, :create
      rpc_action :resolve_support_request, :resolve
      rpc_action :support_contact, :support_contact
    end

    resource Petitionu.Accounts.Organization do
      rpc_action :get_organizations, :read
    end

    resource Petitionu.Accounts.User do
      rpc_action :get_users, :read_users, enable_filter?: false, enable_sort?: false
      rpc_action :get_user_by_id, :read_by_id
      rpc_action :get_me, :me
      rpc_action :update_my_profile, :update_my_profile, identities: [], read_action: :me
      rpc_action :set_user_role, :set_role
    end

    resource Petitionu.Accounts.Preference do
      rpc_action :get_preferences, :read
    end

    resource Petitionu.Accounts.Notification do
      rpc_action :get_notifications, :read
    end
  end

  resources do
    resource Petitionu.Accounts.SupportRequest
    resource Petitionu.Accounts.Token

    resource Petitionu.Accounts.User do
      define :get_user_by_email, action: :get_by_email, args: [:email]
      define :set_user_role, action: :set_role
    end

    resource Petitionu.Accounts.Organization
    resource Petitionu.Accounts.Preference
    resource Petitionu.Accounts.Notification
  end
end
