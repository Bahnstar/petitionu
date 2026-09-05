Logger.configure(level: :warning)

alias Petitionu.Accounts.{Organization, User}
alias Petitionu.Post.Category

unless Mix.env() in [:dev, :test] and
         Petitionu.Repo.config()[:hostname] in ["localhost", "127.0.0.1"] do
  raise "MVP browser fixtures require a local development or test database"
end

password = "PetitionU-MVP-only-2026!"
{:ok, password_hash} = AshAuthentication.BcryptProvider.hash(password)

north =
  Ash.Seed.upsert!(Organization, %{
    id: "2a000000-0000-7000-8000-000000000001",
    name: "North Campus",
    domain: "north.mvp.petitionu.test",
    description: "Synthetic campus for browser acceptance checks"
  })

south =
  Ash.Seed.upsert!(Organization, %{
    id: "2a000000-0000-7000-8000-000000000002",
    name: "South Campus",
    domain: "south.mvp.petitionu.test",
    description: "Synthetic campus for browser acceptance checks"
  })

category =
  Ash.Seed.upsert!(Category, %{
    id: "2a000000-0000-7000-8000-000000000003",
    name: "Campus life",
    description: "Student life and campus services",
    organization_id: north.id
  })

operators = [
  {:admin, "2a000000-0000-7000-8000-000000000004", "admin@north.mvp.petitionu.test", "Robin",
   "Carter", :admin, north.id},
  {:professor, "2a000000-0000-7000-8000-000000000005", "professor@north.mvp.petitionu.test",
   "Jordan", "Lee", :professor, north.id},
  {:outsider, "2a000000-0000-7000-8000-000000000006", "student@south.mvp.petitionu.test", "Casey",
   "Rivera", :student, south.id}
]

accounts =
  Map.new(operators, fn {key, id, email, first_name, last_name, role, organization_id} ->
    existing = Ash.get!(User, id, authorize?: false, not_found_error?: false)

    if existing && to_string(existing.email) != email do
      raise "Fixture ID #{id} belongs to an unexpected account"
    end

    user =
      Ash.Seed.upsert!(User, %{
        id: id,
        email: email,
        first_name: first_name,
        last_name: last_name,
        hashed_password: password_hash,
        confirmed_at: DateTime.utc_now(),
        organization_id: organization_id,
        role: role
      })

    {key, %{id: user.id, email: email, password: password}}
  end)

fixtures = %{
  accounts: accounts,
  password: password,
  north: %{id: north.id, domain: north.domain, name: north.name},
  south: %{id: south.id, domain: south.domain, name: south.name},
  category: %{id: category.id, name: category.name}
}

path = System.get_env("MVP_FIXTURES") || "/tmp/petitionu-mvp-fixtures.json"
File.write!(path, Jason.encode!(fixtures, pretty: true))
IO.puts("MVP fixtures written to #{path}")
