# PetitionU — Inside Pages UX Audit (Aug 2026)

Scope: `assets/js/pages/*`, `assets/js/features/**`, `assets/js/components/*`, `assets/css/app.css`, `lib/petitionu_web/components/*`

## Current shell

- `lib/petitionu_web/components/layouts.ex:36` — Phoenix `Layouts.app` still ships the default Phoenix nav (Website / GitHub / Get Started + `v{Application.spec(:phoenix, :vsn)}`) alongside the React SPA’s `Header`. Two shells compete; the React `Layout` (`assets/js/components/layout.tsx:6`) wraps everything in `from-slate-50 to-orange-50` but never sets `.dark`, so auth pages (`data-theme`) and SPA (`:root` vars) diverge.
- `assets/js/components/header.tsx:41` — user icon is a bare `<button>` with no menu, no active state, no `aria-label`, duplicates the CTA (`nav: Start a Petition` + `button: Start a Petition/Create`). No mobile nav; `hidden md:flex` just hides links with no alternative.
- `assets/js/components/footer.tsx:17` — three identical links, no sitemap, no accessibility skip link.

## Petition card (core object)

- `assets/js/features/petition/petition-card.tsx:14` — outer `<Link>` wraps the entire card including an inner `<Link><Button>`. Nested interactive elements, invalid HTML, double navigation, and screen-reader confusion. Also `petition.goal` can be null but progress divides by `goal ?? 1` then shows `of {goal}` as `null`.
- Visual: `bg-card border rounded-lg p-6 hover:shadow-lg` is generic shadcn default. Category pill is always `bg-secondary` regardless of `category.color` that exists in the schema — wasted signal. `daysLeft` is never color-encoded, so urgency is invisible. `trending` is a boolean badge with no velocity explanation.
- No author avatar, no relative time, no milestone (25/50/75/100), thin `h-2` progress that disappears on busy pages.

## Browse

- `assets/js/pages/browse-petitions-page.tsx:141` — fetches all petitions then filters/sorts client-side. Works for demo but not at scale; `searchQuery` is live on every keystroke with no debounce or URL sync (except initial `?q`), so refresh loses filters. `Sort by: trending` sorts by boolean, not signature velocity.
- `SORT_OPTIONS` include `ending-soon` but UI never surfaces `daysLeft` urgency color; category names are plain `Button variant=outline` with no color or count.
- `filteredPetitions` is derived on every render; pagination is missing.

## Detail

- `assets/js/pages/petition-index-page.tsx:405` — `petition.signatures.filter((_, i) => i < 5).map(s => s.userAgent)` renders the signing browser as the name; `reason` may be empty and `userAgent` is not a display name. Comments POST (`createComment`) works but `PetitionIndexLoadingState` shows 3 fake signature rows forever if `signatures` length is 0 — no empty state.
- Sidebar sign form (`<form>` at 536) has uncontrolled inputs with no `to_form`, no validation, and a button with no `type="submit"` that never calls an RPC. `Share` and `Flag` are inert `<button>`s without `aria-label`.

## Dashboard

- `assets/js/pages/dashboard-page.tsx:242` — `user.school = "UC Berkeley"` and `user.joinedDate = "January 2024"` are hardcoded TODOs; the welcome badges feel fabricated. Notification bell shows hardcoded `3`. `DashboardStats` (`features/dashboard/dashboard-stats.tsx:34`) hardcodes `Impact Score 89 / Top 10%` — the only real props are three counts; it prints them without deltas or sparklines.
- `UserPetitions` and `SignedPetitions` reuse the same card but without links, no empty state illustration, and `insertedAt?.toLocaleString()` on a string field.

## Classrooms

- `joinCode` is rendered as `<code>` in a muted box (`classroom-detail-page.tsx:385`) but copy is only available to professors; students see no hint. `MemberList` shows roles but no avatars; archiving is an outline button that looks secondary.
- `classrooms-page.tsx:139` splits `owned` vs `member` but both render the same `ClassroomList` with identical empty states.

## Design system

- `assets/css/app.css:119–143` defines shadcn vars: `--primary oklch(0.35 0.08 160)` (muted teal) on a warm `#0.98 0.005 85` background — low contrast, institutional, not rallying. `--radius 0.5rem` is consistent but cards use `rounded-lg` and `rounded-xl` interchangeably.
- DaisyUI + shadcn coexist: daisyUI themes (`data-theme` light/dark) drive auth pages, shadcn vars (`.dark` class) drive the SPA. Two theming systems, no bridge. `hero-*` is available but unused outside `Layouts.theme_toggle`.

## What good looks like (tested in prototypes)

- Single shell: retire `Layouts.app` nav on SPA routes, keep it only for `/sign-in` etc.; promote the React header to 48–64px with active state `bg-[#18181B] text-white` (B) or `bg-[#1C1917] rounded-full` (A).
- Card contract: `<article>` with `category dot + name`, `urgency pill (daysLeft <7 red, <14 amber)`, `velocity (sigs/day)`, `milestone badges at 75/100`, one CTA, no nested links. Category color maps to `category.color`.
- Browse as system: `?q=&category=&sort=` synced to URL, debounced search, sticky filter bar, `view: grid/list` toggle, real pagination.
- Detail as campaign: verified signatures (email domain), timeline, endorsements (librarian, professor), and a working sign form with optimistic update.
- Dashboard as pipeline: `Active · Velocity · Shipped` with sparklines, not “Impact 89”.
- Tokens: keep shadcn vars but repoint `--primary` to a warmer rally color (terracotta A or orange C) and add `--urgency-*` tokens.

## Effort

- S: card + header (3–5 files)
- M: browse URL sync + dashboard pipeline
- L: detail campaign layout + classroom polish + theming unification
