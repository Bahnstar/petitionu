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

`Petitionu.Accounts.VerifySchoolMembership` runs through Oban. It queries
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
organization pending. The last failure and check time are saved. Oban retries
up to 20 attempts, starting after one minute and doubling the delay up to one
day. A recently failed domain is not queried again within one minute. Each job
has a 20-second timeout. The queue processes one job at a time per application
instance.

After retries are exhausted, membership remains pending. A later successful
magic-link sign-in, password reset, or confirmation can enqueue another job.
Operators can also retry a discarded job through `Oban.retry_job/1`. Ordinary
password sign-in does not enqueue verification work.

Organizations configured before this migration, and organizations created
explicitly through the normal create action, are `:approved`. This records
existing configuration, not a successful registry lookup. Their members remain
unchanged. Changing an organization's domain clears its registry evidence and
returns it to `:pending` for future assignments. Existing active memberships are
preserved.

The filtered verification and membership update actions disable Ash's atomic
upgrade path. Tests during implementation against Ash 3.32.0 showed that this path
omitted their changeset filters from SQL. The regular update path preserves
those guards, including protection against stale domains and changed memberships.

Registry sources: [IANA's .edu delegation](https://www.iana.org/domains/root/db/edu.html)
and [Jisc's WHOIS documentation](https://community.jisc.ac.uk/printpdf/867).
EDUCAUSE documents [.edu eligibility and grandfathered registrations](https://net.educause.edu/faq.htm).

Run the behavior checks with `mix test test/petitionu/accounts` and the repository
checks with `mix precommit`. Deployments must apply both the organization
verification migration and the Oban jobs migration before starting job workers.

Profile completion preserves an existing organization assignment and refuses to
activate a pending organization. See the [browser evidence](school-registry/README.md)
for the signup, confirmation, registry lookup, and logged-in profile flow.
