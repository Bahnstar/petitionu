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

  test "anonymous RPC display excludes private owner and signer fields", %{conn: conn} do
    response =
      conn
      |> post("/rpc/run", %{
        action: "get_petitions",
        fields: [
          "id",
          "author",
          "canManage",
          "hasSigned",
          "signaturesCount",
          %{signatures: ["id", "reason"]}
        ]
      })
      |> json_response(200)

    assert %{
             "success" => true,
             "data" => [
               %{
                 "author" => "Anonymous student",
                 "canManage" => false,
                 "hasSigned" => false,
                 "signaturesCount" => 1
               }
             ]
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

  test "public petition and comment names remain readable", %{
    conn: conn,
    petition: petition,
    owner: owner
  } do
    Ash.Seed.update!(petition, %{is_anonymous: false})
    Ash.Seed.seed!(Comment, %{petition_id: petition.id, user_id: owner.id, text: "Thank you"})

    response =
      conn
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
end
