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
    goal: 12,
    signature_count: 10,
    status: :open
  },
  %{
    title: "Add More Vegetarian Options in Dining Halls",
    description:
      "Many students follow vegetarian diets but struggle to find adequate meal options. We request at least 3 vegetarian entrees at every meal service.",
    author_email: "michael.rodriguez@example.com",
    category: "Food & Dining",
    goal: 15,
    signature_count: 8,
    status: :open
  },
  %{
    title: "Reduce Student Parking Fees",
    description:
      "Parking fees have increased 40% in the past two years. This petition asks the administration to reduce fees and offer more affordable alternatives.",
    author_email: "jessica.williams@example.com",
    category: "Finance",
    goal: 10,
    signature_count: 9,
    status: :open
  },
  %{
    title: "Implement Mental Health Days",
    description:
      "Students need mental health support. This petition proposes 2 excused mental health days per semester without penalty to academic standing.",
    author_email: "alex.thompson@example.com",
    category: "Wellness",
    goal: 13,
    signature_count: 11,
    status: :open
  },
  %{
    title: "Increase Campus Safety Lighting",
    description:
      "Several areas of campus are poorly lit at night. This petition requests additional lighting installations for student safety.",
    author_email: "emily.davis@example.com",
    category: "Safety",
    goal: 8,
    signature_count: 7,
    status: :open
  },
  %{
    title: "Add Lactation Rooms Across Campus",
    description:
      "New parents need accessible, private spaces for nursing. This petition calls for dedicated lactation rooms in every major building.",
    author_email: "maria.garcia@example.com",
    category: "Accessibility",
    goal: 9,
    signature_count: 6,
    status: :open
  },
  %{
    title: "Improve Campus WiFi Infrastructure",
    description:
      "The current WiFi infrastructure is outdated and unreliable. We need faster speeds and better coverage in dorms and lecture halls.",
    author_email: "sarah.chen@example.com",
    category: "Technology",
    goal: 14,
    signature_count: 12,
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

# 5. Create Additional Signatures
IO.puts("Creating Additional Signatures...")

# Get all petitions and users (excluding petition authors)
all_petitions = Ash.read!(Post.Petition, authorize?: false)
all_users = Ash.read!(Accounts.User, authorize?: false)

# Create signature data for each petition
Enum.each(all_petitions, fn petition ->
  # Get existing signatures for this petition
  existing_signature_query =
    Post.Signature
    |> Ash.Query.filter(petition_id == ^petition.id)

  existing_signatures = Ash.read!(existing_signature_query, authorize?: false)
  existing_user_ids = Enum.map(existing_signatures, & &1.user_id)

  # Get users who haven't signed this petition yet (excluding the author)
  potential_signers =
    Enum.reject(all_users, fn user ->
      user.id == petition.user_id or user.id in existing_user_ids
    end)

  # Randomly select 60-90% of potential signers to sign this petition
  if length(potential_signers) > 0 do
    num_signatures = max(1, trunc(length(potential_signers) * (:rand.uniform() * 0.3 + 0.6)))
    signers = Enum.take_random(potential_signers, num_signatures)

    Enum.each(signers, fn signer ->
      # Random signature reasons
      reasons = [
        "I fully support this initiative!",
        "This is exactly what our campus needs.",
        "It's about time someone addressed this issue.",
        "I've been waiting for this change.",
        "This will make a real difference for students.",
        "Completely agree with this proposal.",
        "This affects me personally and I support it.",
        "Great idea that benefits everyone.",
        "Long overdue improvement.",
        "This aligns with my values and beliefs."
      ]

      Post.Signature
      |> Ash.Seed.seed!(%{
        petition_id: petition.id,
        user_id: signer.id,
        reason: Enum.random(reasons),
        ip_address: "192.168.1.#{:rand.uniform(254)}",
        user_agent: "SeedScript"
      })
    end)
  end

  # Signature count is automatically calculated, no need to update manually
end)

# 6. Create Comments on Petitions
IO.puts("Creating Comments...")

comments_data = [
  %{
    petition_title: "Extend Library Hours During Finals Week",
    user_email: "michael.rodriguez@example.com",
    message:
      "As a night owl student, this would be incredibly helpful. The library closing at 11 PM during finals week is just not enough time when you have multiple exams."
  },
  %{
    petition_title: "Extend Library Hours During Finals Week",
    user_email: "emily.davis@example.com",
    message:
      "I support this! Last semester I had to study in my dorm because the library closed too early. It's much harder to focus there."
  },
  %{
    petition_title: "Add More Vegetarian Options in Dining Halls",
    user_email: "sarah.chen@example.com",
    message:
      "I've been vegetarian for 3 years and the options are still very limited. Sometimes there's literally only one vegetarian option at dinner."
  },
  %{
    petition_title: "Add More Vegetarian Options in Dining Halls",
    user_email: "alex.thompson@example.com",
    message:
      "Even as someone who eats meat, I'd love to see more plant-based options. It would be healthier for everyone!"
  },
  %{
    petition_title: "Reduce Student Parking Fees",
    user_email: "maria.garcia@example.com",
    message:
      "The parking fees are ridiculous! I'm paying $400 per semester just to park on campus. That's a lot for a student budget."
  },
  %{
    petition_title: "Reduce Student Parking Fees",
    user_email: "jessica.williams@example.com",
    message: "I had to get a job just to afford parking. Something needs to change."
  },
  %{
    petition_title: "Implement Mental Health Days",
    user_email: "sarah.chen@example.com",
    message:
      "This is so important. Mental health is just as important as physical health. I've had days where I was too anxious to function but couldn't take time off."
  },
  %{
    petition_title: "Implement Mental Health Days",
    user_email: "michael.rodriguez@example.com",
    message:
      "Absolutely support this. The stress of college is real and we need institutional recognition of that."
  },
  %{
    petition_title: "Increase Campus Safety Lighting",
    user_email: "alex.thompson@example.com",
    message:
      "The walk from the science building to the dorms is terrifying at night. So many dark spots."
  },
  %{
    petition_title: "Increase Campus Safety Lighting",
    user_email: "maria.garcia@example.com",
    message:
      "I carry pepper spray with me now because some areas are so poorly lit. This shouldn't be necessary on our campus."
  },
  %{
    petition_title: "Add Lactation Rooms Across Campus",
    user_email: "emily.davis@example.com",
    message:
      "As a new mom who's continuing my education, this would be life-changing. Currently I have to go to my car between classes."
  },
  %{
    petition_title: "Add Lactation Rooms Across Campus",
    user_email: "jessica.williams@example.com",
    message:
      "Supporting student parents is crucial for retention. This is a basic accommodation that should be available."
  },
  %{
    petition_title: "Improve Campus WiFi Infrastructure",
    user_email: "alex.thompson@example.com",
    message:
      "Trying to submit assignments when the WiFi keeps dropping is so frustrating. Especially during peak hours."
  },
  %{
    petition_title: "Improve Campus WiFi Infrastructure",
    user_email: "sarah.chen@example.com",
    message:
      "The WiFi in the engineering building is basically unusable. How are we supposed to do online research or attend virtual classes?"
  }
]

Enum.each(comments_data, fn data ->
  # Find the petition and user
  petition_query =
    Post.Petition
    |> Ash.Query.filter(title == ^data.petition_title)
    |> Ash.Query.limit(1)

  petition = Ash.read_one!(petition_query, authorize?: false)
  user = users[data.user_email]

  if petition && user do
    # Check if comment already exists
    existing_comment_query =
      Post.Comment
      |> Ash.Query.filter(petition_id == ^petition.id and user_id == ^user.id)
      |> Ash.Query.limit(1)

    case Ash.read_one!(existing_comment_query, authorize?: false) do
      nil ->
        Post.Comment
        |> Ash.Changeset.for_create(:create, %{
          text: data.message,
          petition_id: petition.id,
          user_id: user.id
        })
        |> Ash.create!(authorize?: false)

      _ ->
        :ok
    end
  end
end)

# 7. Create Petition Updates
IO.puts("Creating Petition Updates...")

updates_data = [
  %{
    petition_title: "Extend Library Hours During Finals Week",
    title: "Administration Responds Positively",
    body:
      "We've received your petition and are discussing the feasibility of extended hours with the library administration. Preliminary feedback is encouraging!"
  },
  %{
    petition_title: "Extend Library Hours During Finals Week",
    title: "Trial Period Approved",
    body:
      "Great news! The library will be open 24/7 during the final two weeks of this semester as a trial. Please make good use of this opportunity!"
  },
  %{
    petition_title: "Add More Vegetarian Options in Dining Halls",
    title: "Meeting with Dining Services",
    body:
      "Scheduled a meeting with the dining director next week. They're interested in hearing student feedback and exploring new menu options."
  },
  %{
    petition_title: "Add More Vegetarian Options in Dining Halls",
    title: "New Vegetarian Chef Hired",
    body:
      "The dining services has hired a specialized vegetarian chef! Starting next month, we'll have at least 3 vegetarian entrees at every meal."
  },
  %{
    petition_title: "Reduce Student Parking Fees",
    title: "Student Government Support",
    body:
      "The student government has officially endorsed this petition and will be presenting it to the administration at next week's meeting."
  },
  %{
    petition_title: "Implement Mental Health Days",
    title: "Counseling Center Backing",
    body:
      "The campus counseling center has written a letter of support for this initiative, citing the increasing need for mental health accommodations."
  },
  %{
    petition_title: "Increase Campus Safety Lighting",
    title: "Safety Assessment Complete",
    body:
      "Campus security has completed a lighting assessment and identified 12 critical areas that need immediate attention. Funding has been allocated!"
  },
  %{
    petition_title: "Add Lactation Rooms Across Campus",
    title: "First Room Opened",
    body:
      "The first lactation room is now open in the Student Union building! Plans are underway for rooms in the library and science building."
  },
  %{
    petition_title: "Improve Campus WiFi Infrastructure",
    title: "IT Department Response",
    body:
      "IT has acknowledged the WiFi issues and is starting with upgrades to the engineering building this summer. Full campus rollout planned for fall."
  }
]

Enum.each(updates_data, fn data ->
  # Find the petition
  petition_query =
    Post.Petition
    |> Ash.Query.filter(title == ^data.petition_title)
    |> Ash.Query.limit(1)

  petition = Ash.read_one!(petition_query, authorize?: false)

  if petition do
    # Check if update already exists
    existing_update_query =
      Post.Update
      |> Ash.Query.filter(petition_id == ^petition.id and title == ^data.title)
      |> Ash.Query.limit(1)

    case Ash.read_one!(existing_update_query, authorize?: false) do
      nil ->
        Post.Update
        |> Ash.Changeset.for_create(:create, %{
          title: data.title,
          body: data.body,
          petition_id: petition.id
        })
        |> Ash.create!(authorize?: false)

      _ ->
        :ok
    end
  end
end)

IO.puts("Seeding complete!")
