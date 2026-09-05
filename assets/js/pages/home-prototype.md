# PetitionU home-page prototypes

The latest round, D–G, focuses specifically on public landing pages. G combines D's layout with F's palette. See [the landing-page design notes](landing-prototype.md). Use the comparison bar's set selector to move between rounds.

Throwaway exploration on the existing `/ash-typescript` home page. Question: should students discover petitions through a featured campaign, a campus feed, or a cause-first explorer?

Start with `mix phx.server`, then open `http://localhost:4000/ash-typescript?variant=A`.
Use `?variant=A`, `B`, or `C`, the three named buttons in the floating comparison bar, its arrows, or the left/right keys. Search params survive switching; switching returns to the top to reveal the complete design. Inputs and dialogs keep their keyboard controls. Without a variant param the original home page and header render.

| Variant | Color tokens | Type | Layout and intention |
| --- | --- | --- | --- |
| A: Campaign poster | Cobalt `#3536CD`, lime paper `#F2FF9D`, lavender `#EFEDFF`, ink `#2C2C70`, white `#FFFFFF` | Impact display; Geist body | `[large left-aligned ask / tilted campaign ticket]` above cause filters and small campaign posters. The campaign itself is the memorable object. |
| B: Campus board | Paper `#FAF9FC`, plum `#6740AD`, lilac `#ECE5F9`, ink `#24233F`, muted `#746F83` | Geist throughout | `[cause navigation / petition feed / starting guidance]`. Left-aligned, compact and author-led, for returning students. |
| C: Cause explorer | Blush `#FCF6FA`, mauve `#EAE0EF`, forest `#486755`, ink `#453448`, white `#FFFFFF` | Newsreader headings; Geist controls | `[centered question + cause choices]` above `[selection list / expanded petition]`. Invite a student into a cause before asking for a signature. |

Plan critique: a second set of campaign cards would only restyle A, so B uses a continuous feed and C a selectable list/detail browser. Counts belong to petitions; there is no generic hero stats strip. Only A uses display typography as a graphic object.

Review feedback: the first comparison control made the other two designs too easy to miss, and the shared header limited the exploration. Each variant now includes its own header: A uses a cobalt wordmark and campaign navigation, B uses compact app navigation, and C centers a serif wordmark with quieter navigation. All three choices remain visible in the comparison bar. The header's creation button opens the local prototype draft.

The original home query and authentication remain mounted. Fetched petition titles and descriptions are used when available; the preview note identifies sample metadata. When no records are available, sample petitions make the prototype usable. Signatures and draft titles stay in React memory. State in the bottom bar exposes the query status, content source, selected cause, search, visible records, signatures and draft. Nothing is submitted.

Both the development JS environment and the Phoenix `dev_routes` flag must enable the prototype. The normal production page is used otherwise. A production esbuild check confirms the prototype components and switcher are removed from the JavaScript bundle.

Decision: pending visual review. No variant has won yet. Work lives on `codex/prototype-home-ui`; after selection, capture the verdict and snapshot here, then implement the selected design under normal production constraints. No implementation issue has been supplied.

Validation: TypeScript check and `mix assets.build` pass. Browser checks cover all three layouts, 390px widths without horizontal overflow, URL and keyboard switching, input key handling, retained search, empty results, explorer selection, one preview signature per petition, and local drafts. `mix precommit` reaches database setup but cannot run the tests because PostgreSQL is unavailable on localhost:5432. The prototype remains usable with sample content.

Implementation references: [React Router search params](https://reactrouter.com/api/hooks/useSearchParams), [React effect cleanup](https://react.dev/reference/react/useEffect), and the local `mix help` / package usage rules.
