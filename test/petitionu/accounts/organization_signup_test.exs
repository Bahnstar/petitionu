defmodule Petitionu.Accounts.OrganizationSignupTest do
  use Petitionu.DataCase, async: true
  use Oban.Testing, repo: Petitionu.Repo

  alias Petitionu.Accounts
  alias Petitionu.Accounts.{Organization, User, VerifySchoolMembership}

  @password "password123"

  test "password registration waits for confirmation before creating an organization" do
    domain = school_domain()
    user = register("alex@#{domain}")
    assert is_nil(user.organization_id)
    assert is_nil(user.confirmed_at)
    assert Accounts.organization_by_domain!(domain, authorize?: false) == nil

    user = confirm(user)
    organization = Accounts.organization_by_domain!(domain, authorize?: false)
    assert is_nil(user.organization_id)
    assert user.pending_organization_id == organization.id
    assert organization.verification_status == :pending
    assert_enqueued(worker: VerifySchoolMembership, args: %{user_id: user.id})
    assert user.confirmed_at
    assert organization.name == domain
    assert user.role == :student
    assert user.__metadata__.token
    assert :ok = perform_job(VerifySchoolMembership, %{user_id: user.id})
    assert Ash.get!(User, user.id, authorize?: false).organization_id == organization.id
  end

  test "joins an existing school without replacing its name or settings" do
    domain = school_domain()
    organization = organization!(domain, name: "Named University", allow_public_signatures: true)

    first = register("alex@#{domain}") |> confirm()
    second = register("sam@students.#{String.upcase(domain)}") |> confirm()

    assert first.organization_id == organization.id
    assert second.organization_id == organization.id
    organization = Ash.get!(Organization, organization.id, authorize?: false)
    assert organization.name == "Named University"
    assert organization.allow_public_signatures
  end

  test "ac.uk subdomains create the school rather than an ac.uk organization" do
    domain = "school#{System.unique_integer([:positive])}.ac.uk"
    user = register("alex@students.#{domain}") |> confirm()
    assert is_nil(user.organization_id)

    assert Accounts.organization_by_domain!(domain, authorize?: false).id ==
             user.pending_organization_id

    assert :ok = perform_job(VerifySchoolMembership, %{user_id: user.id})
    assert Accounts.organization_by_domain!("ac.uk", authorize?: false) == nil
  end

  test "an explicitly configured subdomain takes precedence over its parent school" do
    domain = school_domain()
    parent = organization!(domain)
    campus = organization!("campus.#{domain}")
    user = register("alex@campus.#{domain}") |> confirm()
    assert user.organization_id == campus.id
    refute user.organization_id == parent.id
  end

  test "known non-academic domains can join but unknown domains remain unassigned" do
    domain = "school#{System.unique_integer([:positive])}.org"
    organization = organization!(domain)
    assert (register("alex@#{domain}") |> confirm()).organization_id == organization.id

    for host <- ["unknown.example", "gmail.com", "school.edu.attacker.com"] do
      user = register("alex#{System.unique_integer([:positive])}@#{host}") |> confirm()
      assert is_nil(user.organization_id)
      assert user.confirmed_at
    end
  end

  test "magic-link registration creates membership and later sign-ins preserve it" do
    domain = school_domain()
    email = "alex@#{domain}"
    user = magic_sign_in(email)
    organization = Accounts.organization_by_domain!(domain, authorize?: false)
    assert is_nil(user.organization_id)
    assert user.pending_organization_id == organization.id
    assert :ok = perform_job(VerifySchoolMembership, %{user_id: user.id})
    assert user.confirmed_at
    assert user.role == :student
    assert user.__metadata__.token

    other = organization!(school_domain())
    Ash.Seed.update!(user, %{organization_id: other.id})
    returning = magic_sign_in(email)
    assert returning.id == user.id
    assert returning.organization_id == other.id
  end

  test "password reset can assign an account that has not yet confirmed" do
    domain = school_domain()
    email = "alex@#{domain}"
    user = register(email)
    email_token("confirm_new_user")
    strategy = AshAuthentication.Info.strategy!(User, :password)
    assert :ok = AshAuthentication.Strategy.action(strategy, :reset_request, %{"email" => email})
    token = email_token("password-reset")

    assert {:ok, reset} =
             AshAuthentication.Strategy.action(strategy, :reset, %{
               "reset_token" => token,
               "password" => "new-password123",
               "password_confirmation" => "new-password123"
             })

    assert reset.id == user.id
    assert reset.confirmed_at
    assert is_nil(Ash.get!(User, reset.id, authorize?: false).organization_id)

    assert Accounts.organization_by_domain!(domain, authorize?: false).id ==
             reset.pending_organization_id

    assert :ok = perform_job(VerifySchoolMembership, %{user_id: reset.id})
  end

  test "repeated sign-ins while verification is pending share one queued job" do
    email = "alex@#{school_domain()}"
    first = magic_sign_in(email)
    second = magic_sign_in(email)
    assert first.id == second.id
    assert is_nil(second.organization_id)
    assert second.pending_organization_id == first.pending_organization_id
    assert length(all_enqueued(worker: VerifySchoolMembership, args: %{user_id: first.id})) == 1
    refute_received {:registry_lookup, _}
  end

  test "invalid confirmation and magic-link tokens never create organizations" do
    domain = school_domain()
    user = register("alex@#{domain}")
    confirmation = AshAuthentication.Info.strategy!(User, :confirm_new_user)
    magic = AshAuthentication.Info.strategy!(User, :magic_link)

    assert {:error, _} =
             AshAuthentication.Strategy.action(confirmation, :confirm, %{"confirm" => "invalid"})

    assert {:error, _} =
             AshAuthentication.Strategy.action(magic, :sign_in, %{"token" => "invalid"})

    assert is_nil(Ash.get!(User, user.id, authorize?: false).organization_id)
    assert Accounts.organization_by_domain!(domain, authorize?: false) == nil
  end

  test "ordinary users cannot assign themselves to an arbitrary organization" do
    user = register("alex@#{school_domain()}")
    organization = organization!(school_domain())

    assert {:error, %Ash.Error.Forbidden{}} =
             user
             |> Ash.Changeset.for_update(
               :assign_organization,
               %{organization_id: organization.id},
               actor: user
             )
             |> Ash.update(actor: user)
  end

  test "a failed confirmation transaction rolls back organization creation and membership" do
    domain = school_domain()
    user = register("alex@#{domain}")
    token = email_token("confirm_new_user")

    assert {:error, _} =
             user
             |> Ash.Changeset.for_update(:confirm, %{confirm: token})
             |> Ash.Changeset.after_action(fn _changeset, confirmed ->
               assert confirmed.pending_organization_id
               {:error, "simulate a failure after assignment"}
             end)
             |> Ash.update()

    stored = Ash.get!(User, user.id, authorize?: false)
    assert is_nil(stored.confirmed_at)
    assert is_nil(stored.organization_id)
    assert is_nil(stored.pending_organization_id)
    refute_enqueued(worker: VerifySchoolMembership, args: %{user_id: user.id})
    assert Accounts.organization_by_domain!(domain, authorize?: false) == nil

    strategy = AshAuthentication.Info.strategy!(User, :confirm_new_user)

    assert {:ok, retried} =
             AshAuthentication.Strategy.action(strategy, :confirm, %{"confirm" => token})

    assert is_nil(retried.organization_id)
    assert retried.pending_organization_id
    assert_enqueued(worker: VerifySchoolMembership, args: %{user_id: retried.id})
  end

  test "domain uniqueness ignores case and whitespace while unnamed domains remain optional" do
    domain = school_domain()
    organization = organization!(" #{String.upcase(domain)} ")
    assert to_string(organization.domain) == domain

    assert {:error, _} =
             Organization
             |> Ash.Changeset.for_create(:create, %{domain: domain})
             |> Ash.create(authorize?: false)

    organization!(nil)
    organization!(nil)
  end

  defp school_domain, do: "school#{System.unique_integer([:positive])}.edu"

  defp organization!(domain, attrs \\ []) do
    Organization
    |> Ash.Changeset.for_create(:create, Map.new([domain: domain] ++ attrs))
    |> Ash.create!(authorize?: false)
  end

  defp register(email) do
    User
    |> Ash.Changeset.for_create(:register_with_password, %{
      email: email,
      password: @password,
      password_confirmation: @password
    })
    |> Ash.create!(authorize?: false)
  end

  defp confirm(_user) do
    strategy = AshAuthentication.Info.strategy!(User, :confirm_new_user)
    token = email_token("confirm_new_user")

    assert {:ok, user} =
             AshAuthentication.Strategy.action(strategy, :confirm, %{"confirm" => token})

    user
  end

  defp magic_sign_in(email) do
    strategy = AshAuthentication.Info.strategy!(User, :magic_link)
    assert :ok = AshAuthentication.Strategy.action(strategy, :request, %{"email" => email})
    token = email_token("magic_link")

    assert {:ok, user} =
             AshAuthentication.Strategy.action(strategy, :sign_in, %{"token" => token})

    user
  end

  defp email_token(path) do
    assert_receive {:email, email}
    [_, token] = Regex.run(~r{/#{path}/([^"<]+)}, email.html_body)
    token
  end
end
