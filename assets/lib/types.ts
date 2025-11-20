/**
 * Transforms a generated resource schema into a type with proper optionality.
 *
 * @template T - The resource schema type to "clean"
 *
 * @remarks
 * Fields are required only if they are:
 * - Non-nullable (do not contain `null` in their type)
 * - Not relationship objects (do not have `__type: "Relationship"`)
 *
 * All other fields, including nullable fields and relationships, become optional.
 *
 * @example
 * ```typescript
 * type Petition = CleanResource<PetitionResourceSchema>;
 * // {
 * //   id: UUIDv7;              // Required (non-nullable)
 * //   title?: string | null;   // Optional (nullable)
 * //   user?: { ... };          // Optional (relationship)
 * //   // ...
 * // }
 * ```
 */
export type CleanResource<T> = Required<{
  [K in keyof Cleaned<T> as [Cleaned<T>[K]] extends [{ __type: "Relationship" }]
    ? never
    : Extract<Cleaned<T>[K], null> extends never
      ? K
      : never]: Cleaned<T>[K]
}> &
  Partial<{
    [K in keyof Cleaned<T> as [Cleaned<T>[K]] extends [{ __type: "Relationship" }]
      ? K
      : Extract<Cleaned<T>[K], null> extends never
        ? never
        : K]: Cleaned<T>[K]
  }>

// Cleaned<T> removes the __type and __primitiveFields fields from generated resource schemas (T).
type Cleaned<T> = Omit<T, "__type" | "__primitiveFields">
