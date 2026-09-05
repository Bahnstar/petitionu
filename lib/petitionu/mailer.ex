defmodule Petitionu.Mailer do
  use Swoosh.Mailer, otp_app: :petitionu

  def new_email do
    config = Application.fetch_env!(:petitionu, :email)

    Swoosh.Email.new()
    |> Swoosh.Email.from(Keyword.fetch!(config, :from))
    |> Swoosh.Email.reply_to(Keyword.fetch!(config, :support))
  end

  def escape(value) do
    value |> to_string() |> Phoenix.HTML.html_escape() |> Phoenix.HTML.safe_to_string()
  end
end
