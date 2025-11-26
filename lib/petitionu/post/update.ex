defmodule Petitionu.Post.Update do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "update"
    repo Petitionu.Repo

    references do
      reference :petition, on_delete: :delete
    end
  end

  typescript do
    type_name "Update"
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:title, :body, :petition_id]
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :title, :string do
      allow_nil? false
      public? true
    end

    attribute :body, :string do
      allow_nil? false
      public? true
    end

    timestamps()
  end

  relationships do
    belongs_to :petition, Petitionu.Post.Petition
  end
end
