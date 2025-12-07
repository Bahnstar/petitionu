defmodule Petitionu.Post.Category do
  use Ash.Resource,
    domain: Petitionu.Post,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshTypescript.Resource]

  postgres do
    table "category"
    repo Petitionu.Repo
  end

  typescript do
    type_name "Category"
  end

  actions do
    defaults [:read, :destroy]

    create :create do
      primary? true
      accept [:name, :description, :color]

      argument :organization_id, :uuid do
        allow_nil? false
      end

      change manage_relationship(:organization_id, :organization, type: :append_and_remove)
    end

    update :update do
      primary? true
      accept [:name, :description, :color]
    end
  end

  attributes do
    uuid_v7_primary_key :id

    attribute :name, :string do
      public? true
    end

    attribute :description, :string do
      public? true
      allow_nil? true
    end

    attribute :color, :string do
      public? true
      default "#00683d"
    end

    timestamps(public?: true)
  end

  relationships do
    belongs_to :organization, Petitionu.Accounts.Organization
  end
end
