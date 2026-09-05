defmodule Petitionu.Post.Calculations.Author do
  use Ash.Resource.Calculation
  require Ash.Query

  @impl true
  def load(_query, opts, _context) do
    if opts[:anonymous?], do: [:user_id, :is_anonymous], else: [:user_id]
  end

  @impl true
  def calculate(records, opts, _context) do
    user_ids =
      records
      |> Enum.reject(&anonymous?(&1, opts))
      |> Enum.map(& &1.user_id)
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()

    # Public names bypass private account reads after anonymous authors are excluded.
    names =
      Petitionu.Accounts.User
      |> Ash.Query.filter(id in ^user_ids)
      |> Ash.Query.select([:first_name, :last_name])
      |> Ash.read!(authorize?: false)
      |> Map.new(fn user ->
        {user.id, Enum.join(Enum.reject([user.first_name, user.last_name], &is_nil/1), " ")}
      end)

    Enum.map(records, fn record ->
      if anonymous?(record, opts),
        do: "Anonymous student",
        else: Map.get(names, record.user_id, "Student")
    end)
  end

  defp anonymous?(record, opts), do: opts[:anonymous?] && record.is_anonymous
end
