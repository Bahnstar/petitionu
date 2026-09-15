defmodule PetitionuWeb.AshTypescriptRpcController do
  use PetitionuWeb, :controller

  @petition_actions ~w(get_petitions get_public_petitions get_classroom_petitions get_signatures get_comments get_updates get_updates_for_petition)
  @shared_fields ~w(id title description status classroomId organizationId hasSigned canManage goal signaturesCount daysLeft trending author allowComments isAnonymous deadline insertedAt)

  plug :restrict_guest_petitions when action in [:run, :validate]

  defp restrict_guest_petitions(conn, _opts) do
    params = conn.params

    restricted? =
      params["action"] in @petition_actions or
        (params["action"] == "get_petition_by_id" and
           not shared_fields?(params["fields"]))

    if is_nil(conn.assigns[:current_user]) and restricted? do
      conn
      |> json(%{
        success: false,
        errors: [%{type: "forbidden", message: "Sign in to access petition activity."}]
      })
      |> halt()
    else
      conn
    end
  end

  defp shared_fields?(fields) when is_list(fields) do
    Enum.all?(fields, fn
      %{"category" => fields} = selection when map_size(selection) == 1 and is_list(fields) ->
        Enum.all?(fields, &(&1 in ~w(id name)))

      field ->
        field in @shared_fields
    end)
  end

  defp shared_fields?(_), do: false

  def run(conn, params) do
    result = AshTypescript.Rpc.run_action(:petitionu, conn, params)
    processed_result = AshTypescript.Rpc.ResultProcessor.process(result, params)
    json(conn, processed_result)
  end

  def validate(conn, params) do
    result = AshTypescript.Rpc.validate_action(:petitionu, conn, params)
    processed_result = AshTypescript.Rpc.ResultProcessor.process(result, params)
    json(conn, processed_result)
  end
end
