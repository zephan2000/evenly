---
description: Audit the latest UI changes against docs/ux-principles.md and surface findings.
---

You are running a UX audit on the most recent UI changes in this repo. Be rigorous, specific, and actionable. This is a mandatory step before claiming UI work is done.

## What to do

1. **Identify what changed.** Run `git diff HEAD` and `git status` to see modified UI files. UI files are anything under `app/`, `components/`, or `lib/ux/`. If there are no UI changes, report "no UI changes to audit" and stop.

2. **Read the principles.** Open and re-read `docs/ux-principles.md`. This is the rubric.

3. **For each changed UI file**, check it against the rubric. For every check, mark one of:
   - ✅ Pass
   - ⚠️ Concern (works but suboptimal — explain why)
   - ❌ Fail (violates a principle — must fix or explicitly accept)
   - N/A (not applicable to this change)

4. **Specifically check:**
   - **States:** does this screen/component handle empty, loading, error, and offline states?
   - **Tap targets:** ≥44pt on iOS, ≥48dp on Android, ≥8pt apart?
   - **Accessibility:** every interactive element has `accessibilityLabel`? Color contrast WCAG AA? No info conveyed by color alone?
   - **Forbidden patterns:** any of the following present?
     - Multi-screen sequential wizard for a single task (use spotlight)
     - Confirmation dialog over AI output
     - "Are you sure?" modal for reversible actions (use undo toast)
     - Spinner over an empty screen (use skeleton)
     - Tooltip carrying primary information
     - Date picker without "today" default
     - Currency dropdown sorted alphabetically (should be frequency-of-use within trip first)
   - **Tap budget:** if part of the hero path (scan receipt → save expense), is it ≤6 taps end-to-end?
   - **AI handling:** AI output editable (not behind confirmation)? Low-confidence values flagged? Failures have user-friendly fallback?
   - **Spotlight pattern:** if it's a sequential flow, does it use the spotlight wizard primitives in `lib/ux/`? Is the active step at 100% opacity, completed steps at 70%, future at 30%?
   - **Performance:** lists use FlatList with stable `keyExtractor`? Images use `expo-image` with explicit dimensions?
   - **Mobile-first:** validated at 375×667? Non-active steps collapse on <600px viewport (if applicable)?

5. **Report format:**

```
## UX Audit — <branch or commit short hash>

**Files audited:**
- path/to/file1.tsx
- path/to/file2.tsx

### Findings

**❌ Fail — <short title>**
File: path/to/file.tsx:LINE
Principle violated: <link to ux-principles.md section>
What I see: <concrete description>
Why it matters: <user impact>
Suggested fix: <specific code change>

**⚠️ Concern — <short title>**
... same shape

**✅ Passed checks**
- States: empty/loading/error/offline all handled
- Tap targets: all ≥44pt
- ...

### Summary
- Failures: N (must fix)
- Concerns: N (should address or explicitly accept)
- Passed: N

### Tap-count audit (if hero path)
Receipt scan → ... → save: N taps. Budget: 6.
```

6. **Be honest.** If something is unclear because the code doesn't show it (e.g., you can't tell if `accessibilityLabel` is set without more context), say "needs human verification: <what>".

7. **Do not** silently fix issues you find — surface them. The user decides what to fix vs accept.

8. **Do not** over-flag. Cosmetic preferences aren't violations. Stick to the rubric in `docs/ux-principles.md`.

## When to skip

Skip this audit if:

- No files in `app/`, `components/`, or `lib/ux/` changed.
- Changes are pure refactors with no behavior or visual change (still note in report).

## After the audit

If failures exist, the user must either fix them, downgrade them to concerns with justification, or update `docs/ux-principles.md` if the principle itself is wrong. **Don't** mark UI work as done with unaddressed failures.
