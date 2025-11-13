defmodule Petitionu.Secrets do
  use AshAuthentication.Secret

  def secret_for(
        [:authentication, :tokens, :signing_secret],
        Petitionu.Accounts.User,
        _opts,
        _context
      ) do
    Application.fetch_env(:petitionu, :token_signing_secret)
  end
end
