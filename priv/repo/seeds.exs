# Script for populating the database. You can run it as:
#
#     mix run priv/repo/seeds.exs

alias Petitionu.Accounts
alias Petitionu.Post

require Ash.Query

IO.puts("Starting seed...")

# 1. Create Organization
IO.puts("Creating Organization...")

organization =
  case Ash.read_one!(Ash.Query.limit(Accounts.Organization, 1)) do
    nil ->
      Accounts.Organization
      |> Ash.Changeset.for_create(:create, %{
        name: "University of Tech",
        description: "A great place to learn",
        domain: "tech.edu",
        allow_public_signatures: true
      })
      |> Ash.create!(authorize?: false)

    org ->
      org
  end

# 2. Create Users
IO.puts("Creating Users...")

users_data = [
  %{name: "Sarah Chen", email: "sarah.chen@example.com"},
  %{name: "Michael Rodriguez", email: "michael.rodriguez@example.com"},
  %{name: "Jessica Williams", email: "jessica.williams@example.com"},
  %{name: "Alex Thompson", email: "alex.thompson@example.com"},
  %{name: "Emily Davis", email: "emily.davis@example.com"},
  %{name: "Maria Garcia", email: "maria.garcia@example.com"}
]

users =
  Enum.map(users_data, fn data ->
    [first, last] = String.split(data.name, " ")

    # Check if user exists
    case Accounts.User.get_by_email(data.email, authorize?: false) do
      {:ok, user} ->
        user

      _ ->
        # Register
        user =
          Accounts.User
          |> Ash.Changeset.for_create(:register_with_password, %{
            email: data.email,
            password: "password123",
            password_confirmation: "password123"
          })
          |> Ash.create!(authorize?: false)

        # Update profile and organization
        user
        |> Ash.Changeset.for_update(:update, %{
          first_name: first,
          last_name: last
        })
        |> Ash.update!(authorize?: false)

        # Link organization directly using Seed update to avoid action complexity
        user
        |> Ash.Seed.update!(%{organization_id: organization.id})
    end
  end)
  |> Map.new(fn user -> {to_string(user.email), user} end)

# 3. Create Categories
IO.puts("Creating Categories...")

categories_data = [
  "Academic",
  "Campus Life",
  "Finance",
  "Wellness",
  "Safety",
  "Accessibility",
  "Food & Dining",
  "Technology"
]

categories =
  Enum.map(categories_data, fn name ->
    # Check if category exists
    query =
      Post.Category
      |> Ash.Query.filter(name == ^name)
      |> Ash.Query.limit(1)

    case Ash.read_one!(query) do
      nil ->
        Post.Category
        |> Ash.Changeset.for_create(:create, %{
          name: name,
          description: "Petitions related to #{name}",
          organization_id: organization.id
        })
        |> Ash.create!(authorize?: false)

      category ->
        category
    end
  end)
  |> Map.new(fn cat -> {cat.name, cat} end)

# 4. Create Petitions
IO.puts("Creating Petitions...")

petitions_data = [
  %{
    title: "Extend Library Hours During Finals Week",
    description:
      "Students need access to study spaces beyond current closing times. This petition calls for 24/7 library access during the final two weeks of each semester.",
    author_email: "sarah.chen@example.com",
    category: "Academic",
    goal: 3000,
    signature_count: 2847,
    status: :open
  },
  %{
    title: "Add More Vegetarian Options in Dining Halls",
    description:
      "Many students follow vegetarian diets but struggle to find adequate meal options. We request at least 3 vegetarian entrees at every meal service.",
    author_email: "michael.rodriguez@example.com",
    category: "Food & Dining",
    goal: 2000,
    signature_count: 1523,
    status: :open
  },
  %{
    title: "Reduce Student Parking Fees",
    description:
      "Parking fees have increased 40% in the past two years. This petition asks the administration to reduce fees and offer more affordable alternatives.",
    author_email: "jessica.williams@example.com",
    category: "Finance",
    goal: 5000,
    signature_count: 3421,
    status: :open
  },
  %{
    title: "Implement Mental Health Days",
    description:
      "Students need mental health support. This petition proposes 2 excused mental health days per semester without penalty to academic standing.",
    author_email: "alex.thompson@example.com",
    category: "Wellness",
    goal: 4000,
    signature_count: 4156,
    status: :open
  },
  %{
    title: "Increase Campus Safety Lighting",
    description:
      "Several areas of campus are poorly lit at night. This petition requests additional lighting installations for student safety.",
    author_email: "emily.davis@example.com",
    category: "Safety",
    goal: 2500,
    signature_count: 1890,
    status: :open
  },
  %{
    title: "Add Lactation Rooms Across Campus",
    description:
      "New parents need accessible, private spaces for nursing. This petition calls for dedicated lactation rooms in every major building.",
    author_email: "maria.garcia@example.com",
    category: "Accessibility",
    goal: 1500,
    signature_count: 876,
    status: :open
  },
  %{
    title: "Improve Campus WiFi Infrastructure",
    description:
      "The current WiFi infrastructure is outdated and unreliable. We need faster speeds and better coverage in dorms and lecture halls.",
    author_email: "sarah.chen@example.com",
    category: "Technology",
    goal: 2000,
    signature_count: 2341,
    status: :open
  }
]

Enum.each(petitions_data, fn data ->
  user = users[data.author_email]
  category = categories[data.category] || categories["Campus Life"]

  # Check if petition exists
  query =
    Post.Petition
    |> Ash.Query.filter(title == ^data.title)
    |> Ash.Query.limit(1)

  petition =
    case Ash.read_one!(query) do
      nil ->
        Post.Petition
        |> Ash.Seed.seed!(%{
          title: data.title,
          description: data.description,
          goal: data.goal,
          status: data.status,
          signature_count: data.signature_count,
          user_id: user.id,
          category_id: category.id
        })

      p ->
        p
    end

  if is_nil(petition), do: IO.puts("Petition is nil for #{data.title}")
  if is_nil(user), do: IO.puts("User is nil for #{data.author_email}")

  # Check if signature exists for this user
  sig_query =
    Post.Signature
    |> Ash.Query.filter(petition_id == ^petition.id and user_id == ^user.id)
    |> Ash.Query.limit(1)

  case Ash.read_one!(sig_query) do
    nil ->
      Post.Signature
      |> Ash.Seed.seed!(%{
        petition_id: petition.id,
        user_id: user.id,
        reason: "I started this petition because it matters!",
        ip_address: "127.0.0.1",
        user_agent: "SeedScript"
      })

    _ ->
      :ok
  end
end)

IO.puts("Seeding complete!")
