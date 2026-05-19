# Design system

Concrete proposal for how Evenly looks and feels. Companion to [ux-principles.md](./ux-principles.md): that doc is the rubric (must-haves, forbidden patterns); this one is the visual + interaction system. When something here proves wrong in practice, update it.

Status: **accepted for milestone 1 (scan + key + save)**, revised 2026-05-06 for the editorial pastoral refresh. Codex review at [codex-reviews/2026-05-05-design-system.md](./codex-reviews/2026-05-05-design-system.md); implementation should follow the updated direction below.

## 1. Tone

Friends splitting bills on trips. Money is involved, mistakes hurt friendships. So:

- **Trustworthy** — show what was inferred; don't hide it
- **Effortless** — AI does the boring part; the user glides through edits
- **Warm** — friends on vacation, not corporate accounting
- **Editorial** — feels art-directed, poster-like, and typographically intentional
- **Native** — feels like a phone app, not a web page on a phone

Position: **Tricount's warmth, editorial poster typography, Apple's restraint, and a quiet travel-photo calm.**

## 2. The Stripe register split

Two visual registers, deliberate per surface. Color is an asset, not a default state.

| Register    | Surfaces                                            | Color policy                                                                 |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Hero**    | sign-in, home top card, expense-saved detail header | locked formula in §3.5 — no improvisation                                    |
| **Working** | edit form, list rows, settings, dialogs             | white + neutrals; color appears only on category icons + chips, nowhere else |

This discipline prevents YouTrip-loud. Bulk UI stays calm.

## 3. Color

### 3.1 Brand — split into accent + interactive

Two tokens, tonally adjacent, used in different contexts. The accent stays soft and atmospheric; the interactive variant is a deeper blue so text-on-button hits WCAG AA without pushing the product into a loud tech palette.

| Token                       | Hex       | Use                                                                             |
| --------------------------- | --------- | ------------------------------------------------------------------------------- |
| `brand-accent`              | `#8FC2FF` | wordmark, hero gradient anchor, focus glow, decorative fills (no text on top)   |
| `brand-interactive`         | `#2457D6` | primary buttons, links, active segmented option, anywhere text sits on the blue |
| `brand-interactive-pressed` | `#1C45AD` | press / active state                                                            |
| `brand-focus-ring`          | `#B9D3FF` | 2px ring on focused interactive elements                                        |
| `brand-wash-bg`             | `#EEF5FF` | very pale tint behind hero amounts                                              |

White text only on `#2457D6` or darker. Never on `#8FC2FF`.

### 3.2 Category palette — two-step, dark glyphs

Every category has an **icon** (saturated, used as small accent dot) and a **tint** (pale, used as the icon-container background). Glyphs sit on the tint as a **dark variant of the same hue**, never white. Each category retains visual identity without losing contrast.

| Category         | Icon (saturated) | Tint (container bg) | Glyph (dark) |
| ---------------- | ---------------- | ------------------- | ------------ |
| Meals            | `#F76B15`        | `#FEEBDC`           | `#C24E00`    |
| Transport        | `#0090FF`        | `#DCEEFE`           | `#0059B8`    |
| Lodging          | `#30A46C`        | `#DDF3E4`           | `#1E7A43`    |
| Entertainment    | `#D6409F`        | `#FCE5F3`           | `#A62A78`    |
| Groceries        | `#FFB224`        | `#FEF0CD`           | `#A35A00`    |
| Shopping + Other | `#8B8D98`        | `#EDEEF0`           | `#5C616B`    |

**Where these appear**: category-icon tiles (40pt), category chips on list rows. Each row gets **exactly one** category cue — never both an icon tile and a chip together.

**Color independence**: category meaning is always conveyed by `icon glyph + text label`. Color is reinforcement only, never the sole signal.

### 3.3 Neutrals (light theme — default)

| Role                   | Hex                                  |
| ---------------------- | ------------------------------------ |
| Canvas                 | `#FAFBF8`                            |
| Surface                | `#FFFFFF`                            |
| Surface raised (glass) | `rgba(255,255,255,0.72)` over canvas |
| Border subtle          | `#E5E9EE`                            |
| Text primary           | `#16233B`                            |
| Text secondary         | `#667085`                            |
| Text disabled          | `#98A2B3`                            |

### 3.4 Semantic — separate from categories

System status carries its own palette so banners, toasts, and chips can never be confused with content taxonomy.

| Role    | Foreground | Background |
| ------- | ---------- | ---------- |
| Info    | `#155EEF`  | `#EAF2FF`  |
| Success | `#067647`  | `#ECFDF3`  |
| Warning | `#B54708`  | `#FFFAEB`  |
| Error   | `#B42318`  | `#FEF3F2`  |

### 3.5 Hero register — one locked formula

To prevent drift, the "rich" register is a single recipe. Reused everywhere a hero surface appears (home top card, saved-detail header).

- **Page wash**: `linear-gradient(180deg, #F4F9FF 0%, #EEF5FF 54%, #FFFDF7 100%)`
- **Accent glow behind hero amount**: `rgba(143, 194, 255, 0.22)` — single radial glow, no mesh, no second hue
- **Photography direction**: soft sky, clouds, open field, water, or quiet landscape imagery behind or adjacent to the hero; images stay calm and low-noise
- **No neon, no purple drift, no synthetic mesh gradients in milestone 1**

Saved-detail header reuses the same wash. No second treatment.

### 3.6 Dark mode (post-milestone-1)

Tracked, not built. The same palette will rotate to a darker neutral set; brand and category hues will shift to lighter Radix steps. Specced when we ship dark mode.

## 4. Typography

**Primary UI sans: Geist.** **Decorative display accents: Peace Sans or Fraunces, depending mood.** Public alternates may still be explored, but the product default is the Geist-centered system. Loaded via `expo-font` in `app/_layout.tsx` from `assets/fonts/`.

System rule: the product is still a utility app, so expressive display fonts are used extremely selectively. Dense form surfaces, tables, list rows, settings, and money values remain in Geist. Decorative fonts appear only in intentionally branded hero copy where warmth matters more than scan speed.

### 4.0 Font pairing policy

- **Default pairing**: Geist + Peace Sans
- **Alternate pairing**: Geist + Fraunces
- **Geist** owns product clarity: body copy, operational UI, labels, form fields, chips, and all important numerals
- **Fraunces** is the warm, postcard-like decorative option: softer, more romantic, more editorial
- **Peace Sans** is the breezier decorative option: rounder, lighter, more playful without becoming childish
- `Cooper BT` and `Proxima Nova` are reference inspirations only, not implementation dependencies
- Never let Fraunces or Peace Sans take over dense product surfaces
- No monospace numerals as a signature move; the new direction is warmer and less technical
- Decorative-font customization is allowed, but only for a tiny hero-copy surface area. Users are choosing a **headline mood**, not changing the product typography wholesale.

### 4.1 Type scale

Hard rule: **no text token below 12pt**. Line-heights specified for every token (matches ux-principles §accessibility floor).

| Token       | Size / line-height | Weight | Family                         | Use                                                                |
| ----------- | ------------------ | ------ | ------------------------------ | ------------------------------------------------------------------ |
| display-xl  | 40 / 44            | 700    | Geist, Peace Sans, or Fraunces | one branded hero phrase only; decorative choice is user-selectable |
| display     | 28 / 34            | 700    | Geist                          | screen titles, large totals                                        |
| title       | 22 / 28            | 600    | Geist                          | section titles                                                     |
| subtitle    | 17 / 24            | 600    | Geist                          | row titles, labels                                                 |
| body        | 15 / 22            | 400    | Geist                          | default body                                                       |
| body-strong | 15 / 22            | 500    | Geist                          | inline emphasis, inline money amounts                              |
| caption     | 13 / 18            | 400    | Geist                          | metadata, timestamps, utility copy                                 |
| chip        | 12 / 16            | 600    | Geist                          | chip labels, tags                                                  |

Inline money amounts use `body-strong` with `font-variant-numeric: tabular-nums` so columns align without looking technical. Important totals remain Geist even when a decorative headline mood is selected.

### 4.2 Dynamic Type

Respect system font scaling up to **120% minimum**. No truncation, no overlap at that scale on any milestone-1 screen. Test at 100% and 120% during self-verify.

### 4.3 Web focus styling

Every interactive element (buttons, inputs, chips, links, segmented options) on web shows:

- `outline: 2px solid #7C3AED`
- `outline-offset: 2px`
- `border-radius` matches the element

On native, focus rings come from the platform (no override).

### 4.4 Wordmark

"Evenly" stays in **Geist 700** for milestone 1 product surfaces. Decorative fonts belong to supporting hero phrases rather than the operational wordmark. No standalone mark for milestone 1.

## 5. Spacing, radii, elevation, component rhythm

### 5.1 Spacing scale

4-pt base. Common steps: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`.

### 5.2 Component rhythm tokens

Concrete dimensions for the components milestone 1 actually ships, so implementation doesn't drift:

| Token                                               | Value                               |
| --------------------------------------------------- | ----------------------------------- |
| Screen padding (mobile)                             | 16pt                                |
| Screen padding (web)                                | 24pt                                |
| List row height                                     | 72pt                                |
| Form field vertical gap                             | 12pt                                |
| Section gap                                         | 24pt                                |
| Chip height                                         | 32pt (with 12pt horizontal padding) |
| Icon ↔ label gap                                    | 12pt                                |
| Sticky save bar height                              | 72pt + bottom safe-area inset       |
| Bottom content padding when sticky save bar present | 96pt minimum                        |
| Tap target minimum                                  | 44 × 44                             |

### 5.3 Radii

| Element                | Radius           |
| ---------------------- | ---------------- |
| Pills (chips)          | 9999             |
| Cards                  | 16               |
| Buttons                | 12               |
| Inputs                 | 10               |
| Bottom sheets          | 20 (top corners) |
| Category icon tile     | 12               |
| Receipt thumbnail tile | 10               |

### 5.4 Elevation

Borders carry most structure on light. Three shadow tokens:

- `shadow-xs`: `0 1px 2px rgb(26 22 37 / 0.04)` — raised cards
- `shadow-sm`: `0 4px 12px rgb(26 22 37 / 0.06)` — floating bars / sticky save
- `shadow-glass`: `0 8px 24px rgb(122 90 248 / 0.14)` — hero amount accent glow

## 6. Liquid Glass — three spots

Restraint won the Codex argument; M1 shipped glass at exactly two places.
The bottom tab bar was added as a third (owner-directed, **ADR 0011** —
overrides the original "two spots only" scope). It remains a closed list:
glass is allowed only at the three spots below, nowhere else (§13
anti-pattern still stands for everything outside this list).

### 6.1 Hero amount block

- Large typographic focal point over the locked hero wash from §3.5
- `shadow-glass` for the accent glow
- Found on home current-trip total and saved-detail total
- May include soft pastoral photography, but type must remain the primary read

### 6.2 Sticky save bar (edit screen)

- `<BlurView intensity={70} tint="light" />` over `rgba(255,255,255,0.72)`
- Sits above the keyboard on edit screen
- 72pt tall + safe-area inset
- Single `Save expense` button inside, brand-interactive

### 6.3 Floating tab bar (ADR 0011)

- Detached, inset, rounded **floating pill** — `position: absolute`, not in
  layout flow
- `<BlurView intensity={70} tint="light" />` over `rgba(255,255,255,0.72)`
  - `shadow-glass` + a hairline top highlight
- Mobile and web both get the floating treatment
- Pointer-safety is load-bearing: the pill is wrapped in a
  `pointerEvents="box-none"` container so the transparent inset margins pass
  touches through; only the pill is touchable. Tab screens reserve bottom
  content padding ≥ pill height + inset so no CTA sits under it. (This is the
  mitigation for the documented "absolute tab bar eats web CTA taps"
  regression — see ADR 0011 + `app/(tabs)/_layout.tsx`.)

Everything else is solid. Cards stay solid white with hairline border. Category icon tiles are flat (§7.5). Glass is the closed three-item list above — nothing else.

### 6.4 Implementation notes

- `expo-blur` (`~15.0.8`) — added 2026-05-19 via ADR 0011. (Earlier revs of
  this doc claimed it was "already installed"; it was not — no `BlurView`
  existed and the §6.1/§6.2 spots used translucent colour + `shadow-glass`
  only.)
- Hero wash via `expo-linear-gradient` (single 3-stop gradient)
- Accent glow via a positioned `<View>` with `shadow-glass`

## 7. Component primitives (milestone 1)

Built once via the `frontend-design` skill in C1, reused thereafter. Located in `components/ui/<name>.tsx`.

| Component          | Notes                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`           | primary / secondary / ghost; sm / md / lg. Primary = `brand-interactive` bg, white text.                                                                                        |
| `TextInput`        | labelled, with error/helper, single + multi-line.                                                                                                                               |
| `CurrencyInput`    | numeric keyboard, formats as you type, decimals locked to currency.                                                                                                             |
| `Card`             | solid white, hairline border `#E9E7EE`, optional `shadow-xs`.                                                                                                                   |
| `ListRow`          | leading element (avatar / category icon tile), title, subtitle, trailing money. Height 72pt.                                                                                    |
| `Chip`             | pill, height 32pt. Optional leading dot in category icon color. Label in `chip 12/600/16`.                                                                                      |
| `SegmentedControl` | exclusive multi-option. Active option uses `brand-interactive` bg.                                                                                                              |
| `BottomSheet`      | half-screen modal, radius 20 top.                                                                                                                                               |
| `Banner`           | info / warning / error inline message; uses semantic palette §3.4.                                                                                                              |
| `Skeleton`         | placeholder for loading states.                                                                                                                                                 |
| `EmptyState`       | illustrated zero-data screen (placeholder illustrations for milestone 1).                                                                                                       |
| `SpotlightWizard`  | reusable sequential single-task primitive. One active step at a time, completed steps revisitable, future steps non-interactive. Collapse is based on available rendered width. |
| `WizardStep`       | presentational step block used by `SpotlightWizard`; whole completed row is tappable on touch.                                                                                  |
| `CategoryIcon`     | 40pt rounded-12 square, flat fill = category tint, dark glyph in matching dark variant (§3.2). No gradient, no inner highlight, no shadow.                                      |
| `ReceiptThumbnail` | 56×56 tile, radius 10, border 1px `#E9E7EE`, optional caption below in caption/13/400. Tap to open full preview.                                                                |

## 7.1 Art direction guardrails

- Home and sign-in may use landscape photography, but working screens should stay mostly image-free
- Photography should feel real, quiet, and breathable; avoid busy city scenes, nightlife, neon, or stock-office imagery
- Layouts should read like an editorial poster translated into app UI: one focal headline, small utility metadata, generous whitespace
- Avoid glossy SaaS tropes: glass everywhere, oversized gradients, purple-on-white defaults, floating decorative blobs
- The design should feel cultured and calm, not playful-cute and not enterprise-serious

## 8. Screen-by-screen — with state matrix

For each screen the rubric: layout sketch + **complete state matrix** (default / empty / loading / error / offline). State coverage is required per ux-principles, not optional.

### C1 — Sign in / sign up

Custom-styled. Uses Clerk's headless `useSignIn` / `useSignUp` hooks.

```
┌─────────────────────────┐
│      Evenly             │   wordmark, Geist 700
│                         │
│   [ email____________ ] │
│   [ password_________ ] │
│   [    Continue    →  ] │   primary button, brand-interactive
│                         │
│   ─── or ───            │
│   [ Continue with G  ]  │   social, post-MVP optional
│                         │
│   New to Evenly? Sign up│
└─────────────────────────┘
```

| State   | Treatment                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------- |
| default | form idle                                                                                                   |
| loading | Continue button → spinner; disable inputs (session restore on app open also enters this state)              |
| error   | inline error text below input ("Wrong password" / "Account not found"); `Banner error` for network failures |
| empty   | n/a (no data dependency)                                                                                    |
| offline | inputs greyed; banner "Sign-in needs a connection" — disable Continue                                       |

### C2 — Home

| State            | Treatment                                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| empty (no trips) | hero CTA "Create a trip" with placeholder illustration                                                            |
| default          | trip switcher header + hero amount block + Scan CTA + Recent list (3 most recent) + "See all N →"                 |
| loading          | skeleton card for hero, skeleton button for Scan, 3 skeleton list rows                                            |
| error            | top inline `Banner error` "Couldn't load trip data" + retry button; rest of screen retains last-known data if any |
| offline          | top `Banner info` "You're offline — showing cached data"; Scan CTA disabled with helper text                      |

```
┌─────────────────────────┐
│  Bali · Apr 2026     ⌄ │   trip switcher, header
│                         │
│  ┌─────────────────────┐│
│  │     S$432.50        ││   display-xl, Geist Mono
│  │     7 expenses      ││   hero wash + accent glow
│  └─────────────────────┘│
│                         │
│  [   Scan a receipt  📷]│   primary, brand-interactive
│                         │
│  Recent                 │   subtitle
│  ┌──────┬──────────────┐│
│  │ ▢🍴  │ Hawker Heaven ││   CategoryIcon tile (flat)
│  │ tint │ Today  S$20  ││   amount: Geist Sans tabular
│  ├──────┼──────────────┤│
│  │ ▢🚕  │ Grab to Ubud  ││
│  │ tint │ Yest.  S$14   ││
│  └──────┴──────────────┘│
│  See all 7 →            │
└─────────────────────────┘
```

### C3 — Trip create

Half-sheet from home.

| State                     | Treatment                                                                        |
| ------------------------- | -------------------------------------------------------------------------------- |
| empty (first-trip helper) | small caption above form: "This is your first trip. We'll save expenses here."   |
| default                   | form with name + currency chips                                                  |
| loading                   | Create button → spinner; disable inputs                                          |
| error                     | `Banner error` above form: "Couldn't create trip — try again"                    |
| offline                   | inputs greyed; `Banner info` "Trip creation needs a connection" — disable Create |

```
┌─────────────────────────┐
│  ─────                  │   sheet handle
│  New trip               │   title
│                         │
│  Name                   │   subtitle
│  [ Bali Apr 2026     ]  │
│                         │
│  Home currency          │
│  [ SGD ] [ USD ] [ EUR ]│   chip selector, 32pt
│  [ MYR ] [ JPY ] [Other]│
│                         │
│  [    Create trip    ]  │   primary
└─────────────────────────┘
```

### C4 — Scan flow

Tap "Scan a receipt" on home → OS image picker (`expo-image-picker`, "library or take photo") → after pick, transient processing screen → auto-advance to C5.

| State                     | Treatment                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| picker default            | OS native picker — no custom UI                                                                                                               |
| loading (uploading)       | thumbnail visible, progress bar, caption "Uploading…"                                                                                         |
| loading (extracting)      | thumbnail visible, indeterminate progress, caption "Reading receipt… typically 2–6 seconds"                                                   |
| error (upload failed)     | thumbnail with red border, `Banner error` "Couldn't upload — try again" + Retry button                                                        |
| error (extraction failed) | thumbnail visible, `Banner error` "Couldn't read this receipt. Please enter manually." + CTA `Enter manually` (opens C5 in manual-entry mode) |
| empty                     | n/a (entered with a selected image)                                                                                                           |
| offline                   | OS picker still works; on submit, `Banner info` "You're offline — saving will queue when online" + Cancel CTA                                 |

```
┌─────────────────────────┐
│ ← Cancel                │
│                         │
│   ┌──────────────┐      │   thumbnail of selected receipt
│   │ [receipt png]│      │
│   └──────────────┘      │
│                         │
│   Reading receipt…      │   title
│   ▓▓▓▓▓▓░░░░  60%       │   progress
│                         │
│   Typically 2–6 seconds │   caption secondary
└─────────────────────────┘
```

### C4b — Quick capture tray

Inbox model for 2–8 receipts. This is not a wizard. Preserve original capture order.

| State        | Treatment                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| processing   | per-card thumbnail + processing status; footer progress summary                                                |
| ready        | receipt appears normal; eligible for tray-level save                                                           |
| needs review | visible under that specific receipt; use warning styling on the card, never reorder the list                   |
| failed       | card stays in place with retry/discard/full-edit affordances                                                   |
| all saved    | success banner + done CTA                                                                                      |
| offline      | banner: "Your selected receipts stay in a local draft on this device. Upload resumes when you're back online." |

```
┌─────────────────────────┐
│ Quick capture      🗑    │
│ Save to Bali Apr 2026 ⌄ │   trip chip, batch-scoped for unsaved receipts only
│                         │
│ ┌─────────────────────┐ │
│ │ [thumb] Dinner      │ │
│ │ Ready · S$42.80     │ │   stable capture order
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ [thumb] Taxi        │ │
│ │ Needs review        │ │   warning kept on this receipt, not promoted via sorting
│ └─────────────────────┘ │
│                         │
│ 4 ready · 2 need review │
│ [ Save receipts ]       │   single persistence action
│ [ Review flagged ]      │   secondary review flow
└─────────────────────────┘
```

Quick-capture tray rules:

- Use one tray-level persistence action: `Save receipts`
- Per-receipt inline editing updates only the local draft; it does not save to the server
- `Needs review` belongs to the receipt, not the batch
- Keep cards in original capture order
- Use inline expansion for lightweight corrections
- Use full-screen edit only as advanced/manual fallback

Expanded draft card pattern:

- collapsed state: thumbnail, merchant, total, compact status
- expanded state: merchant, total, date, currency, category
- actions: `Done`, `Discard`, `Open full edit`
- only one expanded card at a time

Trip handling in tray:

- unsaved receipts follow the tray/header trip chip
- saved receipts are already committed expenses
- if saved and unsaved receipts diverge, show explicit split state in header copy, e.g. `3 saved to Bali · 2 ready for Kyoto`

### C5 — Edit expense

Single screen. Four stacked sections so the form survives at 375×667.

| Section | Fields                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Receipt | thumbnail tile (§ReceiptThumbnail), merchant, date, currency, category                                    |
| Items   | line items list. First 3 visible; "Show all N items" button reveals the rest. Add / edit / remove inline. |
| Totals  | subtotal, service charge, tip, tax (with tax_mode segmented control + tax_label chip), total (bold)       |
| Notes   | optional multi-line text                                                                                  |

Sticky save bar (§6.2) at bottom.

| State                 | Treatment                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| prefilled (default)   | AI-extracted values populate every field; user can edit any                                                                                                   |
| manual-entry          | empty form with `date = today`, `currency = trip default`; rest blank                                                                                         |
| low-confidence        | `Banner warning` below header, above form: "Please verify these values." Visible when `confidence.overall < 0.7`. Background `#FFFAEB`, foreground `#B54708`. |
| math-drift            | small inline note next to total: "These don't add up — check?" Visible when `subtotal + service + tip + tax !== total ± 1¢`. Doesn't block save.              |
| saving                | Save bar spinner; disable form                                                                                                                                |
| saved                 | toast "Saved" → nav to C6 (optimistic)                                                                                                                        |
| error (save rejected) | rollback nav, `Banner error` above form: "Couldn't save — try again" + retry                                                                                  |
| offline               | `Banner info` above form: "You're offline — Save will queue when online" or "Save disabled while offline" (decision: queue. Wire in milestone 2; M1 disables) |

#### C5 addendum — quick capture fallback

When C5 is entered from quick capture, it is an advanced/manual correction surface, not the normal path for every receipt.

Use a compact status row above the form:

- dot row in capture order
- caption: `Receipt {n} of {N} — {merchant}`
- back returns to tray

Quick-capture C5 rules:

- primary action label is `Done`, not `Save`
- `Done` updates the local quick-capture draft and returns control to the tray flow
- actual expense persistence still happens through tray-level `Save receipts`
- in flagged-review mode, allow `Done & next flagged`

This distinction is important: C5 is editing draft data here, not persisting an expense directly.

### C6 — Saved expense detail

Read-only confirmation, with edit + delete affordances.

| State                           | Treatment                                                             |
| ------------------------------- | --------------------------------------------------------------------- |
| default                         | hero amount + breakdown + items list + "Scan another" + "Delete"      |
| loading (after optimistic save) | skeleton hero + skeleton breakdown until server confirms              |
| error (rollback)                | nav back to C5 with banner; toast "Save failed — try again"           |
| empty (deleted/tombstone)       | "This expense was deleted" placeholder + "Undo" if within undo window |
| offline                         | shows cached snapshot + caption "Last synced N min ago"               |

```
┌─────────────────────────┐
│ ← Back        Edit ✏    │
│                         │
│   Hawker Heaven         │
│   Today                 │
│                         │
│  ┌─────────────────────┐│
│  │     S$20.38         ││   display-xl, Geist Mono
│  │     Meals · GST exc ││   chip + caption
│  └─────────────────────┘│
│                         │
│   ┌──────┐              │   ReceiptThumbnail 56×56
│   │ thumb│ tap →         │
│   └──────┘              │
│                         │
│   Subtotal      $17.00  │   labels left, Geist Sans tabular
│   Service        $1.70  │
│   Tax (GST)      $1.68  │
│   ─────                 │
│   Total         $20.38  │   bold
│                         │
│   Items                 │
│   • Chicken Rice ×2     │
│   • Iced Milo ×2        │
│                         │
│   [   Scan another   ]  │   primary
│   [     Delete       ]  │   text-button; undo toast on tap
└─────────────────────────┘
```

### C7 — Split expense

Single screen, working-register surface. Uses the `SpotlightWizard` primitive rather than a multi-screen flow.

| State                 | Treatment                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| default               | Step 1 active; later steps visible in completed/future treatment from the spotlight primitive           |
| loading (initial)     | skeleton wizard shell with Step 1 outline + sticky footer                                               |
| loading (saving)      | `Save splits` spinner in sticky footer; revisit disabled while save is in flight                        |
| empty (no items)      | short-circuit to Review with `Banner info`: "Nothing to split" + `Edit expense` deep-link               |
| error (load failed)   | `Banner error` at top + Retry; retain skeleton structure                                                |
| error (save rejected) | inline `Banner error` above sticky footer; user state preserved                                         |
| offline (load)        | last-known expense data may render; banner explains offline state                                       |
| offline (save)        | optimistic queued save treatment; reconcile on reconnect                                                |
| recomputed            | inline `Banner info`: `Recomputed after expense edit` + short explanation + one-tap `Review split` path |

```
┌─────────────────────────┐
│ Cancel      Split expense│
│ Hawker Heaven · Today   │
│                         │
│ ┌─────────────────────┐ │
│ │ Share groups        │ │   active step
│ │ All members         │ │   full content visible
│ │ Suggestion: Z + A   │ │   low-emphasis assistive hint, not applied
│ └─────────────────────┘ │
│ ─────────────────────── │
│ Mains · 2 items         │   completed/future summaries collapse on narrow widths
│ ─────────────────────── │
│ Review                  │
│                         │
│ [      Save splits    ] │
└─────────────────────────┘
```

C7 rules:

- C7 is entered only from a saved expense, never from quick-capture tray
- Two saved-expense entry affordances may exist, but both land on the same C7 behavior
- `all members` is the safe default baseline
- AI grouping suggestions are optional assistive hints only; users explicitly apply them
- A `Reset to default` affordance returns grouping to the baseline state
- Tax, service, and tip are never directly editable in splitting
- Currency control never appears in C7
- Completed rows are fully tappable
- Auto-advance never skips incomplete or not-yet-renderable steps
- Focus moves to the newly active step on auto-advance

#### Spotlight wizard pattern

This is the design-system expression of the locked spotlight behavior used by C7 and future sequential single-task flows.

| Step state | Treatment                                                                     |
| ---------- | ----------------------------------------------------------------------------- |
| active     | 100% opacity, accent border, `shadow-xs`, slight scale-up, full interactivity |
| completed  | 70% opacity, no border, full-row tap target for revisit                       |
| future     | 30% opacity, no border, non-interactive                                       |

Spotlight rules:

- `currentStepId` is explicit state, not derived from focus
- Collapse is based on available rendered width, not fixed device class
- On narrow widths, non-active steps collapse to a one-line summary
- Auto-advance only happens after a step is actually complete
- Incomplete fields block advance and use inline error treatment first
- Motion may reinforce errors, but never be the sole signal
- On web, focus ring rules from §4.3 still apply
- Opacity alone is never the only status signal; headers/summaries need explicit text state

## 9. Interaction patterns

- **Auto-advance**: scan → upload → extract → edit. No taps in between.
- **Optimistic save**: Save → toast + nav to C6 immediately. Server reject → roll back to C5 with error banner.
- **Inline editing**: every field tappable in place. Numeric keyboard for money. No edit modals.
- **Undo over confirm**: deletions show "Expense deleted — Undo" toast. No "Are you sure?" modals for reversible actions.
- **Skeleton over spinner**: every loading state has the shape of what's coming.
- **Currency dropdowns**: frequency-sorted within trip, then alphabetic. Never alphabetic-only.
- **Receipt thumbnails**: 56×56 tile (§ReceiptThumbnail), tap to open full-screen preview.
- **Focus**: visible focus ring (§4.3) on every interactive element on web.
- **Color independence**: every category cue carries an icon glyph + text label. Color is reinforcement.

## 10. Tap budget audit

Hero path (scan → save):

1. Tap "Scan a receipt" on home
2. Pick / capture photo (1 tap select, or 2 if shoot)
3. (auto-advance to edit — 0 taps)
4. Edit incorrect fields (variable; AI permitting, often 0)
5. Tap "Save"

Floor: **3 taps**. Realistic with one correction: **4–5 taps**. Within ≤6.

## 11. Tab structure (milestone 1)

**Single tab `Home`.** The Expo Router `(tabs)/explore.tsx` placeholder is removed in C1. Tabs return when there's a clear second destination (splitting wizard, settlement view, share-link join).

Header on Home carries: trip switcher (left) + profile menu (right, sign-out).

## 12. Out of scope for milestone 1

Documented here so we don't drift; each gets its own design pass when built.

- Splitting wizard (spotlight pattern from ux-principles §"spotlight wizard")
- Multi-currency FX conversion + display
- Settlement view (who-owes-whom)
- Share-set memory
- Trip share link / anonymous members
- Audit log surface
- Dark mode polish (system-respecting auto-switch is fine; not specifically tuned)
- Localization
- Final empty-state illustrations (placeholders for milestone 1)
- Custom-designed wordmark / brand mark (plain Geist 700 for now)
- Sculpted 3D category icons (gradient + inner highlight + shadow) — milestone 1 uses flat tint tiles per §7. 3D iconography is a polish pass post-MVP when we have proper iconography work scoped.
- ~~Floating glass tab bar — only relevant once we have multiple tabs~~
  → shipped 2026-05-19 (owner-directed, ADR 0011 + §6.3). No longer deferred.

## 13. Decisions of record

| #   | Decision                                           | Value                                                                                |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Brand split                                        | `brand-accent` `#A171F5` (decorative) + `brand-interactive` `#7C3AED` (CTAs/text)    |
| 2   | Light default; dark mode tracked                   | yes                                                                                  |
| 3   | Two-step harmonized category palette + dark glyphs | locked (§3.2)                                                                        |
| 4   | Category color appears on icons + chips ONLY       | locked                                                                               |
| 5   | Semantic palette separate from category palette    | locked (§3.4)                                                                        |
| 6   | Hero register has one locked formula               | locked (§3.5)                                                                        |
| 7   | Primary typeface                                   | Geist                                                                                |
| 8   | Geist Mono only at display-xl (hero amounts)       | locked                                                                               |
| 9   | No type token below 12pt                           | locked                                                                               |
| 10  | Dynamic Type support to ≥120%                      | required                                                                             |
| 11  | Web focus styling                                  | `2px solid` `brand-interactive` (#2457D6), 2px offset — was #7C3AED pre-rebrand (§3) |
| 12  | Liquid Glass scope                                 | hero amount block + sticky save bar + floating tab bar (closed list — ADR 0011, §6)  |
| 13  | Category icons                                     | flat tint tile + dark glyph; no gradient/highlight/shadow                            |
| 14  | Trip create                                        | half-sheet                                                                           |
| 15  | Edit screen                                        | single screen, four stacked sections (Receipt / Items / Totals / Notes)              |
| 16  | Saved confirmation                                 | full read-only screen                                                                |
| 17  | Tab structure (M1)                                 | single tab `Home`                                                                    |
| 18  | Wordmark                                           | "Evenly" in Geist 700 at display, −2% letter-spacing                                 |
| 19  | Receipt preview                                    | thumbnail tile 56×56 (not chip)                                                      |
| 20  | State matrix per screen                            | required (§8)                                                                        |
