# Public landing page exploration

The question: how should PetitionU introduce itself to a student who has not entered the app?

The user liked aspects of A and C, rejected B's app interface, and requested three additional alternatives. D–F are public marketing pages with distinct headers, an explanation of the product, and a local draft CTA. A–C remain in the earlier exploration set.

## Design plan

| Concept | Tokens | Type | Structure |
| --- | --- | --- | --- |
| D: Open invitation | Lilac `#E7E2FA`, purple `#463397`, yellow `#F5EDAC`, blue paper `#D5E7F5`, white `#FFFFFF` | Newsreader headline, Geist navigation and copy, Impact placards | `[inset header] / [placard · centered invitation · placard] / [three steps] / [closing invitation]` |
| E: Campus story | Forest `#173D32`, chalk `#F5F7F2`, leaf `#D9E6CC`, white `#FFFFFF`, ink `#203B30` | Newsreader editorial display, Geist body | `[navigation over photograph] / [left-aligned invitation over campus scene] / [editorial explanation] / [how it works]` |
| F: First step | Mist `#F1F8F7`, evergreen `#204C48`, rose `#F5CFDC`, paper `#F7E8D2`, white `#FFFFFF` | Geist heading and body, Newsreader sample letter | `[minimal header] / [reassurance + CTA / changing sample letter] / [simple process] / [questions]` |
| G: Mint invitation | Mist `#F1F8F7`, evergreen `#204C48`, rose `#F5CFDC`, paper `#F7E8D2`, white `#FFFFFF` | D's Newsreader headline, Geist copy, Impact placard | D's centered invitation, pill header, placards, and lower sections with F's palette. |

Plan critique: D borrows the movement feeling of A but removes petition cards, counts, and filters. E changes the primary visual entirely to a human campus scene. F uses a sample letter to make starting feel achievable; the interaction is an example idea, not a signed-in workspace. No dashboard chrome, record lists, social proof statistics, or invented testimonials appear in D–F.

Follow-up question: does D's layout work better in F's colors? G is the user's requested combination, deliberately retaining D's component and changing only its palette. The mint background and evergreen type anchor it; paper and blush replace the two placard colors. White separates the header and process section. Muted copy uses a deeper green for readability. D and F remain available for comparison.

## Run and compare

Run `mix phx.server`, then visit `http://localhost:4000/ash-typescript?variant=D`.
The comparison bar presents D, E, F, and G together. Open `http://localhost:4000/ash-typescript?variant=G` for the combined direction. Its set selector returns to A–C. Arrow keys cycle within the selected set. Each page retains its header on mobile.

The original page's query and authentication remain mounted. These marketing concepts do not render the fetched petition collection. Draft previews and the example idea in F live only in memory. No final design decision has been made.

## Campus photograph

Built-in imagegen generated the illustrative photograph, copied to `priv/static/images/prototypes/campus-story.png`. It is not presented as a real institution or a testimonial.

Final generation prompt:

> Use case: photorealistic-natural. Asset type: wide hero photograph for PetitionU, a student-led university petition platform public landing page. Create a candid editorial photograph of a leafy university courtyard in late afternoon. A loose group of five university-age adult students with varied appearances walking and talking naturally on the RIGHT half of the frame, carrying books and canvas backpacks; unposed, facing each other or walking away. Brick university building softly in background, mature trees, soft sun across grass. LEFT half is quieter shaded lawn and foliage with broad dark green tones, usable for a white headline overlay. Wide landscape 16:9 composition, eye level, subtle 35mm film texture, realistic documentary photography, natural greens and warm daylight, believable human details. No signs, no lettering, no logos, no watermark, no UI or drawn graphic overlays. This is an illustrative campus scene, not a photograph of an identified institution.

## Review status

TypeScript, the asset build, and desktop/mobile browser checks pass. Each page has one header, no app-interface subtree, and a working local draft action. Production bundling removes the landing prototype and its switcher. The database-dependent tests in `mix precommit` remain blocked by the unavailable local PostgreSQL server.

Visual review refined D and E's mobile type sizes to keep their introductions compact. F now has a general primary CTA followed by a separate action to use the selected example idea. The shared preview disconnected during review; the pages were also checked in local headless Chrome using the already installed Playwright tools.

Pending visual review. The working branch is `codex/prototype-home-ui`. Preserve the prototype there when a direction is selected, then implement the validated design under normal production constraints.

## Selected implementation

Variant G is implemented as `landing-page.tsx` with scoped styles in `landing-page.css`.
It is the default at `/` and `/ash-typescript`; its CTAs open `/ash-typescript/create`.
The public page does not fetch petitions. Development comparisons remain available
with `?variant=G`, including the original local draft interaction.
