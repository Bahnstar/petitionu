defmodule Petitionu.MailerTest do
  use ExUnit.Case, async: false
  import Swoosh.TestAssertions

  alias Petitionu.Accounts.User.Senders.{
    SendMagicLinkEmail,
    SendNewUserConfirmationEmail,
    SendPasswordResetEmail
  }

  alias Petitionu.Post.ClassroomMembership.Senders.{
    SendClassroomInviteEmail,
    SendMembershipApprovalEmail
  }

  setup do
    previous = Application.get_env(:petitionu, :email)

    Application.put_env(:petitionu, :email,
      from: {"PetitionU", "mail@campus.test"},
      support: "help@campus.test"
    )

    on_exit(fn ->
      if previous,
        do: Application.put_env(:petitionu, :email, previous),
        else: Application.delete_env(:petitionu, :email)
    end)

    :ok
  end

  test "authentication emails use the configured sender, support, recipient, and acceptance URL" do
    for {sender, path} <- [
          {SendMagicLinkEmail, "/magic_link/"},
          {SendNewUserConfirmationEmail, "/confirm_new_user/"},
          {SendPasswordResetEmail, "/password-reset/"}
        ] do
      sender.send(%{email: "student@campus.test"}, "test-token", [])
      assert_receive {:email, email}
      assert email.from == {"PetitionU", "mail@campus.test"}
      assert email.reply_to == {"", "help@campus.test"}
      assert email.to == [{"", "student@campus.test"}]
      assert email.html_body =~ PetitionuWeb.Endpoint.url() <> path <> "test-token"
    end
  end

  test "classroom mail escapes user content and uses configured sender" do
    user = %{email: "student@campus.test", first_name: "<script>"}
    classroom = %{name: "<b>Class</b>", description: "<img src=x>"}
    SendClassroomInviteEmail.send(user, classroom, nil)
    SendMembershipApprovalEmail.send(user, classroom)

    for _ <- 1..2 do
      assert_receive {:email, email}
      assert email.from == {"PetitionU", "mail@campus.test"}
      assert email.to == [{"", "student@campus.test"}]
      assert email.html_body =~ "&lt;b&gt;Class&lt;/b&gt;"
      refute email.html_body =~ "<script>"
      assert email.html_body =~ PetitionuWeb.Endpoint.url()
    end

    assert_no_email_sent()
  end
end
