# PetitionU showcase

A 44-second, 1920 × 1080, 30 fps silent Remotion composition. It follows one arc:

1. **The problem.** Campus complaints pile up in a group chat and scroll away.
2. **PetitionU.** The brand answers it.
3. **The product tour.** This is one continuous browser session beside chapter captions:
   - **Discover:** the campus feed loads, a student searches "library", and the other cards drop away.
   - **Sign:** they type a reason and sign. The panel shrinks to the thank-you state, the count rolls from 42 to 43, their mark turns rose, and their reason appears under "Why people signed".
   - **Discuss:** they post a comment and it lands in the thread.
   - **Create:** they write a petition, pick a category from the real menu, publish, and see "Your idea is out there."
   - **Classrooms:** a professor copies the join code and the class list fills in.
4. **The close.** "Your campus. Your say." and a Start a petition call to action.

Every frame of the product is a real app screenshot, captured from the running app with fictional fixtures. Motion comes from a virtual camera that pans and zooms over full-page captures, a pointer that moves, clicks, and hides while typing, and overlays measured from the live DOM. Those overlays type into fields, tick counters, redraw the 100-mark signature tally, and move pieces of the screenshots between captured states. `scripts/capture.mjs` writes those measurements to `src/layout.json` next to the screenshots, so a recapture keeps every overlay aligned.

- Timing for every scene, page, and caption lives in `src/timeline.ts`.
- Easing and typing helpers are in `src/motion.ts`.
- Brand colors are in `src/theme.ts`.

No production app code is changed.

## Asset storage

The eleven source screenshots total about 3.4 MB, with no file larger than 450 KB. The licensed fonts are another 0.5 MB. These small inputs are committed so a fresh checkout can preview and render without a database or external asset service. Font licenses are included beside the font files.

Generated stills and videos belong in ignored `out/`; Remotion bundles in `build/` and dependencies in `node_modules/` are also ignored. Share exported videos through release attachments or external storage instead of committing them. If larger source video or audio is added later, use Git LFS or versioned object storage with a documented download step.

## Preview

```sh
cd showcase
npm ci
npm run dev -- --no-open --port=3100
```

Open http://localhost:3100/PetitionU. Press Space to play.

## Export when needed

```sh
npx remotion render PetitionU out/petitionu-showcase.mp4 --codec=h264
```

## Refresh the app captures

From the repository root, with the normal Elixir environment available and Phoenix running:

```sh
export SHOWCASE_PASSWORD='choose-a-local-demo-password'
mix help run
mix run showcase/scripts/seed.exs
BASE_URL=http://127.0.0.1:4000 node showcase/scripts/capture.mjs
unset SHOWCASE_PASSWORD
```

Use the actual local Phoenix address in `BASE_URL`.

If Playwright Chromium is missing, run `cd showcase && npx playwright install chromium` first.

The seed refuses non-development or non-local databases. It upserts a separate `showcase.petitionu.test` campus using fixed IDs: 48 fictional users, six petitions, signatures, comments, an update, and a classroom. Rerunning it refreshes the synthetic fixtures and removes only what the capture script created as the demo actor (signature, comment, and published petition) to restore the capture baseline. The professor view uses `student2@showcase.petitionu.test`. It does not reset the database. Sign in as `student1@showcase.petitionu.test` with your chosen password.

The capture script signs the library petition and posts a comment as the demo actor. It also publishes a farmers market petition. Rerunning the seed removes all three, so rerun it before every full recapture. The classroom scene is captured as that classroom's professor, because students only see their own membership.

## Checks

```sh
cd showcase
npm run lint
npx prettier --check src scripts
npm run build
npx remotion still PetitionU out/check.png --frame=560
npx remotion render PetitionU out/preview.mp4 --codec=h264 --scale=0.5
```

The repository's `mix precommit` and `mix assets.build` checks are separate from this project's lint and TypeScript check. Generated stills and video exports go in ignored `out/`.
