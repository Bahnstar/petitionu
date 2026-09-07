defmodule Petitionu.Post.SecurityTest do
  use Petitionu.DataCase, async: false
  alias Petitionu.Accounts.{User, Organization}

  alias Petitionu.Post.{
    Petition,
    Signature,
    Comment,
    Update,
    Category,
    Classroom,
    ClassroomMembership
  }

  setup do
    school = Ash.Seed.seed!(Organization, %{name: "School", domain: "school.edu"})
    owner = user(school, "owner")
    signer = user(school, "signer")
    category = Ash.Seed.seed!(Category, %{name: "Campus"})

    petition =
      Ash.Seed.seed!(Petition, %{
        title: "Library hours",
        description: "Keep the library open",
        user_id: owner.id,
        category_id: category.id
      })

    %{school: school, owner: owner, signer: signer, category: category, petition: petition}
  end

  defp user(school, name) do
    Ash.Seed.seed!(User, %{
      email: "#{name}@school.edu",
      first_name: name,
      last_name: "Student",
      confirmed_at: DateTime.utc_now(),
      organization_id: school.id
    })
  end

  defp create(resource, input, actor, action \\ :create) do
    resource |> Ash.Changeset.for_create(action, input, actor: actor) |> Ash.create()
  end

  test "signature identity is actor-derived and cannot be forged", ctx do
    assert {:error, _} =
             create(
               Signature,
               %{petition_id: ctx.petition.id, user_id: ctx.owner.id, is_verified: true},
               ctx.signer
             )

    assert {:ok, signature} =
             create(
               Signature,
               %{petition_id: ctx.petition.id, reason: "More study time"},
               ctx.signer
             )

    assert signature.user_id == ctx.signer.id
    assert signature.is_verified
    assert {:error, _} = create(Signature, %{petition_id: ctx.petition.id}, ctx.signer)
  end

  test "anonymous and unconfirmed actors cannot sign", ctx do
    assert {:error, _} = create(Signature, %{petition_id: ctx.petition.id}, nil)
    unconfirmed = Ash.Seed.seed!(User, %{email: "unconfirmed@school.edu"})
    assert {:error, _} = create(Signature, %{petition_id: ctx.petition.id}, unconfirmed)
  end

  test "closed and expired petitions reject signatures", ctx do
    for attrs <- [%{status: :closed}, %{deadline: DateTime.add(DateTime.utc_now(), -60)}] do
      petition = Ash.Seed.update!(ctx.petition, attrs)
      assert {:error, _} = create(Signature, %{petition_id: petition.id}, ctx.signer)
    end
  end

  test "private classroom comments and signatures exclude outsiders", ctx do
    classroom =
      Ash.Seed.seed!(Classroom, %{
        name: "Private",
        professor_id: ctx.owner.id,
        join_code: Ash.UUID.generate()
      })

    petition = Ash.Seed.update!(ctx.petition, %{classroom_id: classroom.id})

    comment =
      Ash.Seed.seed!(Comment, %{
        petition_id: petition.id,
        user_id: ctx.owner.id,
        text: "Private discussion"
      })

    assert Ash.read!(Comment, actor: ctx.signer) == []
    assert {:error, _} = create(Signature, %{petition_id: petition.id}, ctx.signer)

    assert {:error, _} =
             create(Comment, %{petition_id: petition.id, text: "Outsider"}, ctx.signer)

    Ash.Seed.seed!(ClassroomMembership, %{
      classroom_id: classroom.id,
      user_id: ctx.signer.id,
      status: :active
    })

    assert Enum.any?(Ash.read!(Comment, actor: ctx.signer), &(&1.id == comment.id))
    assert {:ok, _} = create(Signature, %{petition_id: petition.id}, ctx.signer)
  end

  test "disabled comments and parent from another petition are rejected", ctx do
    petition = Ash.Seed.update!(ctx.petition, %{allow_comments: false})
    assert {:error, _} = create(Comment, %{petition_id: petition.id, text: "No"}, ctx.signer)

    other =
      Ash.Seed.seed!(Petition, %{
        title: "Other",
        description: "Other petition",
        user_id: ctx.owner.id
      })

    parent =
      Ash.Seed.seed!(Comment, %{petition_id: other.id, user_id: ctx.owner.id, text: "Other"})

    Ash.Seed.update!(petition, %{allow_comments: true})

    assert {:error, _} =
             create(
               Comment,
               %{petition_id: petition.id, text: "Reply", parent_comment_id: parent.id},
               ctx.signer
             )
  end

  test "anonymous petition author is redacted by the API", ctx do
    petition = Ash.Seed.update!(ctx.petition, %{is_anonymous: true})
    read = Ash.get!(Petition, petition.id, load: [:author], actor: ctx.signer)
    assert read.author == "Anonymous student"
    refute Ash.Resource.Info.attribute(Petition, :user_id).public?
    refute Ash.Resource.Info.relationship(Petition, :user).public?
    own = Ash.get!(Petition, petition.id, load: [:author], actor: ctx.owner)
    assert own.user_id == ctx.owner.id
  end

  test "public counts and actor capabilities preserve signer privacy", ctx do
    assert {:ok, _} = create(Signature, %{petition_id: ctx.petition.id}, ctx.signer)

    for actor <- [nil, ctx.owner, ctx.signer] do
      petition =
        Ash.get!(Petition, ctx.petition.id,
          actor: actor,
          load: [:signatures_count, :has_signed, :can_manage, :signatures]
        )

      assert petition.signatures_count == 1
      assert petition.has_signed == (actor == ctx.signer)
      assert petition.can_manage == (actor == ctx.owner)
      refute Ash.Resource.Info.attribute(Signature, :user_id).public?
      refute Ash.Resource.Info.relationship(Signature, :user).public?
    end
  end

  test "public creation captures campus and restricts lifecycle to owner", ctx do
    input = %{
      title: "New petition",
      description: "Make things better",
      category_id: ctx.category.id
    }

    assert {:ok, petition} = create(Petition, input, ctx.owner)
    assert petition.organization_id == ctx.school.id
    assert petition.user_id == ctx.owner.id
    assert {:error, _} = create(Petition, Map.put(input, :status, :victory), ctx.owner)

    assert {:error, _} =
             petition
             |> Ash.Changeset.for_update(:update, %{status: :victory}, actor: ctx.owner)
             |> Ash.update()

    assert {:error, _} =
             petition |> Ash.Changeset.for_update(:close, %{}, actor: ctx.signer) |> Ash.update()

    assert {:ok, closed} =
             petition |> Ash.Changeset.for_update(:close, %{}, actor: ctx.owner) |> Ash.update()

    assert closed.status == :closed

    assert {:ok, victory} =
             closed
             |> Ash.Changeset.for_update(:mark_victory, %{}, actor: ctx.owner)
             |> Ash.update()

    assert victory.status == :victory
  end

  test "only managers publish updates and hidden petitions hide all content", ctx do
    assert {:error, _} =
             create(
               Update,
               %{petition_id: ctx.petition.id, title: "News", body: "Progress"},
               ctx.signer
             )

    assert {:ok, _} =
             create(
               Update,
               %{petition_id: ctx.petition.id, title: "News", body: "Progress"},
               ctx.owner
             )

    assert {:ok, _} = create(Comment, %{petition_id: ctx.petition.id, text: "Thanks"}, ctx.signer)
    assert {:ok, _} = create(Signature, %{petition_id: ctx.petition.id}, ctx.signer)
    Ash.Seed.update!(ctx.petition, %{hidden_at: DateTime.utc_now()})

    for resource <- [Petition, Comment, Signature, Update] do
      assert Ash.read!(resource, actor: ctx.signer) == []
    end

    assert {:error, _} =
             create(
               Update,
               %{petition_id: ctx.petition.id, title: "News", body: "More progress"},
               ctx.owner
             )

    assert {:error, _} =
             create(Comment, %{petition_id: ctx.petition.id, text: "More thanks"}, ctx.signer)
  end

  test "campus signatures respect public signature configuration", ctx do
    other_school = Ash.Seed.seed!(Organization, %{name: "Other", domain: "other.edu"})
    outsider = user(other_school, "outside")
    petition = Ash.Seed.update!(ctx.petition, %{organization_id: ctx.school.id})
    assert {:error, _} = create(Signature, %{petition_id: petition.id}, outsider)
    Ash.Seed.update!(ctx.school, %{allow_public_signatures: true})
    assert {:ok, _} = create(Signature, %{petition_id: petition.id}, outsider)
  end

  test "incomplete profiles cannot participate and invalid petition values are rejected", ctx do
    incomplete = Ash.Seed.update!(ctx.signer, %{organization_id: nil})
    assert {:error, _} = create(Signature, %{petition_id: ctx.petition.id}, incomplete)

    assert {:error, _} =
             create(Comment, %{petition_id: ctx.petition.id, text: "Hello"}, incomplete)

    input = %{
      title: "Valid title",
      description: "Valid description",
      category_id: ctx.category.id
    }

    assert {:error, _} = create(Petition, input, incomplete)

    for attrs <- [
          %{title: "   "},
          %{description: ""},
          %{goal: 0},
          %{deadline: DateTime.add(DateTime.utc_now(), -60)}
        ] do
      assert {:error, _} = create(Petition, Map.merge(input, attrs), ctx.owner)
    end
  end

  test "classroom creation inherits classroom campus and checks active membership", ctx do
    classroom =
      Ash.Seed.seed!(Classroom, %{
        name: "Class",
        professor_id: ctx.owner.id,
        organization_id: ctx.school.id,
        join_code: Ash.UUID.generate()
      })

    input = %{
      title: "Class idea",
      description: "Better classes",
      category_id: ctx.category.id,
      classroom_id: classroom.id
    }

    assert {:error, _} = create(Petition, input, ctx.signer, :create_classroom_petition)

    membership =
      Ash.Seed.seed!(ClassroomMembership, %{
        classroom_id: classroom.id,
        user_id: ctx.signer.id,
        status: :active
      })

    assert {:ok, petition} = create(Petition, input, ctx.signer, :create_classroom_petition)
    assert petition.organization_id == ctx.school.id
    assert {:ok, comment} = create(Comment, %{petition_id: petition.id, text: "Idea"}, ctx.signer)
    Ash.Seed.update!(membership, %{status: :removed})

    assert {:error, _} =
             petition |> Ash.Changeset.for_update(:close, %{}, actor: ctx.signer) |> Ash.update()

    assert {:error, _} =
             comment
             |> Ash.Changeset.for_update(:update, %{text: "Changed"}, actor: ctx.signer)
             |> Ash.update()

    Ash.Seed.update!(classroom, %{archived: true})
    assert {:error, _} = create(Signature, %{petition_id: petition.id}, ctx.owner)
    assert {:error, _} = create(Petition, input, ctx.owner, :create_classroom_petition)
  end
end
