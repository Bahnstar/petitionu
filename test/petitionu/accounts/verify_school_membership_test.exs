defmodule Petitionu.Accounts.VerifySchoolMembershipTest do
  use Petitionu.DataCase, async: true
  use Oban.Testing, repo: Petitionu.Repo

  alias Petitionu.Accounts
  alias Petitionu.Accounts.{Organization, User, VerifySchoolMembership}

  test "verifies the school, saves registry evidence, and activates all queued users without another lookup" do
    {first, organization} = pending_user()
    {second, _} = pending_user(organization)

    assert :ok = perform_job(VerifySchoolMembership, %{user_id: first.id})
    assert_received {:registry_lookup, _}
    verified = Ash.get!(Organization, organization.id, authorize?: false)
    assert verified.verification_status == :verified
    assert verified.name == "Registry University"
    assert verified.registry_name == "Registry University"
    assert verified.registry_source == "test-registry"
    assert verified.registry_checked_at
    assert is_nil(verified.registry_error)

    assert :ok = perform_job(VerifySchoolMembership, %{user_id: second.id})
    assert :ok = perform_job(VerifySchoolMembership, %{user_id: first.id})
    refute_received {:registry_lookup, _}

    for user <- [first, second] do
      stored = Ash.get!(User, user.id, authorize?: false)
      assert stored.organization_id == organization.id
      assert is_nil(stored.pending_organization_id)
      assert stored.role == :student
    end
  end

  test "a failed lookup remains pending and a later retry activates membership" do
    {user, organization} = pending_user()
    Process.put({Petitionu.RegistryStub, :result}, {:error, :unavailable})
    assert {:error, :unavailable} = perform_job(VerifySchoolMembership, %{user_id: user.id})
    assert_received {:registry_lookup, _}
    failed = Ash.get!(Organization, organization.id, authorize?: false)
    assert failed.verification_status == :pending
    assert failed.registry_error == :unavailable
    assert failed.registry_checked_at
    assert is_nil(Ash.get!(User, user.id, authorize?: false).organization_id)

    assert {:snooze, 60} = perform_job(VerifySchoolMembership, %{user_id: user.id})
    refute_received {:registry_lookup, _}
    Ash.Seed.update!(failed, %{registry_checked_at: DateTime.add(DateTime.utc_now(), -61)})
    Process.delete({Petitionu.RegistryStub, :result})
    assert :ok = perform_job(VerifySchoolMembership, %{user_id: user.id})
    assert Ash.get!(User, user.id, authorize?: false).organization_id == organization.id
  end

  test "a saved job runs after the original confirmation process exits" do
    {user, organization} = Task.async(fn -> pending_user() end) |> Task.await()
    assert_enqueued(worker: VerifySchoolMembership, args: %{user_id: user.id})
    assert :ok = perform_job(VerifySchoolMembership, %{user_id: user.id})
    assert Ash.get!(User, user.id, authorize?: false).organization_id == organization.id
  end

  test "ordinary users cannot activate pending membership or bypass registry status" do
    {user, organization} = pending_user()
    params = %{organization_id: organization.id, domain: organization.domain, email: user.email}

    assert {:error, %Ash.Error.Forbidden{}} =
             user
             |> Ash.Changeset.for_update(:activate_pending_organization, params, actor: user)
             |> Ash.update(actor: user)

    assert {:error, _} =
             user
             |> Ash.Changeset.for_update(:activate_pending_organization, params)
             |> Ash.update(authorize?: false)

    assert is_nil(Ash.get!(User, user.id, authorize?: false).organization_id)
  end

  test "does not overwrite an existing membership or enroll an unconfirmed user" do
    {user, organization} = pending_user()

    other =
      Organization
      |> Ash.Changeset.for_create(:create, %{name: "Other school"})
      |> Ash.create!(authorize?: false)

    Ash.Seed.update!(user, %{organization_id: other.id})
    assert :ok = perform_job(VerifySchoolMembership, %{user_id: user.id})
    assert Ash.get!(User, user.id, authorize?: false).organization_id == other.id
    {unconfirmed, _} = pending_user(organization)
    Ash.Seed.update!(unconfirmed, %{confirmed_at: nil})
    assert :ok = perform_job(VerifySchoolMembership, %{user_id: unconfirmed.id})
    assert is_nil(Ash.get!(User, unconfirmed.id, authorize?: false).organization_id)
    refute_received {:registry_lookup, _}
  end

  test "does not activate membership for a changed domain" do
    {user, organization} = pending_user()
    Ash.Seed.update!(organization, %{domain: "another.edu"})
    assert {:cancel, _} = perform_job(VerifySchoolMembership, %{user_id: user.id})
    assert is_nil(Ash.get!(User, user.id, authorize?: false).organization_id)
    refute_received {:registry_lookup, _}
  end

  test "a deleted user needs no registry request" do
    assert :ok = perform_job(VerifySchoolMembership, %{user_id: Ash.UUID.generate()})
    refute_received {:registry_lookup, _}
  end

  test "Oban persists a failed attempt and schedules its retry" do
    {user, _organization} = pending_user()
    Process.put({Petitionu.RegistryStub, :result}, {:error, :inconclusive})
    assert %{failure: 1, success: 0} = Oban.drain_queue(queue: :school_registry)
    job = Repo.one!(Oban.Job.query(worker: VerifySchoolMembership, args: %{user_id: user.id}))
    assert job.state == "retryable"
    assert job.attempt == 1
    assert DateTime.compare(job.scheduled_at, DateTime.utc_now()) == :gt
  end

  test "stale lookup results cannot verify a different domain" do
    {user, organization} = pending_user()

    Process.put({Petitionu.RegistryStub, :result}, fn _ ->
      Ash.Seed.update!(organization, %{domain: "changed.edu"})
      {:ok, %{name: "Old school", source: "test-registry"}}
    end)

    assert {:error, _} = perform_job(VerifySchoolMembership, %{user_id: user.id})

    assert Ash.get!(Organization, organization.id, authorize?: false).verification_status ==
             :pending

    assert is_nil(Ash.get!(User, user.id, authorize?: false).organization_id)
  end

  test "membership changed during the lookup cannot be overwritten by a stale worker" do
    {user, _organization} = pending_user()

    other =
      Organization
      |> Ash.Changeset.for_create(:create, %{name: "Other school"})
      |> Ash.create!(authorize?: false)

    Process.put({Petitionu.RegistryStub, :result}, fn _ ->
      Ash.Seed.update!(user, %{organization_id: other.id})
      {:ok, %{name: "Registry University", source: "test-registry"}}
    end)

    assert {:error, _} = perform_job(VerifySchoolMembership, %{user_id: user.id})
    assert Ash.get!(User, user.id, authorize?: false).organization_id == other.id
  end

  test "preserves a chosen school name and invalidates registry evidence when its domain changes" do
    {user, organization} = pending_user()

    organization
    |> Ash.Changeset.for_update(:update, %{name: "Chosen School Name"})
    |> Ash.update!(authorize?: false)

    assert :ok = perform_job(VerifySchoolMembership, %{user_id: user.id})
    verified = Ash.get!(Organization, organization.id, authorize?: false)
    assert verified.name == "Chosen School Name"
    assert verified.registry_name == "Registry University"

    changed =
      verified
      |> Ash.Changeset.for_update(:update, %{domain: "new-school.edu"})
      |> Ash.update!(authorize?: false)

    assert changed.verification_status == :pending
    assert is_nil(changed.registry_name)
    assert is_nil(changed.registry_source)
    assert is_nil(changed.registry_checked_at)
  end

  defp pending_user(organization \\ nil) do
    domain =
      if organization,
        do: to_string(organization.domain),
        else: "school#{System.unique_integer([:positive])}.edu"

    email = "student#{System.unique_integer([:positive])}@#{domain}"
    strategy = AshAuthentication.Info.strategy!(User, :magic_link)
    assert :ok = AshAuthentication.Strategy.action(strategy, :request, %{"email" => email})
    assert_receive {:email, message}
    [_, token] = Regex.run(~r{/magic_link/([^"<]+)}, message.html_body)

    assert {:ok, user} =
             AshAuthentication.Strategy.action(strategy, :sign_in, %{"token" => token})

    {user, Accounts.organization_by_domain!(domain, authorize?: false)}
  end
end
