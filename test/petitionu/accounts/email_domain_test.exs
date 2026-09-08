defmodule Petitionu.Accounts.EmailDomainTest do
  use ExUnit.Case, async: true

  alias Petitionu.Accounts.EmailDomain

  test "normalizes email hosts and rejects personal providers and malformed hosts" do
    assert EmailDomain.from_email("Alex@Students.SCHOOL.EDU") == "students.school.edu"

    for email <- [
          "alex@gmail.com",
          "alex@OUTLOOK.COM",
          "missing-at",
          "@school.edu",
          "alex@@school.edu",
          "alex@-school.edu",
          "alex@school..edu",
          "alex@localhost",
          "alex@school.edu.attacker.com/path"
        ] do
      assert is_nil(EmailDomain.from_email(email))
    end
  end

  test "groups only supported academic suffixes without confusing public suffixes" do
    assert EmailDomain.school_domain("school.edu") == "school.edu"
    assert EmailDomain.school_domain("students.school.edu") == "school.edu"
    assert EmailDomain.school_domain("students.school.ac.uk") == "school.ac.uk"

    for host <- ["ac.uk", "edu", "school.org", "school.edu.attacker.com", "school.ac.uk.evil"] do
      assert is_nil(EmailDomain.school_domain(host))
    end
  end
end
