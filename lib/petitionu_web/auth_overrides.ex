defmodule PetitionuWeb.AuthOverrides do
  use AshAuthentication.Phoenix.Overrides

  alias AshAuthentication.Phoenix.Components

  # Drop the Ash logo banner; show the PetitionU wordmark instead.
  override Components.Banner do
    set :image_url, nil
    set :dark_image_url, nil
    set :text, "PetitionU"
    set :text_class, "text-2xl font-semibold text-base-content"
    set :root_class, "w-full flex justify-center py-8"
  end

  # The sign-in page carries its own branding; hide the banner there.
  override Components.SignIn do
    set :show_banner, false
  end
end
