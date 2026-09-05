defmodule Petitionu.RuntimeConfigTest do
  use ExUnit.Case, async: false

  @environment %{
    "PHX_HOST" => "petition.campus.test",
    "DATABASE_URL" => "ecto://postgres:postgres@localhost/petitionu_test",
    "RESEND_API_KEY" => "test-key",
    "MAIL_FROM" => "mail@campus.test",
    "SUPPORT_EMAIL" => "help@campus.test",
    "TOKEN_SIGNING_SECRET" => String.duplicate("t", 64),
    "SECRET_KEY_BASE" => String.duplicate("s", 64)
  }

  setup do
    previous = Map.new(@environment, fn {key, _value} -> {key, System.get_env(key)} end)
    System.put_env(@environment)

    on_exit(fn ->
      Enum.each(previous, fn {key, value} ->
        if value, do: System.put_env(key, value), else: System.delete_env(key)
      end)
    end)

    :ok
  end

  test "production uses Resend and explicit sender settings" do
    config = Config.Reader.read!("config/runtime.exs", env: :prod, target: :host)
    assert config[:petitionu][Petitionu.Mailer][:adapter] == Swoosh.Adapters.Resend
    assert config[:petitionu][Petitionu.Mailer][:api_key] == "test-key"
    assert config[:petitionu][:email][:from] == {"PetitionU", "mail@campus.test"}
    assert config[:petitionu][:email][:support] == "help@campus.test"
    assert config[:petitionu][PetitionuWeb.Endpoint][:url][:host] == "petition.campus.test"
  end

  test "production rejects missing and empty required environment variables" do
    for {key, value} <- @environment, missing <- [nil, " "] do
      if missing, do: System.put_env(key, missing), else: System.delete_env(key)

      assert_raise RuntimeError, ~r/#{key}/, fn ->
        Config.Reader.read!("config/runtime.exs", env: :prod, target: :host)
      end

      System.put_env(key, value)
    end
  end

  test "production rejects malformed sender and support addresses" do
    for key <- ["MAIL_FROM", "SUPPORT_EMAIL"] do
      System.put_env(key, "invalid\naddress")

      assert_raise RuntimeError, ~r/#{key}/, fn ->
        Config.Reader.read!("config/runtime.exs", env: :prod, target: :host)
      end

      System.put_env(key, @environment[key])
    end
  end
end
