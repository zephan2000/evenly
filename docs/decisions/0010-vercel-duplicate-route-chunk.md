# 0010 — Vercel-only duplicate route chunk (open investigation)

Status: **OPEN / unresolved** — this is an investigation log, not a decision.
Written for a second opinion: read cold, no prior context assumed.

## Subject

Vercel-only duplicate route chunk in an Expo Router (SDK 54) web export —
unreproducible locally.

## Stack

- Expo SDK 54, Expo Router 6.0.23, React 19, React Compiler enabled
  (`experiments.reactCompiler: true`), `experiments.typedRoutes: true`
- `app.json` → `web.output: "single"` (also reproduced under `"server"`)
- Deployed on Vercel. Build command (in the npm `build` script):
  `rm -rf .expo dist node_modules/.cache /tmp/metro-* /tmp/haste-map-* && expo export -p web --clear`
- API routes migrated to top-level `api/*.ts` (Vercel native serverless,
  `@vercel/node@5.1.8`)

## Symptom

One route screen (`app/expenses/new.tsx`, a manual-entry form) renders an
**older version of itself** in production. A feature added in a recent
commit (a "Paid by" member picker + a `listTripMembers()` fetch on mount)
is present in source on `main`, present in the deployed JS bundle, but
never executes. The screen runs as it was _before_ that commit.

## Root finding via bundle forensics

The single client bundle (`expo export -p web`, one `entry-<hash>.js`)
contains the screen module compiled **twice**:

- Module A: 16 `__d` deps, no `listTripMembers`/`PayerPicker` imports —
  i.e. pre-feature source
- Module B: 18 deps, with the new imports — current source

Other top-level routes (`trips/[id]/members.tsx`) are also
double-compiled. A route _inside_ a route group (`app/(tabs)/index.tsx`)
is **not** duplicated. The router resolves `/expenses/new` to Module A
(the stale one).

`grep -oE "Promise.all\(\[\(0,.\.listTrips\)" bundle.js | sort | uniq -c`:

- **Local build: 3 distinct instances (correct, 1 per source file).**
- **Vercel build: 5 instances (manual-entry + members each twice).**

## The core mystery

Vercel emits a compiled chunk reflecting _pre-feature source_ even though
`git` confirms the checkout is at the correct commit (build log:
`Cloning ... Commit: 988595e`), and that commit's source file
unambiguously contains the new code. Same source → different bundle hash
on Vercel (`2a14532…`) vs local (`ad876b6f…`).

## Ruled out (each tested; dupe persists on Vercel, absent locally)

1. **Vercel build cache** — `VERCEL_FORCE_NO_BUILD_CACHE=1` env var set;
   build log confirms `"Bundler cache is empty, rebuilding"`.
2. **Metro/expo caches** — wiped `.expo`, `dist`, `node_modules/.cache`,
   `/tmp/metro-*`, `/tmp/haste-map-*`; `expo export --clear`;
   `metro.config.js { resetCache: true, cacheStores: [] }`.
3. **`output` mode** — reproduced under both `server` and `single`. Build
   log confirms `single`: one web bundle, **zero static routes**, so it's
   not SSR static-render duplication / phantom `(tabs)/` prefixes.
4. **Double route registration** — removed all `<Tabs.Screen href:null>`
   and explicit `<Stack.Screen>` entries; dupe persists.
5. **Node version** — local builds clean under both Node 22 (Vercel's,
   forced via `engines`) and Node 24.
6. **Fresh dependency tree** — `rm -rf node_modules && npm install`
   locally → still clean.
7. **CI env** — `CI=1 EXPO_NO_TELEMETRY=1 npm run build` locally → still
   clean.
8. **Project-level route registrations** in both `_layout.tsx` files —
   audited, clean.
9. **Transitive `@/` path-alias imports** — fixed (separate bug; was
   causing API 500s under `@vercel/node` which doesn't resolve the alias;
   now resolved with relative imports).

Local is clean across every permutation. Vercel is dupe'd across every
permutation. Only variables not replicable locally: Vercel's Linux build
container (`/vercel/path0`, case-sensitive FS — the dev box is macOS,
case-insensitive), and whatever Vercel-internal state survives
`VERCEL_FORCE_NO_BUILD_CACHE`.

## Build-log excerpt (Vercel, single mode, commit 988595e)

```
VERCEL_FORCE_NO_BUILD_CACHE is set so skipping build cache step.
Cloning ... (Branch: main, Commit: 988595e)
> rm -rf .expo dist node_modules/.cache /tmp/metro-* /tmp/haste-map-* && expo export -p web --clear
React Compiler enabled
warning: Bundler cache is empty, rebuilding
Web Bundled 60257ms node_modules/expo-router/entry.js (1726 modules)
› web bundles (1): _expo/static/js/web/entry-2a14532….js (3.79 MB)
› Files (3): favicon.ico / index.html / metadata.json
```

(No "Static routes" section — confirms `output: single`.)

## History that may matter

`app/expenses/new.tsx` previously lived at `app/(tabs)/expenses/new.tsx`
and was `git mv`'d out of the route group during an earlier refactor
(stop DOM accumulation across tab navigations). `trips/[id]/members.tsx`
has the same move history. The non-dupe'd route (`app/(tabs)/index.tsx`)
never moved. The dupe correlates with files that changed directory in
git history.

## Open questions for a reviewer

1. What in a Linux / case-sensitive + Vercel build container could make
   Metro emit a _stale-source_ compiled module for one file path while
   git is at the right commit? (Stale haste-map keyed to inode?
   case-collision phantom module? React Compiler non-determinism across
   FS?)
2. Is there a known Expo Router 6 / Metro behavior where a route file
   that moved directories in git history gets resolved as two modules on
   a case-sensitive FS?
3. Would renaming the route file to a path with zero git history fix it,
   or just relocate the ghost? (Being tried: `expenses/new` →
   `expenses/add`, commit `fc84d17`.)
4. Is there a deterministic-build flag for `expo export` / Metro we
   should set?

## Mitigations attempted / planned

- **Tried (~17 PRs):** every cache wipe, output-mode change, route
  registration cleanup, API migration, Node-version match.
- **In flight:** rename `app/expenses/new.tsx` → `app/expenses/add.tsx`
  (history-free path) — commit `fc84d17`.
- **Next if rename fails:** delete + re-import the Vercel project (the
  one Vercel-side state never reset), then file upstream with this doc.
