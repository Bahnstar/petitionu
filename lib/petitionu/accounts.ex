defmodule Petitionu.Accounts do
  use Ash.Domain, otp_app: :petitionu, extensions: [AshAdmin.Domain]

  admin do
    show? true
  end

  resources do
    resource Petitionu.Accounts.Token
    resource Petitionu.Accounts.User
  end
end
