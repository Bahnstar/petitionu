# Synthetic, repeatable fixtures for the showcase. Never run against production.
Logger.configure(level: :warning)
alias Petitionu.Accounts.{Organization, User}

alias Petitionu.Post.{
  Category,
  Petition,
  Signature,
  Comment,
  Classroom,
  ClassroomMembership,
  Update
}

unless Mix.env() == :dev and Petitionu.Repo.config()[:hostname] in ["localhost", "127.0.0.1"] do
  raise "Showcase fixtures require a local development database"
end

id = fn n -> "7de00000-0000-7000-8000-" <> String.pad_leading(Integer.to_string(n), 12, "0") end
password = System.fetch_env!("SHOWCASE_PASSWORD")
{:ok, hash} = AshAuthentication.BcryptProvider.hash(password)
now = DateTime.utc_now()

org =
  Ash.Seed.upsert!(Organization, %{
    id: id.(1),
    name: "Evergreen University",
    domain: "showcase.petitionu.test",
    description: "Fictional campus for the PetitionU showcase"
  })

users =
  for n <- 1..48 do
    {first, last} =
      Enum.at(
        [
          {"Maya", "Chen"},
          {"Jordan", "Lee"},
          {"Alex", "Rivera"},
          {"Sam", "Patel"},
          {"Avery", "Brooks"},
          {"Riley", "Park"}
        ],
        rem(n - 1, 6)
      )

    Ash.Seed.upsert!(User, %{
      id: id.(100 + n),
      email: "student#{n}@showcase.petitionu.test",
      first_name: first,
      last_name: last,
      organization_id: org.id,
      role: if(n == 2, do: :professor, else: :student),
      hashed_password: hash,
      confirmed_at: now
    })
  end

categories =
  for {name, n} <- Enum.with_index(["Campus life", "Food & dining", "Sustainability"], 10) do
    Ash.Seed.upsert!(Category, %{id: id.(n), name: name, organization_id: org.id})
  end

classroom =
  Ash.Seed.upsert!(Classroom, %{
    id: id.(20),
    name: "Designing a better campus",
    description: "Small ideas. Shared action. A space to improve everyday campus life.",
    professor_id: Enum.at(users, 1).id,
    organization_id: org.id,
    join_code: id.(21),
    allow_student_petitions: true
  })

for {user, n} <- Enum.with_index(Enum.take(users, 24)) do
  Ash.Seed.upsert!(ClassroomMembership, %{
    id: id.(300 + n),
    classroom_id: classroom.id,
    user_id: user.id,
    role: :student,
    status: :active,
    joined_at: now
  })
end

stories = [
  {"Keep the library open until midnight",
   "Late labs should not mean losing your study space. We are asking Evergreen University to extend library hours until midnight during the final four weeks of term.\n\nA quiet desk, reliable Wi-Fi, and a safe place to learn can make a real difference. Join us in asking for a pilot this semester.",
   60, 42, 0, nil},
  {"Make affordable lunches an everyday option",
   "Good food should fit a student budget. Add a balanced, affordable lunch option to every campus dining hall, every weekday.",
   75, 31, 1, nil},
  {"More refill stations. Less plastic.",
   "Make sustainable choices easier with water refill stations in the arts building, library, and student center.",
   50, 26, 2, nil},
  {"Create a quiet room in the student center",
   "A calm, accessible space to recharge between classes. Help us make room for student wellbeing.",
   50, 18, 0, nil},
  {"Bring repair workshops to campus",
   "Learn to fix a bike, mend a jacket, and keep useful things out of landfill. Let's host a monthly student-led repair afternoon.",
   40, 12, 2, nil},
  {"Share lecture notes in accessible formats",
   "Make learning materials easier for everyone to use. Let's agree on a shared template for readable, accessible course notes.",
   30, 21, 0, classroom.id}
]

for {{title, description, goal, count, category, room}, n} <- Enum.with_index(stories) do
  petition =
    Ash.Seed.upsert!(Petition, %{
      id: id.(30 + n),
      title: title,
      description: description,
      goal: goal,
      organization_id: org.id,
      user_id: Enum.at(users, rem(n + 2, 6)).id,
      category_id: Enum.at(categories, category).id,
      classroom_id: room,
      status: :open,
      deadline: DateTime.add(now, 30, :day) |> DateTime.truncate(:second)
    })

  for {user, k} <- Enum.with_index(Enum.take(Enum.drop(users, 1), count)) do
    Ash.Seed.upsert!(Signature, %{
      id: id.(1000 + n * 100 + k),
      petition_id: petition.id,
      user_id: user.id,
      is_verified: true
    })
  end
end

for {text, n} <-
      Enum.with_index([
        "My lab finishes at 9 pm. An extra few hours would make a huge difference.",
        "A finals-week pilot is a great place to start. Happy to help spread the word.",
        "Let's include safe late-night transport in the conversation too."
      ]) do
  Ash.Seed.upsert!(Comment, %{
    id: id.(2000 + n),
    petition_id: id.(30),
    user_id: Enum.at(users, n + 3).id,
    text: text
  })
end

Ash.Seed.upsert!(Update, %{
  id: id.(2100),
  petition_id: id.(30),
  title: "A conversation with the library team",
  body:
    "We have shared the proposal with library staff. Next step: gather student feedback on the hours that would help most."
})

IO.puts("Showcase ready: student1@showcase.petitionu.test; library petition #{id.(30)}")

# Restore only the demo actor's signature so recapturing reproduces 42 → 43.
require Ash.Query

Signature
|> Ash.Query.filter(user_id == ^id.(101) and petition_id == ^id.(30))
|> Ash.read!(authorize?: false)
|> Enum.each(&Ash.destroy!(&1, authorize?: false))
