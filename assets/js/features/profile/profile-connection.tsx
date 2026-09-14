import { useState } from "react"
import { useIsFetching, useQueryClient } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { Check, ChevronDown, CircleHelp, Landmark, Mail, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CurrentUser } from "../../contexts/auth-context"

export function ProfileConnection({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient()
  const checking = useIsFetching({ queryKey: ["currentUser"] }) > 0
  const [checked, setChecked] = useState(false)

  async function checkStatus() {
    setChecked(false)
    await queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    setChecked(true)
  }

  return (
    <Card className="mt-8 gap-0 overflow-hidden rounded-2xl p-0 shadow-none">
      <div className="flex items-start gap-3 border-b border-border px-5 py-5 sm:items-center sm:px-7">
        <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground sm:mt-0" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 text-sm font-medium break-all">{user.email}</p>
          {user.emailVerified ? (
            <span
              id="email-confirmed-status"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/8 px-2.5 py-1 text-xs font-medium text-foreground"
            >
              <Check className="size-3.5" aria-hidden="true" />
              Email confirmed
            </span>
          ) : (
            <span className="rounded-full bg-[#fff5df] px-2.5 py-1 text-xs font-medium text-[#805b1d]">
              Confirm your email
            </span>
          )}
        </div>
      </div>

      <section
        id="school-connection"
        aria-labelledby="school-connection-heading"
        className="px-5 pt-6 pb-5 sm:px-7 sm:pt-7 sm:pb-6"
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-muted">
              <Landmark className="size-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">Your campus</p>
          </div>
          {user.organizationId && (
            <span
              id="school-connected-status"
              className="inline-flex items-center gap-1.5 text-xs font-medium"
            >
              <Check className="size-3.5" aria-hidden="true" />
              Connected
            </span>
          )}
        </div>
        <h2
          id="school-connection-heading"
          className="[font-family:Newsreader,Georgia,serif] text-3xl leading-tight tracking-tight break-words"
        >
          {user.organizationId
            ? user.organization?.name || "School connected"
            : "School not connected yet"}
        </h2>

        {user.organizationId && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {user.profileComplete
              ? "You're connected to your campus community."
              : "Your campus is ready. Save your profile below to start participating."}
          </p>
        )}

        {user.emailVerified && !user.organizationId && (
          <div id="school-verification-help" className="mt-3 space-y-5">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your email is confirmed. School verification is the next step before you can
              participate.
            </p>
            <div className="border-l-2 border-border pl-4 text-sm leading-relaxed">
              <p className="font-medium">No need to keep this page open.</p>
              <p className="mt-1 text-muted-foreground">
                Your account is saved. Return to Your profile to check your school status.
              </p>
            </div>
            <div>
              <Button
                id="check-school-status"
                type="button"
                variant="outline"
                disabled={checking}
                onClick={checkStatus}
              >
                <RefreshCw
                  className={checking ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"}
                  aria-hidden="true"
                />
                {checking ? "Checking school status..." : "Check school status"}
              </Button>
              <p role="status" className="mt-2 text-xs text-muted-foreground">
                {checked && !checking && "Status checked. Your school is not connected yet."}
              </p>
            </div>
            <details className="group border-t border-border pt-4">
              <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                How school verification works
                <ChevronDown
                  className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                <p>
                  For .edu and .ac.uk addresses, we check the school&apos;s domain against its
                  official registry. Pending means that check has not succeeded yet.
                </p>
                <p>
                  Queued checks and automatic retries can run while you are away. Checking your
                  status loads the latest result; it does not restart verification.
                </p>
                <p>
                  Once your school connects, save your profile to participate. Unsaved profile edits
                  are not kept when you leave.
                </p>
              </div>
            </details>
          </div>
        )}

        {!user.emailVerified && (
          <div className="mt-3 space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Open the confirmation email in your inbox before saving your profile.
            </p>
            <Button type="button" variant="outline" disabled={checking} onClick={checkStatus}>
              {checking ? "Checking confirmation..." : "I confirmed my email"}
            </Button>
          </div>
        )}
      </section>

      <div className="flex items-start gap-2.5 border-t border-border bg-muted/40 px-5 py-4 text-xs leading-relaxed text-muted-foreground sm:px-7">
        <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          {user.organizationId
            ? "Need help with your campus? "
            : "Still waiting, or using another school domain? "}
          <Link
            id="school-verification-support"
            className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            to="/ash-typescript/support"
          >
            Contact support
          </Link>
          {!user.organizationId &&
            " with your school name. You can request help now and follow updates on the Support page."}
        </p>
      </div>
    </Card>
  )
}
