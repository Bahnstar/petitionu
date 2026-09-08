defmodule Petitionu.RegistryStub do
  @behaviour Petitionu.Accounts.SchoolRegistry

  @impl true
  def lookup(domain) do
    send(self(), {:registry_lookup, domain})

    case Process.get(
           {__MODULE__, :result},
           {:ok, %{name: "Registry University", source: "test-registry"}}
         ) do
      callback when is_function(callback, 1) -> callback.(domain)
      result -> result
    end
  end
end
