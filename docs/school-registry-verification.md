# School registry verification

Email confirmation establishes access to an email address. Registry verification
checks whether its school domain has a matching record in the authoritative
WHOIS registry. This does not establish current accreditation or the user's role
at the school.

New organizations created from `.edu` and `.ac.uk` email addresses start with
`verification_status: :pending`. The confirmed user has a
`pending_organization_id`, while `organization_id` stays empty. Confirmation and
the queued verification job commit together. A registry outage does not prevent
account creation or email confirmation.

The verification job (`apps/server/src/SchoolVerification.ts`) runs from the
`job_queue` table, one job per user. It queries
`whois.educause.edu` for `.edu` domains and `whois.ja.net` for `.ac.uk` domains.
The response must identify the requested domain and provide a registrant name.
Other domain suffixes cannot create organizations automatically.

On success, the organization becomes `:verified`. The app stores the registry
name, server, and check time. It replaces a domain-based placeholder name with
the registry name and preserves a chosen display name. It does not retain the
raw response or registrant contact details. The job then activates the user's
membership. Other waiting users have their own durable jobs and reuse the saved
verification result.

Unavailable registries, missing records, and inconclusive responses leave the
organization pending. The last failure and check time are saved. The job retries
up to 20 attempts, starting after one minute and doubling the delay up to one
day. A recently failed domain is not queried again within one minute. Each job
has a 20-second timeout. The queue processes one job at a time per application
instance.

After retries are exhausted, membership remains pending and the job stays in
`job_queue` as failed, with its last failure. Jobs are queued when a user is
confirmed, once per user; sign-ins don't enqueue verification work, so a failed
job needs an operator to approve the organization.

Organizations configured before this migration, and organizations created
explicitly through the normal create action, are `:approved`. This records
existing configuration, not a successful registry lookup. Their members remain
unchanged. Changing an organization's domain clears its registry evidence and
returns it to `:pending` for future assignments. Existing active memberships are
preserved.

The verification and membership updates check in SQL that the organization's
domain and the user's pending membership still match what the job looked up, so a
domain change or a changed membership cancels the job's effect instead of
activating a stale assignment.

Registry sources: [IANA's .edu delegation](https://www.iana.org/domains/root/db/edu.html)
and [Jisc's WHOIS documentation](https://community.jisc.ac.uk/printpdf/867).
EDUCAUSE documents [.edu eligibility and grandfathered registrations](https://net.educause.edu/faq.htm).

Run the behavior checks with `npx vitest run test/school-registry.test.ts
test/verify-school-membership.test.ts` in `apps/server`, and the repository checks with
`bun run precommit`. The migrate entry point creates the job queue table, so a deploy's migrate
step must finish before job workers start.

Profile completion preserves an existing organization assignment and refuses to
activate a pending organization. See the [browser evidence](school-registry/README.md)
for the signup, confirmation, registry lookup, and logged-in profile flow.
