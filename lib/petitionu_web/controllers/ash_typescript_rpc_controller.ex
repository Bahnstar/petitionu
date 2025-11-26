defmodule PetitionuWeb.AshTypescriptRpcController do
  use PetitionuWeb, :controller

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
