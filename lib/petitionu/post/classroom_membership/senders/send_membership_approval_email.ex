defmodule Petitionu.Post.ClassroomMembership.Senders.SendMembershipApprovalEmail do
  @moduledoc """
  Sends an email to a user when their classroom membership is approved
  """

  use PetitionuWeb, :verified_routes

  import Swoosh.Email
  alias Petitionu.Mailer

  def send(user, classroom) do
    Mailer.new_email()
    |> to(to_string(user.email))
    |> subject("You've been approved to join #{classroom.name}")
    |> html_body(body(user: user, classroom: classroom))
    |> Mailer.deliver!()
  end

  defp body(params) do
    """
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to #{Mailer.escape(params[:classroom].name)}!</h2>
      <p>Hello#{if params[:user].first_name, do: " #{Mailer.escape(params[:user].first_name)}", else: ""}!</p>
      <p>Great news! Your request to join <strong>#{Mailer.escape(params[:classroom].name)}</strong> has been approved.</p>
      <p>You can now:</p>
      <ul>
        <li>View and sign petitions in this classroom</li>
        <li>Comment on classroom petitions</li>
        <li>Create new petitions (if enabled by your professor)</li>
      </ul>
      <p style="margin-top: 20px;">
        <a href="#{url(~p"/")}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Go to Classroom
        </a>
      </p>
    </div>
    """
  end
end
