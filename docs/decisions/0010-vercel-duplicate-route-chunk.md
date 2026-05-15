# 0010 — Vercel-only duplicate route chunk

Status: **RESOLVED** — root cause found, fixed in this commit.

## Subject

Vercel-only duplicate route chunk in an Expo Router (SDK 54) web export —
unreproducible locally.

## Symptom

One route screen (`app/expenses/new.tsx`, a manual-entry form) rendered an
**older version of itself** in production. A feature added in a recent
commit (a "Paid by" member picker + a `listTripMembers()` fetch on mount)
was present in source on `main`, present in the deployed JS bundle, but
never executed. The screen ran as it was _before_ that commit. The single
client bundle contained the screen module compiled twice (Module A: 16
deps, pre-feature; Module B: 18 deps, current). Other moved routes
(`trips/[id]/members.tsx`) double-compiled too; a route that never moved
(`app/(tabs)/index.tsx`) did not.

## Root cause

**The "`git mv` out of `(tabs)`" was never a `git mv`.** The old route
files were deleted **only in the local working tree** — the deletions were
never staged or committed. Commit `670ac09` ("move non-tab screens out of
(tabs)/") _added_ the new top-level files but never `git rm`'d the old
`app/(tabs)/…` copies. So at every commit on `main`, git tracked **both**
copies of each moved route.

Why local was clean but Vercel dupes (the "core mystery"):

- **Local:** the working tree has the `(tabs)` copies deleted (uncommitted
  ` D`). Metro's `require.context('./app')` only globs the new paths → one
  module per route → clean build.
- **Vercel:** does a fresh `git clone` of the commit, which **restores the
  ghost `(tabs)` files** (their deletion was never committed). `app/` now
  contains both copies. Expo Router globs both and compiles each screen
  twice. Route groups contribute no URL segment, so
  `app/(tabs)/trips/[id]/members.tsx` and `app/trips/[id]/members.tsx`
  resolve to the **identical** route `/trips/[id]/members` — a hard
  collision the router resolves to the stale ghost. For `expenses`, the
  `new→add` rename (`fc84d17`) only side-stepped the collision; the ghost
  still served the old `/expenses/new`.

## Proof chain (verified at HEAD 90f877f, before the fix)

| Evidence                                    | Finding                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git ls-tree -r HEAD`                       | HEAD still contained the entire `app/(tabs)/expenses/`, `app/(tabs)/quick-capture/`, `app/(tabs)/trips/[id]/members.tsx` tree                         |
| `git ls-files`                              | Both copies tracked: `app/(tabs)/expenses/new.tsx` + `app/expenses/add.tsx`, `app/(tabs)/trips/[id]/members.tsx` + `app/trips/[id]/members.tsx`, etc. |
| `git status --porcelain`                    | Old paths ` D` = deleted in working tree, not staged, not committed                                                                                   |
| `git log --diff-filter=A` / `--follow`      | New files _added_ in `670ac09`; **no commit ever removed** the old ones → working-tree copy, not atomic `git mv`                                      |
| `git show HEAD:app/(tabs)/expenses/new.tsx` | Ghost at HEAD has no `listTripMembers`/`PayerPicker` → it _is_ Module A (stale, 16 deps)                                                              |
| working `app/expenses/add.tsx`              | Has the new imports → Module B (18 deps)                                                                                                              |
| no `app/index.tsx` exists                   | `app/(tabs)/index.tsx` has no ghost twin → not duplicated (matches the control case)                                                                  |

## Why every earlier "ruled out" item was correctly ruled out

None of them was the cause. `VERCEL_FORCE_NO_BUILD_CACHE`,
`expo export --clear`, Metro/haste cache wipes, Node 22 vs 24, output mode
(`single`/`server`), React Compiler, double route registration,
case-sensitive Linux FS — all irrelevant to git-tracked ghost files. The
real cause was never tested because it was assumed to be a build-system
problem. It was a botched file move: the deletions existed only on the dev
box's uncommitted working tree, so local builds were clean and every fresh
Vercel checkout resurrected the ghosts.

## Fix

1. `git rm` the 7 ghost `app/(tabs)/…` files (commit the deletions that
   only existed in the working tree).
2. Revert the `new→add` workaround (`fc84d17`): `git mv
app/expenses/add.tsx → app/expenses/new.tsx` and restore the single
   `router.push('/expenses/new')` caller in `app/(tabs)/index.tsx`.

## Lesson

`git mv` (or `git rm` + add) must be a single atomic, committed operation.
A working-tree-only delete is invisible to CI/deploy clones and produces
"works locally, broken in prod" with no cache or environment explanation.
Sanity check after any route move: `git ls-tree -r HEAD --name-only |
grep '(tabs)'` should not list moved-away files.
