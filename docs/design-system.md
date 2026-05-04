# Design system

Concrete proposal for how Evenly looks and feels. Companion to [ux-principles.md](./ux-principles.md): that doc is the rubric (must-haves, forbidden patterns); this one is the visual + interaction system. When something here proves wrong in practice, update it.

Status: **accepted for milestone 1 (scan + key + save)**, 2026-05-05. Codex review at [codex-reviews/2026-05-05-design-system.md](./codex-reviews/2026-05-05-design-system.md); 14/14 findings reconciled.

## 1. Tone

Friends splitting bills on trips. Money is involved, mistakes hurt friendships. So:

- **Trustworthy** — show what was inferred; don't hide it
- **Effortless** — AI does the boring part; the user glides through edits
- **Warm** — friends on vacation, not corporate accounting
- **Native** — feels like a phone app, not a web page on a phone

Position: **Tricount's warmth, Linear's precision, Stripe's color discipline, Apple's depth.**

## 2. The Stripe register split

Two visual registers, deliberate per surface. Color is an asset, not a default state.

| Register    | Surfaces                                            | Color policy                                                                 |
| ----------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Hero**    | sign-in, home top card, expense-saved detail header | locked formula in §3.5 — no improvisation                                    |
| **Working** | edit form, list rows, settings, dialogs             | white + neutrals; color appears only on category icons + chips, nowhere else |

This discipline prevents YouTrip-loud. Bulk UI stays calm.

## 3. Color

### 3.1 Brand — split into accent + interactive

Two tokens, tonally adjacent, used in different contexts. The accent stays soft because the user-chosen hue feels right; the interactive variant is a single shade darker so text-on-button hits WCAG AA.

| Token                       | Hex       | Use                                                                               |
| --------------------------- | --------- | --------------------------------------------------------------------------------- |
| `brand-accent`              | `#A171F5` | wordmark, hero gradient anchor, focus glow, decorative fills (no text on top)     |
| `brand-interactive`         | `#7C3AED` | primary buttons, links, active segmented option, anywhere text sits on the violet |
| `brand-interactive-pressed` | `#6D28D9` | press / active state                                                              |
| `brand-focus-ring`          | `#C4B5FD` | 2px ring on focused interactive elements                                          |
| `brand-wash-bg`             | `#F4EEFE` | very pale tint behind hero amounts                                                |

White text only on `#7C3AED` or darker. Never on `#A171F5`.

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
| Canvas                 | `#FBFAFC`                            |
| Surface                | `#FFFFFF`                            |
| Surface raised (glass) | `rgba(255,255,255,0.72)` over canvas |
| Border subtle          | `#E9E7EE`                            |
| Text primary           | `#1A1625`                            |
| Text secondary         | `#6B6679`                            |
| Text disabled          | `#A8A4B3`                            |

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

- **Page wash**: `linear-gradient(180deg, #FCF8FF 0%, #F4EEFE 58%, #FFFFFF 100%)`
- **Accent glow behind hero amount**: `rgba(122, 90, 248, 0.14)` — single radial glow, no mesh, no second hue
- **No pink in milestone 1**

Saved-detail header reuses the same wash. No second treatment.

### 3.6 Dark mode (post-milestone-1)

Tracked, not built. The same palette will rotate to a darker neutral set; brand and category hues will shift to lighter Radix steps. Specced when we ship dark mode.

## 4. Typography

**Primary: Geist** (sans). **Numerals at hero scale: Geist Mono.** Loaded via `expo-font` in `app/_layout.tsx` from `assets/fonts/`.

### 4.1 Type scale

Hard rule: **no text token below 12pt**. Line-heights specified for every token (matches ux-principles §accessibility floor).

| Token       | Size / line-height | Weight | Family     | Use                                                     |
| ----------- | ------------------ | ------ | ---------- | ------------------------------------------------------- |
| display-xl  | 40 / 44            | 700    | Geist Mono | hero amounts only (home trip total, saved-detail total) |
| display     | 28 / 34            | 700    | Geist      | screen titles                                           |
| title       | 22 / 28            | 600    | Geist      | section titles                                          |
| subtitle    | 17 / 24            | 600    | Geist      | row titles, labels                                      |
| body        | 15 / 22            | 400    | Geist      | default body                                            |
| body-strong | 15 / 22            | 500    | Geist      | inline emphasis, inline money amounts                   |
| caption     | 13 / 18            | 400    | Geist      | metadata, timestamps                                    |
| chip        | 12 / 16            | 600    | Geist      | chip labels, tags                                       |

Inline money amounts use `body-strong` (Geist Sans 15/500) with `font-variant-numeric: tabular-nums` so columns align without going Mono. Mono is reserved for display-xl hero totals only — anywhere else, sans + tabular-nums.

### 4.2 Dynamic Type

Respect system font scaling up to **120% minimum**. No truncation, no overlap at that scale on any milestone-1 screen. Test at 100% and 120% during self-verify.

### 4.3 Web focus styling

Every interactive element (buttons, inputs, chips, links, segmented options) on web shows:

- `outline: 2px solid #7C3AED`
- `outline-offset: 2px`
- `border-radius` matches the element

On native, focus rings come from the platform (no override).

### 4.4 Wordmark

"Evenly" set in **Geist 700** at display weight, **−2% letter-spacing** (slightly tightened). No designed mark for milestone 1.

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

## 6. Liquid Glass — two spots only

Restraint won the Codex argument. M1 ships glass at exactly two places:

### 6.1 Hero amount block

- Big Geist Mono numeral (display-xl) over the locked hero wash from §3.5
- `shadow-glass` for the accent glow
- Found on home current-trip total and saved-detail total

### 6.2 Sticky save bar (edit screen)

- `<BlurView intensity={70} tint="light" />` over `rgba(255,255,255,0.72)`
- Sits above the keyboard on edit screen
- 72pt tall + safe-area inset
- Single `Save expense` button inside, brand-interactive

Everything else is solid. Cards stay solid white with hairline border. Category icon tiles are flat (§7.5). Tab bars (post-MVP) will get glass when they ship — not specced here.

### 6.3 Implementation notes

- `expo-blur` already installed
- Hero wash via `expo-linear-gradient` (single 3-stop gradient)
- Accent glow via a positioned `<View>` with `shadow-glass`

## 7. Component primitives (milestone 1)

Built once via the `frontend-design` skill in C1, reused thereafter. Located in `components/ui/<name>.tsx`.

| Component          | Notes                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`           | primary / secondary / ghost; sm / md / lg. Primary = `brand-interactive` bg, white text.                                                   |
| `TextInput`        | labelled, with error/helper, single + multi-line.                                                                                          |
| `CurrencyInput`    | numeric keyboard, formats as you type, decimals locked to currency.                                                                        |
| `Card`             | solid white, hairline border `#E9E7EE`, optional `shadow-xs`.                                                                              |
| `ListRow`          | leading element (avatar / category icon tile), title, subtitle, trailing money. Height 72pt.                                               |
| `Chip`             | pill, height 32pt. Optional leading dot in category icon color. Label in `chip 12/600/16`.                                                 |
| `SegmentedControl` | exclusive multi-option. Active option uses `brand-interactive` bg.                                                                         |
| `BottomSheet`      | half-screen modal, radius 20 top.                                                                                                          |
| `Banner`           | info / warning / error inline message; uses semantic palette §3.4.                                                                         |
| `Skeleton`         | placeholder for loading states.                                                                                                            |
| `EmptyState`       | illustrated zero-data screen (placeholder illustrations for milestone 1).                                                                  |
| `CategoryIcon`     | 40pt rounded-12 square, flat fill = category tint, dark glyph in matching dark variant (§3.2). No gradient, no inner highlight, no shadow. |
| `ReceiptThumbnail` | 56×56 tile, radius 10, border 1px `#E9E7EE`, optional caption below in caption/13/400. Tap to open full preview.                           |

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
- Floating glass tab bar — only relevant once we have multiple tabs

## 13. Decisions of record

| #   | Decision                                           | Value                                                                             |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Brand split                                        | `brand-accent` `#A171F5` (decorative) + `brand-interactive` `#7C3AED` (CTAs/text) |
| 2   | Light default; dark mode tracked                   | yes                                                                               |
| 3   | Two-step harmonized category palette + dark glyphs | locked (§3.2)                                                                     |
| 4   | Category color appears on icons + chips ONLY       | locked                                                                            |
| 5   | Semantic palette separate from category palette    | locked (§3.4)                                                                     |
| 6   | Hero register has one locked formula               | locked (§3.5)                                                                     |
| 7   | Primary typeface                                   | Geist                                                                             |
| 8   | Geist Mono only at display-xl (hero amounts)       | locked                                                                            |
| 9   | No type token below 12pt                           | locked                                                                            |
| 10  | Dynamic Type support to ≥120%                      | required                                                                          |
| 11  | Web focus styling                                  | `2px solid #7C3AED`, 2px offset                                                   |
| 12  | Liquid Glass scope                                 | hero amount block + sticky save bar (only)                                        |
| 13  | Category icons                                     | flat tint tile + dark glyph; no gradient/highlight/shadow                         |
| 14  | Trip create                                        | half-sheet                                                                        |
| 15  | Edit screen                                        | single screen, four stacked sections (Receipt / Items / Totals / Notes)           |
| 16  | Saved confirmation                                 | full read-only screen                                                             |
| 17  | Tab structure (M1)                                 | single tab `Home`                                                                 |
| 18  | Wordmark                                           | "Evenly" in Geist 700 at display, −2% letter-spacing                              |
| 19  | Receipt preview                                    | thumbnail tile 56×56 (not chip)                                                   |
| 20  | State matrix per screen                            | required (§8)                                                                     |
