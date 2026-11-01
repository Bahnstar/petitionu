import { CampusRpcs, CurrentUser, EmailDomain, invalidField } from "@petitionu/domain"
import { Effect, Layer, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"
import { findMeQuery } from "./Accounts.ts"
import { UserConfirmed } from "./Confirmation.ts"
import { maxListRows } from "./Database.ts"
import { SchoolVerificationQueue } from "./SchoolVerification.ts"

/*
 * Campus has no policy module because it makes no authorization decisions: `updateMyProfile`
 * only writes the signed-in caller's own row (its `RequireUser` middleware is the whole rule),
 * and `getOrganizations` lists every campus to anyone, as the sign-up and profile forms need.
 * Add a `CampusPolicy.ts` when a procedure reads or changes someone else's data.
 */

const OrganizationMatch = Schema.Struct({
  id: Schema.String,
  verificationStatus: Schema.String,
})

const isActive = (status: string) => status === "approved" || status === "verified"

/**
 * `AssignOrganization`: run when a user becomes confirmed, inside that transaction. A user
 * without an organization joins the organization for their exact email host when it's approved
 * or verified. Otherwise they wait for one: the existing pending organization for that host, or
 * the school for a `.edu` / `.ac.uk` host, found or created, with a verification job queued.
 * Personal and unknown domains stay unassigned.
 */
export const assignOrganization = Effect.fn("assignOrganization")(function* (userId: string) {
  const sql = yield* SqlClient.SqlClient
  const [user] = yield* sql<{ email: string; organizationId: string | null; confirmed: boolean }>`
    SELECT email::text AS email, organization_id, confirmed_at IS NOT NULL AS confirmed
    FROM users WHERE id = ${userId}
  `
  if (!user || user.organizationId !== null || !user.confirmed) return
  const host = EmailDomain.fromEmail(user.email)
  if (host === undefined) return

  const byHost = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: OrganizationMatch,
    execute: (domain) =>
      sql`SELECT id, verification_status FROM organization WHERE domain = ${domain}`,
  })
  let organization = Option.getOrUndefined(yield* byHost(host))
  if (organization === undefined) {
    const school = EmailDomain.schoolDomain(host)
    if (school === undefined) return
    // Competing first sign-ups converge on one row through the unique domain index.
    const [created] = yield* sql<typeof OrganizationMatch.Type>`
      INSERT INTO organization (name, domain) VALUES (${school}, ${school})
      ON CONFLICT (domain) DO UPDATE SET domain = organization.domain
      RETURNING id, verification_status
    `
    organization = created!
  }

  if (isActive(organization.verificationStatus)) {
    yield* sql`
      UPDATE users SET organization_id = ${organization.id}, pending_organization_id = NULL,
        updated_at = (now() AT TIME ZONE 'utc')
      WHERE id = ${userId}
    `
  } else {
    yield* sql`
      UPDATE users SET pending_organization_id = ${organization.id},
        updated_at = (now() AT TIME ZONE 'utc')
      WHERE id = ${userId}
    `
    yield* SchoolVerificationQueue.enqueue(userId)
  }
})

/** Runs `assignOrganization` whenever a user becomes confirmed. */
export const CampusAssignmentLive = Layer.effect(
  UserConfirmed,
  Effect.gen(function* () {
    const context = yield* Effect.context<SqlClient.SqlClient | SchoolVerificationQueue>()
    return (userId: string) => assignOrganization(userId).pipe(Effect.provideContext(context))
  }),
).pipe(Layer.provide(SchoolVerificationQueue.layer))

const OrganizationRow = Schema.Struct({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  domain: Schema.NullOr(Schema.String),
  logoUrl: Schema.NullOr(Schema.String),
  allowPublicSignatures: Schema.Boolean,
  verificationStatus: Schema.Literals(["pending", "verified", "approved"]),
})

const unconfirmed = invalidField("email", "Confirm your email before completing your profile.")
const noCampus = invalidField(
  "email",
  "We could not match your email to one supported campus. Contact support for help.",
)

export const CampusHandlers = CampusRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const findMe = findMeQuery(sql)

    /** `AssignCampus`: the campus a profile save puts a user without one into, if any. */
    const campusFor = Effect.fnUntraced(function* (email: string) {
      const host = (email.split("@").at(-1) ?? "").toLowerCase().trim()
      const matches = yield* sql<typeof OrganizationMatch.Type>`
        SELECT id, verification_status FROM organization
        WHERE lower(trim(domain::text)) = ${host} LIMIT 2
      `
      const [only] = matches
      return matches.length === 1 && isActive(only!.verificationStatus) ? only!.id : undefined
    })

    return CampusRpcs.of({
      updateMyProfile: ({ firstName, lastName, graduationYear }) =>
        Effect.gen(function* () {
          const actor = yield* CurrentUser
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const [user] = yield* sql<{
                email: string
                organizationId: string | null
                confirmed: boolean
              }>`
                SELECT email::text AS email, organization_id, confirmed_at IS NOT NULL AS confirmed
                FROM users WHERE id = ${actor.id} FOR UPDATE
              `
              if (!user?.confirmed) return yield* unconfirmed
              const campus = user.organizationId === null ? yield* campusFor(user.email) : undefined
              if (user.organizationId === null && campus === undefined) return yield* noCampus
              yield* sql`
                UPDATE users SET first_name = ${firstName}, last_name = ${lastName},
                  graduation_year = ${graduationYear ?? null},
                  ${campus === undefined ? sql`` : sql`organization_id = ${campus}, pending_organization_id = NULL,`}
                  updated_at = (now() AT TIME ZONE 'utc')
                WHERE id = ${actor.id}
              `
              return Option.getOrThrow(yield* findMe(actor.id))
            }),
          )
        }).pipe(Effect.catchTag(["SqlError", "SchemaError"], Effect.die)),

      getOrganizations: () =>
        SqlSchema.findAll({
          Request: Schema.Void,
          Result: OrganizationRow,
          execute: () => sql`
            SELECT id, name, description, domain::text AS domain, logo_url,
              coalesce(allow_public_signatures, false) AS allow_public_signatures,
              verification_status
            FROM organization ORDER BY name NULLS LAST, id LIMIT ${maxListRows}
          `,
        })(undefined).pipe(Effect.orDie),
    })
  }),
)
