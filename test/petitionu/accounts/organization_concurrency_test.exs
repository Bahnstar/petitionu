defmodule Petitionu.Accounts.OrganizationConcurrencyTest do
  use ExUnit.Case, async: false

  alias Ecto.Adapters.SQL.Sandbox
  alias Petitionu.Accounts
  alias Petitionu.Accounts.Organization
  alias Petitionu.Repo

  require Ash.Query

  test "competing first signups converge on one organization across database connections" do
    domain = "concurrent#{System.unique_integer([:positive])}.edu"
    parent = self()

    on_exit(fn ->
      Sandbox.unboxed_run(Repo, fn ->
        if organization = Accounts.organization_by_domain!(domain, authorize?: false) do
          Ash.destroy!(organization, authorize?: false)
        end
      end)
    end)

    tasks =
      for _ <- 1..4 do
        Task.async(fn ->
          Sandbox.unboxed_run(Repo, fn ->
            send(parent, {:ready, self()})

            receive do
              :create -> Accounts.get_or_create_organization_by_domain!(domain, authorize?: false)
            after
              5_000 -> raise "concurrent creation was not started"
            end
          end)
        end)
      end

    for task <- tasks do
      pid = task.pid
      assert_receive {:ready, ^pid}, 5_000
    end

    for task <- tasks, do: send(task.pid, :create)
    organizations = Task.await_many(tasks)
    assert organizations |> Enum.map(& &1.id) |> Enum.uniq() |> length() == 1

    Sandbox.unboxed_run(Repo, fn ->
      assert Organization |> Ash.Query.filter(domain == ^domain) |> Ash.count!(authorize?: false) ==
               1
    end)
  end
end
