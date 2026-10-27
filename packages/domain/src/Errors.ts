import { Schema } from "effect"

/** The caller has to sign in first. */
export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()("Unauthenticated", {
  message: Schema.String,
}) {}

/** The caller is signed in but not allowed to do this. */
export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
  message: Schema.String,
}) {}

/** The record doesn't exist, or the caller isn't allowed to see it. */
export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  message: Schema.String,
}) {}

/** A message about one input field. */
export const FieldError = Schema.Struct({ field: Schema.String, message: Schema.String })
export type FieldError = typeof FieldError.Type

/** The input was rejected; `fields` says which fields and why. */
export class Invalid extends Schema.TaggedError<Invalid>()("Invalid", {
  message: Schema.String,
  fields: Schema.Array(FieldError),
}) {}
