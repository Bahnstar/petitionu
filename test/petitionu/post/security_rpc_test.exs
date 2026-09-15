defmodule Petitionu.Post.SecurityRpcTest do
  use PetitionuWeb.ConnCase, async: false
  alias Petitionu.Accounts.{Organization, User}
  alias Petitionu.Post.{Petition, Signature, Comment}

  setup do
    organization = Ash.Seed.seed!(Organization, %{name: "School", domain: "school.edu"})

    owner =
      Ash.Seed.seed!(User, %{
        email: "owner@school.edu",
        first_name: "Private",
        last_name: "Owner",
        confirmed_at: DateTime.utc_now(),
        organization_id: organization.id
      })

    petition =
      Ash.Seed.seed!(Petition, %{
        title: "A petition",
        description: "Help",
        user_id: owner.id,
        is_anonymous: true
      })

    Ash.Seed.seed!(Signature, %{
      petition_id: petition.id,
      user_id: owner.id,
      ip_address: "127.0.0.1",
      user_agent: "Secret browser"
    })

    %{owner: owner, petition: petition}
  end

  test "anonymous shared link excludes private owner and signer fields", %{
    conn: conn,
    petition: petition
  } do
    response =
      conn
      |> post("/rpc/run", %{
        action: "get_petition_by_id",
        input: %{id: petition.id},
        fields: [
          "id",
          "author",
          "canManage",
          "hasSigned",
          "signaturesCount"
        ]
      })
      |> json_response(200)

    assert %{
             "success" => true,
             "data" => %{
               "author" => "Anonymous student",
               "canManage" => false,
               "hasSigned" => false,
               "signaturesCount" => 1
             }
           } = response

    refute Jason.encode!(response) =~ "Private Owner"
    refute Jason.encode!(response) =~ "127.0.0.1"
  end

  test "RPC cannot select or filter private ownership", %{conn: conn, owner: owner} do
    for params <- [
          %{action: "get_petitions", fields: ["id", "userId"]},
          %{action: "get_petitions", fields: ["id", %{user: ["id", "firstName"]}]},
          %{action: "get_petitions", fields: ["id"], filter: %{userId: %{eq: owner.id}}},
          %{action: "get_signatures", fields: ["id", "ipAddress"]},
          %{action: "get_signatures", fields: ["id", "userId"]}
        ] do
      response = conn |> post("/rpc/run", params) |> json_response(200)
      assert response["success"] == false
    end
  end

  test "signed-in petition and comment names remain readable", %{
    conn: conn,
    petition: petition,
    owner: owner
  } do
    {:ok, token, _claims} = AshAuthentication.Jwt.token_for_user(owner)
    owner = Ash.Resource.put_metadata(owner, :token, token)
    conn = Plug.Test.init_test_session(conn, %{})
    Ash.Seed.update!(petition, %{is_anonymous: false})
    Ash.Seed.seed!(Comment, %{petition_id: petition.id, user_id: owner.id, text: "Thank you"})

    response =
      conn
      |> AshAuthentication.Plug.Helpers.store_in_session(owner)
      |> post("/rpc/run", %{
        action: "get_petitions",
        fields: ["author", %{comments: ["text", "author"]}]
      })
      |> json_response(200)

    assert %{
             "success" => true,
             "data" => [
               %{"author" => "Private Owner", "comments" => [%{"author" => "Private Owner"}]}
             ]
           } = response
  end

  test "guests cannot discover petitions or load participant activity", %{
    conn: conn,
    petition: petition
  } do
    for action <-
          ~w(get_petitions get_public_petitions get_classroom_petitions get_signatures get_comments get_updates get_updates_for_petition) do
      response = conn |> post("/rpc/run", %{action: action, fields: ["id"]}) |> json_response(200)
      assert response["success"] == false
    end

    for relationship <- ~w(comments signatures updates) do
      response =
        conn
        |> post("/rpc/run", %{
          action: "get_petition_by_id",
          input: %{id: petition.id},
          fields: [%{relationship => ["id"]}]
        })
        |> json_response(200)

      assert response["success"] == false
    end
  end

  test "shared links require an ID and do not expose hidden petitions", %{
    conn: conn,
    petition: petition
  } do
    response =
      conn
      |> post("/rpc/run", %{action: "get_petition_by_id", fields: ["id"]})
      |> json_response(200)

    assert response["success"] == false
    Ash.Seed.update!(petition, %{hidden_at: DateTime.utc_now()})

    response =
      conn
      |> post("/rpc/run", %{
        action: "get_petition_by_id",
        input: %{id: petition.id},
        fields: ["id"]
      })
      |> json_response(200)

    refute response["data"]
  end

  test "classroom shared links still require membership", %{
    conn: conn,
    petition: petition,
    owner: owner
  } do
    classroom =
      Ash.Seed.seed!(Petitionu.Post.Classroom, %{
        name: "Private class",
        professor_id: owner.id,
        join_code: Ash.UUID.generate()
      })

    Ash.Seed.update!(petition, %{classroom_id: classroom.id})

    response =
      conn
      |> post("/rpc/run", %{
        action: "get_petition_by_id",
        input: %{id: petition.id},
        fields: ["id", "title"]
      })
      |> json_response(200)

    refute response["data"]
  end

  test "anonymous resource reads cannot list petitions", %{petition: petition} do
    assert {:ok, []} = Ash.read(Petition)

    assert {:ok, visible} =
             Petition |> Ash.Query.for_read(:get_by_id, %{id: petition.id}) |> Ash.read_one()

    assert visible.id == petition.id
  end
end
