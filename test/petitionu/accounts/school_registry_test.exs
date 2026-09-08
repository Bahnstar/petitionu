defmodule Petitionu.Accounts.SchoolRegistryTest do
  use ExUnit.Case, async: true

  alias Petitionu.Accounts.SchoolRegistry

  test "extracts only the registrant name from an EDUCAUSE response" do
    response = """
    Domain Name: SCHOOL.EDU

    Registrant:
    \tExample University
    \t123 Main Street

    Administrative Contact:
    \tA Person
    """

    transport = fn "whois.educause.edu", "school.edu" -> {:ok, response} end

    assert SchoolRegistry.lookup("school.edu", transport) ==
             {:ok, %{name: "Example University", source: "whois.educause.edu"}}
  end

  test "parses Jisc's field names with CRLF line endings" do
    response = "Domain:\r\n\tox.ac.uk\r\n\r\nRegistered For:\r\n\tUniversity of Oxford\r\n"
    transport = fn "whois.ja.net", "ox.ac.uk" -> {:ok, response} end

    assert SchoolRegistry.lookup("ox.ac.uk", transport) ==
             {:ok, %{name: "University of Oxford", source: "whois.ja.net"}}
  end

  test "missing names, mismatched domains, rate limits, and invalid text remain unverified" do
    for response <- [
          "Domain Name: SCHOOL.EDU\n",
          "Domain Name: OTHER.EDU\nRegistrant:\n\tAnother School\n",
          "Query rate limit exceeded",
          <<255>>,
          ""
        ] do
      assert {:error, :inconclusive} =
               SchoolRegistry.lookup("school.edu", fn _, _ -> {:ok, response} end)
    end
  end

  test "distinguishes missing records and unavailable registries" do
    assert {:error, :not_found} =
             SchoolRegistry.lookup("school.edu", fn _, _ -> {:ok, "No match for SCHOOL.EDU\n"} end)

    assert {:error, :unavailable} =
             SchoolRegistry.lookup("school.edu", fn _, _ -> {:error, :unavailable} end)
  end

  test "never queries a server for an unsupported or malformed domain" do
    transport = fn _, _ -> flunk("unexpected registry request") end

    for domain <- [
          "gmail.com",
          "school.edu.attacker.com",
          "school.edu\r\nother.edu",
          "ac.uk",
          "students.school.edu"
        ] do
      assert {:error, :unsupported_domain} = SchoolRegistry.lookup(domain, transport)
    end
  end
end
