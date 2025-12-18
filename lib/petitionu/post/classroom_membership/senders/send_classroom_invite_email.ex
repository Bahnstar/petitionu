defmodule Petitionu.Post.ClassroomMembership.Senders.SendClassroomInviteEmail do
  @moduledoc """
  Sends an email to a user when they are invited to join a classroom
  """

  use PetitionuWeb, :verified_routes

  import Swoosh.Email
  alias Petitionu.Mailer

  def send(user, classroom, invited_by) do
    inviter_name =
      if invited_by do
        name = "#{invited_by.first_name || ""} #{invited_by.last_name || ""}"
        name = String.trim(name)

        case name do
          "" -> "A professor"
          name -> name
        end
      else
        "A professor"
      end

    new()
    |> from({"PetitionU", "noreply@petitionu.com"})
    |> to(to_string(user.email))
    |> subject("You've been invited to join #{classroom.name}")
    |> html_body(body(user: user, classroom: classroom, inviter_name: inviter_name))
    |> Mailer.deliver!()
  end

  defp body(params) do
    """
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Classroom Invitation</h2>
      <p>Hello#{if params[:user].first_name, do: " #{params[:user].first_name}", else: ""}!</p>
      <p>#{params[:inviter_name]} has invited you to join the classroom <strong>#{params[:classroom].name}</strong> on PetitionU.</p>
      #{if params[:classroom].description, do: "<p><em>#{params[:classroom].description}</em></p>", else: ""}
      <p>Sign in to PetitionU to accept or decline this invitation.</p>
      <p style="margin-top: 20px;">
        <a href="#{url(~p"/")}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
          Go to PetitionU
        </a>
      </p>
    </div>
    """
  end
end
