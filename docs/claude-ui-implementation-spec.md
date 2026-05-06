# Claude UI Implementation Spec

Purpose: this document tells Claude how to implement new product UI in this repo without drifting away from the current design system and reusable component layer.

Use this together with:

- [design-system.md](./design-system.md)
- [ux-principles.md](./ux-principles.md)

This doc is the practical implementation reference. It focuses on:

- what reusable components already exist
- when to use each component
- which visual decisions are already settled
- how to compose new screens in the way Codex intended

## 1. Core Product Direction

The app has two visual registers:

- `Hero register`: editorial, photographic, atmospheric, used sparingly
- `Working register`: calm, white, highly legible, used for actual product work

The product should feel:

- calm
- trustworthy
- warm
- mobile-native
- slightly art-directed

The product should not feel:

- dashboard-heavy
- generic startup
- loud
- overly decorative
- purple/glass-first

Important rule:

- The expressive brand voice lives mostly in hero phrases and top-of-screen atmosphere.
- The actual product UI stays in `Geist` and remains highly readable.

## 2. Typography Rules

Typography is mostly settled.

Default product typography:

- `Geist` for body text
- `Geist` for labels
- `Geist` for form controls
- `Geist` for important numbers
- `Geist` for list rows
- `Geist` for buttons and chips

Decorative typography:

- Only the hero phrase `breezy splits` currently changes mood
- Mood options are:
  - `Steady` = Geist
  - `Breezy` = Peace Sans
  - `Postcard` = Fraunces

Do not spread decorative fonts into:

- totals
- balances
- settings labels
- list rows
- receipts
- forms
- section titles

Unless the user explicitly changes the spec, assume decorative fonts remain isolated to a tiny branded phrase area.

## 3. Canonical Assets

Use these image assets rather than pulling directly from `design-inspiration/`:

- `BrandAssets.homeHero` from [brand-assets.ts](/Users/zephanwong/Projects/evenly/constants/brand-assets.ts)
- `BrandAssets.settingsHero` from [brand-assets.ts](/Users/zephanwong/Projects/evenly/constants/brand-assets.ts)

These are the stable hero assets for current implementation work.

If new feature work needs additional art-directed imagery:

- prefer adding new canonical assets under `assets/images/brand/`
- then register them in `constants/brand-assets.ts`
- do not hardcode `design-inspiration/*` paths in feature screens

## 4. Reusable Components

These components should be preferred over one-off layout code.

### `AppScreen`

File: [components/ui/app-screen.tsx](/Users/zephanwong/Projects/evenly/components/ui/app-screen.tsx)

Use for:

- standard top-level screens
- any scrollable product page with the default Evenly padding and safe-area treatment

Do:

- wrap almost every screen in `AppScreen`
- pass `contentContainerStyle` only when needed

Do not:

- recreate `SafeAreaView + ScrollView + padding` manually unless the screen truly needs a different shell

### `EditorialHero`

File: [components/ui/editorial-hero.tsx](/Users/zephanwong/Projects/evenly/components/ui/editorial-hero.tsx)

Use for:

- top hero blocks on Home
- settings preview
- sign-in header
- future saved-detail headers

Props:

- `imageSource`
- `metaLeft`, `metaCenter`, `metaRight`
- `headline`
- `subtitle`
- `headlineStyle`
- optional `footer`
- optional `minHeight`

Do:

- use this for any image-led hero rather than building a new image card structure
- keep the footer short and actionable

Do not:

- add dense forms or long text inside the hero
- put multiple decorative headlines in one hero

### `SectionHeader`

File: [components/ui/section-header.tsx](/Users/zephanwong/Projects/evenly/components/ui/section-header.tsx)

Use for:

- titled sections with a simple trailing action or chip

Examples:

- `Recent expenses` + `View all`
- `Settle softly` + status chip

Do:

- use this instead of re-creating title rows by hand

### `SettingsRow`

File: [components/ui/settings-row.tsx](/Users/zephanwong/Projects/evenly/components/ui/settings-row.tsx)

Use for:

- settings lists
- account rows
- preference rows
- simple “title + subtitle + trailing accessory” patterns

Do:

- use `trailing` for toggles, chips, values, or custom right-side content
- use `showChevron` for navigational rows

Do not:

- use this for expense rows; use `ListRow` there

### `Card`

File: [components/ui/card.tsx](/Users/zephanwong/Projects/evenly/components/ui/card.tsx)

Use for:

- grouped content blocks
- settings sections
- auth form surfaces
- summary panels

Default behavior:

- solid white
- subtle border
- optional subtle elevation with `raised`

### `ListRow`

File: [components/ui/list-row.tsx](/Users/zephanwong/Projects/evenly/components/ui/list-row.tsx)

Use for:

- expense rows
- activity rows
- simple structured item lists

Do:

- pair it with `CategoryIcon` for expense/category rows
- use trailing `Text` with `tabularNums` for money

### `Button`

File: [components/ui/button.tsx](/Users/zephanwong/Projects/evenly/components/ui/button.tsx)

Variants:

- `primary`
- `secondary`
- `ghost`

Rules:

- use `primary` for the main action on a screen or section
- avoid multiple primary buttons stacked unless the flow truly needs it
- use `fullWidth` for form screens and auth surfaces

### `TextInput`

File: [components/ui/text-input.tsx](/Users/zephanwong/Projects/evenly/components/ui/text-input.tsx)

Use for:

- labeled form input
- helper text and inline error text

Do:

- rely on built-in `label`, `helper`, and `error`
- keep validation messages short

### `Banner`

File: [components/ui/banner.tsx](/Users/zephanwong/Projects/evenly/components/ui/banner.tsx)

Use for:

- top-of-section state messaging
- low-confidence warnings
- auth or network feedback

Variants:

- `info`
- `success`
- `warning`
- `error`

Do not:

- dump raw provider error strings if they are overly technical

### Other useful primitives

Use when relevant:

- `Chip`
- `CategoryIcon`
- `CurrencyInput`
- `ReceiptThumbnail`
- `SegmentedControl`
- `Skeleton`
- `BottomSheet`
- `EmptyState`

## 5. Screen Composition Rules

### Preferred screen pattern

For most product screens:

1. `AppScreen`
2. optional `EditorialHero` or top card
3. 1 to 4 stacked content sections
4. white cards or grouped rows for working content

### Home-like screens

Use:

- hero first
- summary block second
- recent or actionable lists after that

Do not:

- bury the primary task under multiple decorative sections

### Settings-like screens

Use:

- short intro card
- grouped preference cards
- settings rows
- preview surfaces only where personalization is being adjusted

Do not:

- turn settings into a second home page

### Auth-like screens

Use:

- image-led hero at top
- one primary white form card
- concise helper content after the form

Do not:

- put auth controls inside the hero
- split sign-in into too many separate screens if a compact inline step works

## 6. UX Advice for Claude

Implement UI the way Codex would:

### Bias toward clarity over novelty

- If a feature choice improves readability, pick it.
- If a decorative idea makes the task flow harder to scan, reject it.

### Reuse first

- Before creating new layout patterns, check whether `AppScreen`, `EditorialHero`, `SectionHeader`, `SettingsRow`, `Card`, `ListRow`, or `Banner` already solve the problem.
- Prefer extending a primitive slightly over inventing a new one-off screen structure.

### Keep imagery at the edges

- Rich imagery belongs in the hero register.
- Working surfaces should mostly remain white and quiet.

### Let money stay boring

- Totals, balances, and amounts should feel stable and trustworthy.
- Do not use decorative fonts for money values.
- Use `tabularNums` where amount alignment matters.

### Minimize tap friction

- Follow the tap-budget rule from `ux-principles.md`.
- Avoid extra confirmation steps unless required by auth/security constraints.

### Always implement states

- New screens should include thought for:
  - loading
  - empty
  - error
  - offline

If all states are not implemented immediately, scaffold the structure for them rather than leaving a blank path.

### Preserve mobile hierarchy

- Design at phone scale first.
- Cards should not become tiny desktop boxes transplanted into mobile.
- Don’t cram too many side-by-side elements into one row.

### Keep copy practical

- UI copy should feel warm but direct.
- Avoid quirky microcopy during operational tasks like auth, totals, and saving.

## 7. Implementation Defaults

When Claude is unsure, default to:

- `AppScreen` for shell
- `Card raised` for grouped surfaces
- `SectionHeader` for titled rows
- `ListRow` for repeated lists
- `Banner info` for non-blocking status
- `Banner error` for failure
- `Geist` behavior via the existing `Text` primitive

## 8. What Claude Should Not Change Casually

Claude should avoid casually changing:

- the color token system in `constants/theme.ts`
- the hero register treatment
- the isolation of decorative fonts to the branded hero phrase
- the canonical brand assets
- the app-wide screen shell and spacing rhythm

If a feature seems to require changing those, Claude should treat that as a design-system decision, not a local implementation tweak.

## 9. Recommended Next Feature Targets

If Claude is asked to continue UI implementation, these are good next surfaces:

- trip creation flow
- home empty/loading/error states
- saved expense detail screen
- edit expense form sections
- scan processing state

These should all be built using the primitives above rather than bespoke layout systems.
