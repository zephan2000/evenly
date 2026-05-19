# 0011 — Liquid-glass floating tab bar + expo-blur

**Status:** Accepted (2026-05-19) — owner-directed; overrides design-system §6 scope.

## Context

The web bottom tab bar (only two tabs: Home, Settings) read as a stretched
phone pattern — two small labels marooned on a full-bleed 88px white bar,
visually detached from the now-centered 1040 content column (see
`b67-settings-web-1280-default.png`). Codex's UX audit P1-3 mis-attributed
this to a "route leak"; it is not (the task routes are root-Stack children,
structurally cannot register as tabs — see ADR 0010 / `(tabs)/_layout.tsx`
comment). The real issue is that the tab bar was never given a web-adapted
visual treatment.

`docs/design-system.md` §6 deliberately scoped Liquid Glass to **two spots
only** (hero amount block + sticky save bar), §13 lists "glass everywhere"
as an anti-pattern, and §13 table + line 629 explicitly mark a floating
glass tab bar as **post-MVP, not specced**. The owner reviewed this and
directed an Apple-style liquid-glass floating navbar now. This ADR records
that as a deliberate owner override of the §6 scope so the doc and shipped
code do not silently diverge.

Two facts surfaced while scoping:

- **`expo-blur` was never installed.** Design-system line 219 claimed it
  "already installed" — false. There is zero `BlurView` usage anywhere; the
  two existing "glass" spots are a translucent surface colour
  (`rgba(255,255,255,0.72)`) + `Shadow.glass` only, no real backdrop blur.
- **A floating absolute tab bar is a known regression vector.** The comment
  in `app/(tabs)/_layout.tsx` records that an absolute tab bar previously
  made _every_ screen-bottom CTA (Save expense, Save splits, Done, Pick
  receipts) un-tappable on web, because the bar intercepted pointer events.
  That is exactly why the bar is currently inline (non-absolute).

## Decision

1. **Add `expo-blur`** (`~15.0.8`, installed via `expo install` so it is
   SDK-54-pinned). It is the design-system's own glass recipe
   (`<BlurView intensity={70} tint="light" />` over
   `rgba(255,255,255,0.72)`); true frosted glass on native is impossible
   without it.

2. **Bottom tab bar becomes a floating detached glass pill**: a custom
   `tabBar` rendering an inset, rounded, `position: absolute` pill — BlurView
   backdrop + `rgba(255,255,255,0.72)` overlay + `Shadow.glass` + a hairline
   top highlight. Mobile and web both get the floating treatment.

3. **Mitigate the documented pointer regression.** The custom tab bar wraps
   the floating pill in a `pointerEvents="box-none"` container so the
   transparent inset margins pass touches through to content/CTAs below;
   only the pill itself is touchable. Tab screens (Home, Settings) get
   bottom content padding ≥ pill height + inset so no CTA ever sits under
   the pill. This reopens the exact bug class ADR-0010-adjacent — so it is
   gated behind a dedicated Playwright web pass (375 + 1280: bar look **and**
   CTA tappability on Home/Settings) before it is considered done.

## Consequences

- New runtime dependency (`expo-blur`): native build + small bundle cost.
- Liquid Glass now ships at **three** spots, not two. `docs/design-system.md`
  §6, §13 anti-pattern, §13 scope table, and the stale line 219 are updated
  to match this decision (reconciliation, not silent divergence).
- Regression risk is real (un-tappable CTAs on web) — explicitly accepted
  conditional on the dedicated web verify pass passing.

## Alternatives rejected

- **No-dep approximation** (web CSS blur, native = translucent + shadow
  only): no true frost on phones — owner chose real glass.
- **In-flow glass bar** (glass material, stays in layout flow, zero
  regression risk): safer, but not the detached Apple floating pill the
  owner asked for.
- **Leave as-is**: owner rejected — reads as a stretched phone bar on web.
