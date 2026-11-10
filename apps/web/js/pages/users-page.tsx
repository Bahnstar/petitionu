import { ROUTES } from "@/lib/routes"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Search, ShieldCheck } from "lucide-react"
import type { Role, UserDetails, UserDto } from "@petitionu/domain"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FieldError, fieldErrorProps } from "@/components/ui/field-error"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api, serverError } from "@/lib/api"
import { formErrors } from "@/lib/form-errors"
import { useAuth, usePageUser } from "../contexts/auth-context"
import { useDocumentTitle } from "../hooks/use-document-title"

/** Matches the server's row limit: a full page means there may be more to search for. */
const LIST_LIMIT = 250

const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  professor: "Professor",
  admin: "Campus admin",
  superadmin: "Superadmin",
}

const ROLE_RANK: Record<Role, number> = { student: 0, professor: 1, admin: 2, superadmin: 3 }

interface Caller {
  readonly id: string
  readonly role: Role
  readonly organizationId: string | null
}

/** The roles `caller` may give anyone: only a superadmin grants superadmin. */
const assignableRoles = (caller: Caller): ReadonlyArray<Role> =>
  caller.role === "superadmin"
    ? ["student", "professor", "admin", "superadmin"]
    : ["student", "professor", "admin"]

/** Mirrors the server's rule: a superadmin changes anyone; an admin, non-superadmins on campus. */
const canChangeRole = (caller: Caller, target: UserDetails) =>
  caller.role === "superadmin" ||
  (caller.role === "admin" &&
    target.role !== "superadmin" &&
    target.organizationId !== null &&
    target.organizationId === caller.organizationId)

/** "a professor", "a campus admin": every role label takes "a". */
const withArticle = (role: Role) => `a ${ROLE_LABELS[role].toLowerCase()}`

const hasDetails = (user: UserDto): user is UserDetails => "email" in user

const displayName = (user: UserDetails) =>
  [user.firstName, user.lastName].filter(Boolean).join(" ").trim()

const byName = (a: UserDetails, b: UserDetails) =>
  (a.lastName ?? "").localeCompare(b.lastName ?? "") ||
  (a.firstName ?? "").localeCompare(b.firstName ?? "") ||
  a.email.localeCompare(b.email)

function RoleControl({
  caller,
  user,
  onChanged,
}: {
  caller: Caller
  user: UserDetails
  onChanged: (user: UserDetails) => void
}) {
  const setRole = useMutation({
    mutationFn: async (role: Role) => {
      const result = await api.setUserRole({ id: user.id, role })
      if (result.success === false) throw serverError(result.errors)
      return result.data
    },
    onSuccess: onChanged,
  })
  const errors = formErrors(setRole.error, ["role"])
  const message = errors.fields.role ?? errors.summary ?? undefined
  const controlId = `role-${user.id}`
  const errorId = `${controlId}-error`
  const name = displayName(user) || user.email

  const choose = (value: string) => {
    const role = assignableRoles(caller).find((option) => option === value)
    if (!role || role === user.role) return
    const demotesSelf = user.id === caller.id && ROLE_RANK[role] < ROLE_RANK[caller.role]
    const loss =
      role === "admin"
        ? "You will lose superadmin access and see only your own campus."
        : "You will lose access to this page and to moderation."
    if (demotesSelf && !window.confirm(`Make yourself ${withArticle(role)}? ${loss}`)) return
    setRole.mutate(role)
  }

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <div className="flex items-center gap-2">
        {setRole.isPending && (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
        <Select
          value={setRole.isPending ? setRole.variables : user.role}
          onValueChange={choose}
          disabled={setRole.isPending}
        >
          <SelectTrigger
            id={controlId}
            className="w-44"
            aria-label={`Role for ${name}`}
            {...fieldErrorProps(errorId, message)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {assignableRoles(caller).map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {setRole.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          Saving…
        </p>
      )}
      <FieldError id={errorId} message={message} />
    </div>
  )
}

function UserRow({
  caller,
  user,
  campus,
  onChanged,
}: {
  caller: Caller
  user: UserDetails
  campus: string | null
  onChanged: (user: UserDetails) => void
}) {
  const name = displayName(user)
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          <span className="break-words">{name || "No name yet"}</span>
          {user.id === caller.id && <Badge variant="secondary">You</Badge>}
        </p>
        <p className="text-sm break-all text-muted-foreground">{user.email}</p>
        {campus && <p className="text-xs text-muted-foreground">{campus}</p>}
      </div>
      {canChangeRole(caller, user) ? (
        <RoleControl caller={caller} user={user} onChanged={onChanged} />
      ) : (
        <div className="flex flex-col gap-1 sm:items-end">
          <Badge variant="outline" className="gap-1">
            <ShieldCheck aria-hidden="true" />
            {ROLE_LABELS[user.role]}
          </Badge>
          <p className="text-xs text-muted-foreground">Only a superadmin can change this role.</p>
        </div>
      )}
    </li>
  )
}

export default function UsersPage() {
  useDocumentTitle("People & roles")
  const { isLoading, refetch: refetchMe } = useAuth()
  const user = usePageUser()
  const client = useQueryClient()
  const [draft, setDraft] = useState("")
  const [search, setSearch] = useState("")
  const [notice, setNotice] = useState("")
  const isOperator = user?.role === "admin" || user?.role === "superadmin"
  const isSuperadmin = user?.role === "superadmin"

  useEffect(() => {
    const next = draft.trim()
    if (next === search) return
    const timer = window.setTimeout(() => setSearch(next), 300)
    return () => window.clearTimeout(timer)
  }, [draft, search])

  const users = useQuery({
    queryKey: ["users", user?.id, search],
    enabled: isOperator,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const result = await api.getUsers(search ? { search } : {})
      if (result.success === false) throw serverError(result.errors)
      return result.data
    },
  })
  const organizations = useQuery({
    queryKey: ["organizations"],
    enabled: isSuperadmin,
    queryFn: async () => {
      const result = await api.getOrganizations()
      if (result.success === false) throw serverError(result.errors)
      return result.data
    },
  })
  const campusNames = useMemo(
    () => new Map((organizations.data ?? []).map((org) => [org.id, org.name])),
    [organizations.data],
  )
  const rows = useMemo(() => (users.data ?? []).filter(hasDetails).sort(byName), [users.data])

  const changed = (updated: UserDetails) => {
    setNotice(`${displayName(updated) || updated.email} is now ${withArticle(updated.role)}.`)
    void client.invalidateQueries({ queryKey: ["users"] })
    if (updated.id === user?.id) refetchMe()
  }

  if (isLoading)
    return (
      <main className="app-page">
        <p role="status">Loading your account…</p>
      </main>
    )
  if (!user || !isOperator)
    return (
      <main className="app-page space-y-3">
        <h1 className="text-3xl font-semibold">People & roles</h1>
        <p>This page is available to campus administrators and platform operators.</p>
        <Link to={ROUTES.support} className="underline">
          Contact support
        </Link>
      </main>
    )

  const caller: Caller = { id: user.id, role: user.role, organizationId: user.organizationId }
  const campusOf = (target: UserDetails) => {
    if (!isSuperadmin) return null
    if (!target.organizationId) return "No campus"
    return campusNames.get(target.organizationId) ?? "Unnamed campus"
  }

  function renderList() {
    if (users.isPending) return <p role="status">Loading people…</p>
    if (users.error)
      return (
        <div className="space-y-2">
          <p role="alert">{users.error.message}</p>
          <Button variant="outline" onClick={() => users.refetch()}>
            Retry
          </Button>
        </div>
      )
    if (rows.length === 0)
      return (
        <p className="rounded-xl border p-8 text-muted-foreground">
          {search ? `Nobody matches “${search}”.` : "Nobody here yet."}
        </p>
      )
    return (
      <>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {rows.length === LIST_LIMIT
            ? `Showing the first ${LIST_LIMIT}. Search by name or email to find someone else.`
            : `${rows.length} ${rows.length === 1 ? "person" : "people"}${search ? ` matching “${search}”` : ""}`}
        </p>
        <ul className="divide-y rounded-2xl border bg-card" aria-busy={users.isFetching}>
          {rows.map((row) => (
            <UserRow
              key={row.id}
              caller={caller}
              user={row}
              campus={campusOf(row)}
              onChanged={changed}
            />
          ))}
        </ul>
      </>
    )
  }

  return (
    <main className="app-page max-w-4xl space-y-7">
      <header className="space-y-2">
        <p className="text-sm text-muted-foreground">Campus care</p>
        <h1 className="text-3xl font-semibold">People & roles</h1>
        <p className="text-muted-foreground">
          {isSuperadmin
            ? "Everyone on PetitionU. Appoint professors, campus admins, and superadmins."
            : `Everyone on ${user.organization?.name ?? "your campus"}. Appoint professors and campus admins.`}
        </p>
      </header>
      <form
        role="search"
        className="relative"
        onSubmit={(event) => {
          event.preventDefault()
          setSearch(draft.trim())
        }}
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          className="pl-9"
          aria-label="Search people by name or email"
          placeholder="Search by name or email"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>
      {notice && (
        <p role="status" className="rounded-xl bg-muted p-3">
          {notice}
        </p>
      )}
      <section className="space-y-3" aria-label="People">
        {renderList()}
      </section>
    </main>
  )
}
