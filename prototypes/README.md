# PetitionU — Design Directions

Three competing prototypes for the inside pages of PetitionU (petition cards, browse, detail, dashboard, classrooms, shell). Each is a full-page static prototype rendered with Tailwind CDN.

- **Index:** `index.html` — gallery & audit summary
- **Direction A — Ivy Editorial** · `direction-a-editorial.html` — warm paper (#FFFCF5), ink serif (Instrument Serif), terracotta accent. Evidence-first, admin-deliverable credibility. Best for trust.
- **Direction B — Civic OS** · `direction-b-civic.html` — zinc + electric blue, mono metadata, bento grid, velocity metrics. System-of-record for power users.
- **Direction C — Campus Pulse** · `direction-c-pulse.html` — gradient, 20–28px radius, emoji, floating pill nav. Movement energy, Gen-Z rally fuel.

## Viewing

```bash
python3 -m http.server 8001 --directory prototypes
open http://localhost:8001
```

## Regenerating screenshots

Requires `npx playwright` (chromium installed):

```bash
./prototypes/generate-screenshots.sh
# uses http://localhost:8001 so CDN loads reliably, 1280×900 full-page
```

Screenshots land in `prototypes/screenshots/*.png` and are attached to the PR via `gh attach --release` (release-tag `gh-attach-assets`, no browser needed).

## What each prototype demonstrates

All three fix the same load-bearing UX issues that cut across the current app:

1. **Header: wayfinding & trust** — active nav state, `⌘K` search, user avatar + graduation year, mobile drawer, trending ticker. Today the header repeats “Start a Petition” twice and shows a Phoenix version badge.
2. **Petition card: the core object** — fixes nested `<Link>` inside `<Link>` (invalid HTML, double navigation), adds urgency encoding (days-left color), category dot color, progress milestones, velocity (`+127 today`), avatars, and a single primary CTA per card.
3. **Browse: from client filter to system** — moves filtering to URL-synced state, category colors stay consistent, sticky controls, `Sort by: signatures/day` (velocity) rather than just “trending” boolean.
4. **Detail: from form to campaign** — replaces unverified `userAgent` signatures with verified `.edu`, adds delivery timeline (e.g. “Feb 20 · Library committee”), librarian quote, and classroom tie-in.
5. **Dashboard: from placeholders to pipeline** — drops hardcoded “Impact Score 89 / Top 10%” and “UC Berkeley · Member since January 2024” with real metrics: `numPetitions`, `numSigned`, `totalPetitionSignatures`, velocity, and pipeline stages.
6. **Classrooms: join ergonomics** — copy button is primary, regenerate is secondary, member roles visible, “Allow student petitions: ON” as a readable setting, empty state copy (“Use a join code to get started”).

## Recommendation (hybrid)

Pick the best per principle:

- **Typography from A:** Instrument Serif headlines read as editorial credibility — useful when delivering to faculty. Keep Geist for body.
- **Structure from B:** 48px Linear-style header, bento stats, mono metadata, velocity. It scales to 342+ petitions without feeling heavy.
- **Energy from C:** Rounded cards, gradient progress when near goal, confetti/emoji for milestones. Use sparingly (only at 75%+ and victory) so it still feels serious.

A phased rollout: (1) fix petition card + header, (2) ship dashboard pipeline + classroom polish, (3) reskin hero/browse with editorial type.

## Reuse

All prototypes use only Tailwind utility classes and `lucide-react` metaphors — no new deps. Colors are defined inline so they’re easy to lift into `assets/css/app.css` as CSS variables. Copy the header/card you prefer and it drops into the existing React layout.
