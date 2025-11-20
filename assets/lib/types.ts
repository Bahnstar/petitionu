// Prettify<T> is flattens the tooltip so it looks like a real object
type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

// Cleaned<T> Removes the metadata fields from the schema
type Cleaned<T> = Omit<T, "__type" | "__primitiveFields">

/**
 * Transform<T> is the magic transformation logic:
 * - Checks if the field is a relationship.
 * - If Array: returns CleanResource<InnerType>[]
 * - If Single: returns CleanResource<InnerType> | null
 * - Else: returns the type as-is
 */
type Transform<T> = T extends { __type: "Relationship"; __resource: infer R }
  ? T extends { __array: true }
    ? CleanResource<Exclude<R, null>>[]
    : CleanResource<Exclude<R, null>> | (null extends R ? null : never)
  : T

// OptionalKeys<T> identifies which keys should be optional (Relationships OR Nullable fields)
type OptionalKeys<T> = {
  [K in keyof T]: T[K] extends { __type: "Relationship" } ? K : null extends T[K] ? K : never
}[keyof T]

// RequiredKeys<T> identifies which keys should be required
// type RequiredKeys<T> = Exclude<keyof T, OptionalKeys<T>>
type RequiredKeys<T> = {
  [K in keyof T]: T[K] extends { __type: "Relationship" } ? never : null extends T[K] ? never : K
}[keyof T]

export type CleanResource<T> = Prettify<
  // Build the required part
  {
    [K in RequiredKeys<Cleaned<T>>]: Transform<Cleaned<T>[K]>
  } & {
    // Build the optional part (using ? instead of | undefined)
    [K in OptionalKeys<Cleaned<T>>]?: Transform<Cleaned<T>[K]>
  }
>
