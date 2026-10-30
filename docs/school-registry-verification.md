# School registry verification

Email confirmation establishes access to an email address. Registry verification
checks whether its school domain has a matching record in the authoritative
WHOIS registry. This does not establish current accreditation or the user's role
at the school.

Organizations have a `verification_status` of `pending`, `verified` or `approved`.
A user joins only a `verified` or `approved` one.

When a user is confirmed (`assignOrganization` in `apps/server/src/Campus.ts`), they
join the active organization for their exact email host. Otherwise they wait: for
the pending organization at that host, or for their `.edu` or `.ac.uk` school,
which is created as `pending` with the domain as its name if it doesn't exist.
Waiting means `pending_organization_id` is set and `organization_id` stays empty.
Confirmation and the queued verification job commit together. A registry outage
does not prevent account creation or email confirmation. Other domain suffixes
cannot create organizations automatically.

The verification job (`apps/server/src/SchoolVerification.ts`) runs from the
`job_queue` table on every server process with `JOB_WORKERS` on. Confirmation queues
one job per user, and an operator's retry adds another. It queries
`whois.educause.edu` for `.edu` domains and `whois.ja.net` for `.ac.uk` domains.
The response must identify the requested domain and provide a registrant name.

On success, the organization becomes `verified`. The app stores the registry name,
server, and check time. It replaces a domain-based placeholder name with the
registry name and preserves a chosen display name. It does not retain the raw
response or registrant contact details. The job then activates the user's
membership. Other waiting users have their own jobs, which reuse the saved result
without another lookup, as they do for an `approved` organization.

Unavailable registries, missing records, and inconclusive responses leave the
organization pending. The last failure and check time are saved. The job retries
up to 20 attempts, starting after one minute and doubling the delay up to one day.
A recently failed domain is not queried again within one minute: other jobs for it
wait 60 seconds without using an attempt. Each attempt has a 20-second timeout. The
queue processes one job at a time per server process.

After retries are exhausted, membership remains pending and the job stays in
`job_queue` as failed, with its last failure. Jobs are queued when a user is
confirmed, once per user; sign-ins don't enqueue verification work, so a failed job
needs an operator, with one of the [operator commands](deployment.md#operator-commands):

- `retry-verification` queues a new job for one user, with a fresh 20 attempts,
  when the registry may answer now. The failed job stays as the record of the
  failure.
- `approve-organization` sets a `pending` organization to `approved` and activates
  all its waiting users at once, whatever their jobs' state, when the registry won't
  confirm the school. Jobs still queued then find nothing to do. It also activates
  anyone left waiting at a `verified` organization, whose status it keeps.

`approved` records an operator's decision, not a successful registry lookup: the
organization keeps its name and its last registry failure, and no email is sent.
Organizations configured before the registry check existed are also `approved`, and
their members were unchanged.

The verification and membership updates check in SQL that the organization's status
and domain and the user's email and pending membership still match what was read, so
a change cancels the effect instead of activating a stale assignment. A job that
finds the user's email outside the domain completes without activating them, and
`approve-organization` leaves such a user waiting too.

Registry sources: [IANA's .edu delegation](https://www.iana.org/domains/root/db/edu.html)
and [Jisc's WHOIS documentation](https://community.jisc.ac.uk/printpdf/867).
EDUCAUSE documents [.edu eligibility and grandfathered registrations](https://net.educause.edu/faq.htm).

Run the behavior checks with `npx vitest run test/school-registry.test.ts
test/verify-school-membership.test.ts test/operator-commands.test.ts` in `apps/server`, and the repository checks with
`bun run precommit`. The migrate entry point creates the job queue table, so a deploy's migrate
step must finish before job workers start.

Profile completion preserves an existing organization assignment and refuses to
activate a pending organization. The [browser evidence](school-registry/README.md)
shows the signup, confirmation, registry lookup, and logged-in profile flow as
captured on the Elixir app, before the move to the Effect server.
