# PetitionU showcase

A 24-second, 1920 × 1080, 30 fps Remotion composition. Seven scenes introduce PetitionU, browse campus petitions, show a real signature increasing the count from 42 to 43, highlight discussion, fill out a petition draft, explore a classroom, and close with a call to action. The futuristic keynote treatment uses kinetic headlines, the app’s mint, forest, blush, and cream palette with locally bundled Newsreader and Geist fonts, fast eight-frame transitions, and full-viewport product reveals beside the captions. It is silent and designed to work with on-screen captions.

The visuals use real app screenshots backed by fictional local fixtures. Screenshots are bundled, so previewing and exporting do not require Phoenix or a database. Motion, captions, framing, and transitions remain editable in `src/`. No production app code is changed.

## Asset storage

The source screenshots and licensed fonts total approximately 2.2 MB, with no individual file larger than 450 KB. These small inputs are committed so a fresh checkout can preview and render without a database or external asset service. Font licenses are included beside the font files.

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

The seed refuses non-development or non-local databases. It upserts a separate `showcase.petitionu.test` campus using fixed IDs: 48 fictional users, six petitions, signatures, comments, an update, and a classroom. Rerunning it refreshes the synthetic fixtures and removes only the demo actor's signature on the library petition to restore the capture baseline. It does not reset the database. Sign in as `student1@showcase.petitionu.test` with your chosen password.

The capture script signs the library petition as the demo actor and fills a creation form without publishing it. Rerun the seed before a full recapture. Classroom counts reflect what the signed-in student can see under the app's current policies.

## Checks

```sh
cd showcase
npm run lint
npx remotion still PetitionU out/check.png --frame=430
```

The repository's `mix precommit` and `mix assets.build` checks are separate from this project's lint and TypeScript check. Generated stills and video exports go in ignored `out/`.
