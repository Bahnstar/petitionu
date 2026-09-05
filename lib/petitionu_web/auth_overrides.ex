defmodule PetitionuWeb.AuthOverrides do
  use AshAuthentication.Phoenix.Overrides

  alias AshAuthentication.Phoenix.Components

  override AshAuthentication.Phoenix.SignInLive do
    set :root_class, "auth-page"
  end

  override AshAuthentication.Phoenix.ResetLive do
    set :root_class, "auth-page"
  end

  override AshAuthentication.Phoenix.ConfirmLive do
    set :root_class, "auth-page"
  end

  override AshAuthentication.Phoenix.MagicSignInLive do
    set :root_class, "auth-page"
  end

  override AshAuthentication.Phoenix.SignOutLive do
    set :root_class, "auth-page"
  end

  override Components.Banner do
    set :image_url, nil
    set :dark_image_url, nil
    set :text, "PetitionU ✳"
    set :text_class, "auth-brand-text"
    set :root_class, "auth-brand"
    set :href_url, "/ash-typescript"
  end

  override Components.SignIn do
    set :show_banner, true
    set :root_class, "auth-panel"
    set :strategy_class, "w-full"
    set :authentication_error_container_class, "auth-error"
    set :authentication_error_text_class, "auth-error"
  end

  override Components.Password do
    set :root_class, "w-full"
    set :interstitial_class, "auth-links"
    set :toggler_class, "auth-link"
    set :register_toggle_text, "Create an account"
    set :sign_in_toggle_text, "Back to sign in"
  end

  override Components.Password.SignInForm do
    set :label_class, "auth-heading"
    set :form_class, "w-full"
  end

  override Components.Password.RegisterForm do
    set :label_class, "auth-heading"
    set :form_class, "w-full"
    set :button_text, "Create account"
    set :disable_button_text, "Creating account…"
  end

  override Components.Password.ResetForm do
    set :label_class, "auth-heading"
    set :form_class, "w-full"
    set :button_text, "Send reset link"
  end

  override Components.Reset.Form do
    set :label_class, "auth-heading"
    set :form_class, "w-full"
  end

  override Components.Password.Input do
    set :field_class, "auth-field"
    set :label_class, "auth-label"
    set :input_class, "auth-input"
    set :input_class_with_error, "auth-input auth-input-error"
    set :submit_class, "auth-submit"
    set :error_ul, "auth-error"
    set :error_li, "mt-1"
    set :password_confirmation_input_label, "Confirm password"
    set :remember_me_class, "flex items-center gap-2 my-4"
    set :checkbox_class, "size-4 accent-[#204c48]"
    set :checkbox_label_class, "text-sm text-[#567269]"
  end

  override Components.Reset do
    set :root_class, "auth-panel"
    set :strategy_class, "w-full"
  end

  override Components.Confirm do
    set :root_class, "auth-panel"
    set :strategy_class, "w-full"
  end

  override Components.Confirm.Input do
    set :submit_class, "auth-submit"
  end

  override Components.MagicLink do
    set :root_class, "w-full"
    set :label_class, "auth-heading"
  end

  override Components.MagicLink.Input do
    set :submit_class, "auth-submit"
  end

  override Components.HorizontalRule do
    set :root_class, "relative my-6"
    set :hr_inner_class, "w-full border-t border-[#d7e5df]"
    set :text_inner_class, "px-3 bg-white text-[#567269] text-sm"
  end

  override Components.SignOut do
    set :root_class, "auth-panel"
    set :h2_class, "auth-heading"
    set :info_text_class, "text-sm text-[#567269]"
    set :button_class, "auth-submit"
  end
end
