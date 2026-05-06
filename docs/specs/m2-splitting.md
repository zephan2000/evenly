# M2 splitting — Spec

**Status:** Draft, 2026-05-07. Pending Zephan review → Codex review → implementation.

**Authors:** Claude (spec, scaffold, underlying logic), Codex (UI implementation), Zephan (product owner).

This spec describes the splitting milestone (M2): turning a saved expense into per-member shares using the spotlight wizard from [docs/ux-principles.md](../ux-principles.md) and the share-set model from [docs/decisions/0004-share-sets.md](../decisions/0004-share-sets.md). The reusable wizard primitive itself is specced separately in [spotlight-wizard-primitive.md](./spotlight-wizard-primitive.md).

## 0. Pending confirmations

These are intentionally **not resolved** in this draft. Each is surfaced for Zephan to direct before implementation begins.

- **Entry point** — Should splitting be reachable from C6 detail screen via an Edit-mode "Split this expense" button, via a dedicated `Split` CTA on C6, or both? The decision affects whether splitting is a one-shot post-save flow or an ongoing affordance on every saved expense.
- **Re-split semantics** — When an already-split expense is edited later (item amount changed, currency changed, item added/removed), what happens to existing splits? Auto-recompute proportionally? Mark dirty and force re-split? Drop and re-prompt? Drop only the affected item's splits?
- **Max members per share set** — Is there a hard cap on share-set size for M2 (e.g., 12)? The data model itself doesn't enforce one. UX-wise we may want a warning past N members because per-person panels become unwieldy.
- **Quick capture × splitting** — Does "View batch" on a Quick capture expense expose splitting from the tray, or only from the per-expense detail (C6)? If from the tray, do we support "Split all 6 receipts the same way" as a sugar action, or treat each receipt as independent? Current default assumption: per-expense only.
- **Default share group** — On first entry to splitting for a fresh expense, do all items default to "all members" (the simplest default), or does the AI suggest groupings based on history (per-item member predictions)? AI suggestions are mentioned in ADR 0006 but not committed for M2.
- **Settlement coupling** — Is M2 scoped to splitting-only, with settlement still a later milestone? Or does M2 also ship the settlement view that consumes these splits? Default assumption: splitting-only; settlement is its own milestone.
- **Casual-mode authorship** — In casual auth mode (default per ADR 0008), can any trip member edit any other member's split assignments, or only the expense's `created_by_member_id` and the trip owner? Existing RLS sketch in [docs/data-model.md](../data-model.md#rls-sketch) leaves this for the implementation.
- **Empty-trip case** — If a trip has only the owner as a member when splitting begins, do we force a "Add members or share link" step before the wizard, or allow a degenerate single-member split that records 100% to the owner?
- **Anonymous member display in panels** — When a per-person panel needs an avatar/name for an anonymous member who has not picked a display name yet, what's the placeholder? "Member 2"? Initials of the device locale? This is downstream of the trip-share / anon-member work but matters for first-render in M2.

## 1. Goal

Let a trip member turn a saved expense into per-person shares — using a single-screen, opacity-graded spotlight wizard — in fewer taps than Tricount, with share sets auto-saved for one-tap reuse on the next expense.

## 2. User story

> "I just saved a S$240 group dinner. The 4 of us shared the starters and rice. Two of us shared the wine. Mains were each-to-their-own. I want to record all that in under a minute, without re-typing names, and never having to do tax math myself."

## 3. Scope

**In scope (M2):**

- Single-screen spotlight wizard for splitting one saved expense.
- Step 1 — Share groups: assign items to one or more share sets (or "all members").
- Step 2..N — Per-person panels for items not covered by a share group.
- Auto-detection and auto-save of share sets when a unique combination of members is used (per ADR 0004).
- Suggestion of share sets sorted by `last_used_at`.
- Proportional distribution of `service_charge`, `tip`, and `tax_amount` based on each member's pre-tax subtotal share — never user-assigned.
- Currency override at the **top** of the expense edit screen (per ux-principles), not introduced anywhere in the splitting flow.
- State coverage: default / loading / empty / error / offline (per ux-principles "Hard requirements").
- Mobile-first at 375×667; web layout adjustment but same model.
- Persistence to `expense_item_splits` rows, one per `(item, member)` slice.
- Audit-log entries for `split.update` per ADR-0008-aligned actor attribution.

**Out of scope (deferred):**

- Settlement view (consumer of splits) — separate milestone unless §0 confirms otherwise.
- AI-suggested per-person defaults from history — ADR 0006 mentions this but defer to post-M2 once we have history.
- Percentage-rule splits (`share_rule = 'percentage'`) — keep schema, no UI.
- Strict-mode auth gating of who can edit splits — defer with the rest of strict-mode (post-MVP).
- "Split all receipts in this batch the same way" Quick capture sugar — see §0.
- Re-split-on-edit auto-reconciliation — see §0.

## 4. Milestone slot

**M2**, immediately after M1.5 (Quick capture). Reuses M1's `expenses` + `expense_items` rows; lands new `expense_item_splits` writes; introduces the reusable spotlight-wizard primitive in `lib/ux/`.

Must not regress single-receipt M1 nor quick-capture M1.5 flows. The wizard is reachable only from a saved expense — never from the tray or from C5 edit.

## 5. UX flow

### 5.1 Entry

**Pending §0** — entry point is one of:

- C6 detail screen `Split` CTA (primary), opens new C7 splitting screen.
- C6 Edit-mode `Split this expense` button next to the existing edit affordances.

For this draft we assume **a `Split` CTA on C6 detail**, navigating to a new screen `C7 — Split expense`. C5 edit is unrelated to splitting; the wizard never appears mid-edit.

### 5.2 C7 — Split expense (new screen)

Single screen. Stacked steps. Spotlight model from [spotlight-wizard-primitive.md](./spotlight-wizard-primitive.md).

**Header:**

- Title: "Split expense".
- Subtitle: `{merchant} · {expense_date}`.
- Trailing: `Cancel` (returns to C6 with no writes — see §5.6 discard behavior).

**Body:** vertical stack of `WizardStep` blocks. Step list is built dynamically:

1. Step 1 — Share groups (always present).
2. Step 2..N — One per item not covered by a share group after Step 1.
3. Step "Review" — final read-only summary block showing per-member totals and the proportional tax/service breakdown.

**Sticky footer:**

- Single primary action: `Save splits`.
- Disabled until every item is fully attributed (sum of member share for an item == item amount).
- Footer copy reflects coverage state: `2 items still need a person · Save splits` (disabled), or `Save splits` (enabled).

### 5.2.1 Visual treatment (delegated)

Step state opacity treatment is locked by [spotlight-wizard-primitive.md](./spotlight-wizard-primitive.md) §"Visual model": active 100%, completed 70%, future 30%. This spec does not redefine those values.

### 5.3 Step 1 — Share groups

Per ux-principles §"Bill splitting specifics" and ADR 0004.

**Default state:** every line item starts in a single share set "all members" containing every `trip_member` of the expense's trip. The user sees one share group with N members and all items.

**Affordances:**

- `Add a share group` — opens a member multi-select. After confirmation, prompts the user to drag/select items into the new group. The new group is given a default auto-name (`{Member1} + {Member2}`) but can be renamed.
- Tap an existing share group → expand to show its members + items + edit affordances.
- Items in multiple groups are not allowed in M2 (an item belongs to exactly one share set or to "individual"; no fractional cross-group splitting in M2). If users want a cross-group split, they pull the item out via "Make individual" and use a per-person panel.
- `Make individual` per item → moves that item out of all share groups; it appears in Step 2..N as its own per-person panel.

**Share-set auto-save (per ADR 0004):**

- When the user finalizes a share group whose member set matches an existing `share_set` (by membership identity within this trip), reuse it.
- When the membership combination is new for this trip, auto-create a `share_set` row on save with `name = auto-generated` and `created_from_expense_id = this expense`.
- Suggestions sorted by `last_used_at` are surfaced in the multi-select.

**Auto-advance signal:** Step 1 is considered "complete" when every line item belongs either to a share group or has been explicitly marked individual (which generates a Step 2..N panel). The wizard advances to the first incomplete per-person panel.

### 5.4 Steps 2..N — Per-person panels

One per individual item.

**Layout per panel:**

- Header: item name + item amount (pre-tax subtotal contribution).
- Body: list of trip members, each with a share input.
- Default share-rule is `equal_among_selected`. Tapping a member toggles them in/out; remaining members split equally.
- Override affordance: `Custom amounts` — switches the panel to `share_rule = 'explicit_amount'`. Each row gains a numeric input; UI enforces sum == item amount before the panel is considered complete.

**Completion rule:** panel is complete when sum of selected member shares equals item amount. Auto-advance fires on completion.

**No tax/service controls appear in per-person panels.** This is a hard rule from ux-principles §"Bill splitting specifics" and ADR 0006.

### 5.5 Tax & service distribution

Per ux-principles: **tax and service charge distribute proportionally based on each person's pre-tax subtotal share. Never manual.**

- Compute `member_subtotal[m] = sum of m's slice of every item.amount`.
- For each non-item charge `c ∈ {service_charge, tip, tax_amount}`, distribute as `member_charge[m] = round_minor_units(c × member_subtotal[m] / total_subtotal)`.
- Resolve rounding residual (`Σ member_charge != c`) by giving the residual cent(s) to the largest-share member, deterministically and visibly.
- These computed charges are stored as part of `expense_item_splits.share_amount` per ADR alignment — every member's stored share already includes their proportional service/tax for that item slice.

The Review step shows the per-member breakdown — pre-tax + their proportional service/tax = their owed amount — purely for transparency, not as a control.

### 5.6 Currency override placement

Per ux-principles: **the currency override appears at the top of the expense screen, not at the end.** This means C5 edit, not C7 split. The splitting flow has **no currency control**. If a user needs to change currency, they back out to C5 edit (which already lives at the top of that screen).

This is called out explicitly because the Review step shows amounts and someone might be tempted to add a currency selector there. Don't.

### 5.7 State matrix

| State                 | Treatment                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| default               | wizard renders with Step 1 active; subsequent steps in `future` opacity                                                           |
| loading (initial)     | full-screen skeleton showing Step 1 outline + footer; never a blank canvas                                                        |
| loading (saving)      | sticky footer button shows spinner; non-active steps lock to `completed` opacity; back button still works (cancel save)           |
| empty (no items)      | wizard short-circuits to Review step; banner "Nothing to split — this expense has no line items" + `Edit expense` deep-link to C5 |
| error (load failed)   | top inline `Banner error` "Couldn't load this expense" + Retry; rest of screen is skeleton                                        |
| error (save rejected) | rollback footer; `Banner error` "Couldn't save splits — try again" inline above sticky footer; user state preserved               |
| offline (load)        | last-known expense data available via cached query; banner info "You're offline — splits will save when you're back online"       |
| offline (save)        | queue write client-side per ux-principles "Optimistic updates"; show optimistic Review state and reconcile on reconnect           |

### 5.8 Spotlight wizard interaction model

Behavioral contract for the splitting flow specifically. The visual + state machine itself is owned by [spotlight-wizard-primitive.md](./spotlight-wizard-primitive.md); this section documents how M2 uses it.

- `currentStepId` is explicit state (not derived from focus).
- Active step: 100% opacity, accent border, slight `scale(1.02)`, full interactivity.
- Completed steps: 70% opacity, no border. Tap to revisit → that step becomes active. Subsequent steps with intact data remain `completed`; subsequent steps that depended on the changed data are recomputed.
- Future steps: 30% opacity, non-interactive. Cannot be focused, cannot be tab-targets.
- Auto-advance: when a step's completion signal is unambiguous (Step 1 fully covered, panel sum == item amount, etc.) advance to the next future step automatically. Don't render explicit "Next" buttons.
- Mobile collapse (<600px): non-active steps collapse to a one-line summary; tap expands and makes that step active. Owned by the primitive; this spec just inherits it.
- Tapping a completed share group does not destroy downstream per-person panels unless the user changes membership in a way that makes a panel unreachable.

## 6. Data model

No schema changes are required for M2 if the open §0 questions don't surface one. The following existing tables already support the flow:

- `share_sets`, `share_set_members` — per [docs/data-model.md](../data-model.md). Auto-created on Step 1 save. `last_used_at` updated on every reuse.
- `expense_items` — already populated by AI extraction in M1.
- `expense_item_splits` — one row per `(item, member)` slice. `share_rule` enum `'equal_via_share_set' | 'explicit_amount' | 'percentage'`. `share_amount` includes proportional service/tax per §5.5.

**Write set per save:**

- INSERT/UPDATE `share_sets` (when a new combination is auto-saved).
- INSERT `share_set_members` rows for new share sets.
- DELETE existing `expense_item_splits` for this expense, then INSERT new ones (or upsert by `(expense_item_id, trip_member_id)`).
- UPDATE `share_sets.last_used_at` for reused share sets.
- INSERT `audit_log` row with `action = 'split.update'`, `target_type = 'expense'`, `target_id = expense.id`, and a diff that captures the per-item membership change.

**Open question for §0:** if Zephan wants re-split-on-edit auto-reconciliation, we may need `expense_item_splits.recomputed_at` or a `dirty` flag. Not added in this draft.

## 7. Server orchestration

M2 needs one transactional RPC. Splitting touches multiple tables and must be atomic so the trip never sees a half-split state.

### 7.1 RPC: `save_expense_splits`

```ts
// server-only; called from app/api/splits+api.ts
input: {
  expense_id: uuid;
  share_groups: Array<{
    share_set_id: uuid | null; // null = create new
    member_ids: uuid[];        // for new share sets
    item_ids: uuid[];          // items belonging to this group
  }>;
  individual_panels: Array<{
    item_id: uuid;
    rule: 'equal_among_selected' | 'explicit_amount';
    members: Array<{ member_id: uuid; amount: bigint }>;
  }>;
};

output: {
  expense_id: uuid;
  splits: ExpenseItemSplit[]; // for client to swap into local state
  share_set_ids_created: uuid[];
};
```

Server responsibilities:

- Validate every item is fully attributed; reject otherwise (client should already prevent this, but server is the source of truth).
- Resolve or auto-create share sets per ADR 0004.
- Distribute `service_charge`, `tip`, `tax_amount` proportionally per §5.5.
- Replace existing `expense_item_splits` for the expense atomically.
- Emit `audit_log` entry.
- Run within a single transaction; return the created split rows.

### 7.2 Read endpoint

Existing trip-detail / expense-detail queries already return `expense_items`. M2 adds an attached `expense_item_splits` join so C7 can render past splits when revisiting an already-split expense (per the §0 re-split decision, this may be read-only or editable).

### 7.3 Idempotency

`save_expense_splits` is idempotent: calling it twice with the same payload yields the same DB state. The server reconciles by `(expense_id, expense_item_id, trip_member_id)`. Client may safely retry on transient failure.

## 8. Client state model

### 8.1 Reducer shape

```ts
type SplitDraft = {
  expenseId: string;
  expenseItems: ExpenseItem[]; // immutable from C5 save
  members: TripMember[]; // trip's current member list
  shareSets: ShareSetSuggestion[]; // sorted by last_used_at desc
  shareGroups: ShareGroupDraft[]; // Step 1 working state
  individualItemIds: string[]; // items pulled out of share groups
  panels: PerPersonPanelDraft[]; // Step 2..N working state
  currentStepId: string;
  saving: boolean;
  saveError: { code: string; message: string } | null;
};

type ShareGroupDraft = {
  id: string; // local uuid
  shareSetId: string | null; // populated when matched to an existing set
  memberIds: string[];
  itemIds: string[];
  name: string; // auto-generated, user-renameable
};

type PerPersonPanelDraft = {
  itemId: string;
  rule: 'equal_among_selected' | 'explicit_amount';
  selections: Array<{ memberId: string; amount: bigint | null }>;
  complete: boolean;
};
```

### 8.2 Derived selectors

- `coverage(state)` → `{ covered: itemId[], remaining: itemId[] }`.
- `memberSubtotals(state)` → `Map<memberId, bigint>`.
- `proportionalCharges(state, expense)` → `Map<memberId, bigint>` derived from `memberSubtotals` and the expense's `service_charge`, `tip`, `tax_amount`.
- `wizardSteps(state)` → ordered `WizardStep[]` with `status` for the spotlight primitive.

These are pure functions of state. No selector duplicates a write path.

### 8.3 Persistence

M2 splitting is **session-only** in the client. Unlike Quick capture, there is no device-local draft store for in-progress splits in M2. If the user backs out of C7, the working state is discarded. Rationale: the underlying expense is already saved; re-entering C7 starts from the persisted (or empty) split state on the server. Revisit if Zephan wants drafted-splits resilience.

### 8.4 Lifecycle

| Event                                   | Behavior                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Wizard mounted on already-split expense | Hydrate `shareGroups` and `panels` from server `expense_item_splits`; current step = Review                                               |
| User taps a completed step              | Set as active, recompute downstream completion based on current data                                                                      |
| User taps Cancel                        | Confirm sheet only if there are unsaved local changes; otherwise immediate exit                                                           |
| User taps Save splits                   | Optimistic toast + nav to C6 with new split summary; server reject → rollback to C7 with error banner                                     |
| Trip member added/removed mid-flight    | Banner info "Trip members changed — review your share groups"; existing `shareGroups` annotated; user must re-confirm before Save enables |

## 9. Acceptance criteria

- A 4-person, 25-item dinner with all items shared completes in **≤ 4 taps from C6**: tap `Split` → wizard auto-fills "all members" share group → auto-advances to Review → `Save splits`.
- Tax and service charge are never user-assignable. No control surfaces them.
- Pulling an item out of a share group via `Make individual` generates exactly one new per-person panel; auto-advance lands on it.
- A new share-set membership combination is auto-saved. The next expense's Step 1 surfaces it sorted by `last_used_at`.
- `expense_item_splits` after save satisfies the math invariant: per item, sum of member shares == item amount; across all items + proportional charges, sum of member totals == expense `original_amount` ± rounding residual.
- The wizard is fully usable at 375×667 without horizontal scroll. Non-active steps collapse to one-line summaries.
- Tapping a completed step makes it active; downstream steps with intact data stay completed; future steps stay non-interactive.
- Currency cannot be changed inside the splitting wizard. The user must back out to C5 edit. (No control exists in C7.)
- Empty trip (only owner as member) — see §0; spec defers behavior pending Zephan direction.
- Offline: user can complete splitting; save queues and reconciles on reconnect.
- Audit log records a `split.update` row with the right actor attribution per ADR 0008.
- Spotlight wizard primitive from [spotlight-wizard-primitive.md](./spotlight-wizard-primitive.md) drives all step state — M2 does not reimplement opacity logic.

## 10. Touchpoints — files to update / create

**Doc updates (after this spec is accepted):**

- `CLAUDE.md` — add M2 splitting to in-scope; flip "splitting wizard" out of "out of scope for milestone 1" framing.
- `docs/design-system.md` — add §C7 (Split expense) with state matrix; reference spotlight-wizard primitive doc.
- `docs/ux-principles.md` — no changes required; the spotlight pattern section is already load-bearing for this work.
- `docs/data-model.md` — no schema delta unless §0 forces one. Mention the M2 write paths.
- `docs/decisions/0011-m2-splitting.md` — new ADR capturing the entry-point decision, re-split-on-edit decision, and any other §0 outcomes.

**Code:**

- `lib/ux/spotlight-wizard.tsx` — primitive (see [spotlight-wizard-primitive.md](./spotlight-wizard-primitive.md))
- `components/ui/wizard-step.tsx` — primitive sub-component (see same)
- `lib/splitting/state.ts` — reducer + types (`SplitDraft`, `ShareGroupDraft`, `PerPersonPanelDraft`, actions)
- `lib/splitting/distribute.ts` — proportional service/tip/tax math + rounding-residual rule
- `lib/splitting/share-sets.ts` — membership-equality + auto-save logic
- `lib/splitting/__tests__/` — vitest suites for reducer, distribute, share-set match
- `app/api/splits+api.ts` — server route hosting `save_expense_splits` RPC call
- `supabase/migrations/{timestamp}_save_expense_splits.sql` — Postgres function definition (transactional)
- `app/(tabs)/expenses/[id]/split.tsx` — C7 screen
- `components/splitting/share-group-step.tsx` — Step 1 block
- `components/splitting/per-person-panel.tsx` — Step 2..N block
- `components/splitting/review-step.tsx` — final summary block
- `components/splitting/share-set-suggestions.tsx` — Step 1 multi-select with `last_used_at` ordering

## 11. Roles

- **Zephan** — review spec, resolve §0 confirmations, gate Codex hand-off, run `/codex` and `/ux-audit`.
- **Claude** — finalize this spec post-§0; build the spotlight-wizard primitive (state machine, a11y, mobile collapse); implement reducer + distribution math + `save_expense_splits` RPC + DB migration; scaffold C7 screen and step components against the design system but visual-final pass goes to Codex.
- **Codex** — visual implementation of C7 and the spotlight-wizard primitive against the editorial design system; review wizard step transitions, opacity timing, density, and spacing; final art direction on the Review step.

## 12. Sequencing for implementation

Each step independently shippable. Suggested order:

1. **Spec lock** — Zephan resolves §0 confirmations; this draft is updated; Codex reviews.
2. **Spotlight wizard primitive** — `lib/ux/spotlight-wizard.tsx` + tests. Owned by Claude per [spotlight-wizard-primitive.md](./spotlight-wizard-primitive.md).
3. **Distribution math + share-set logic** — `lib/splitting/distribute.ts`, `lib/splitting/share-sets.ts`, with vitest suites. Tested in isolation against worked examples.
4. **Reducer + selectors** — `lib/splitting/state.ts` and selectors used by C7. Tested in isolation.
5. **Server RPC + migration** — `save_expense_splits` Postgres function + `app/api/splits+api.ts`. Server tests.
6. **C7 scaffold** — Claude scaffolds the screen + step components wired to the reducer. Mockup-quality visuals, behavior-correct.
7. **Codex visual implementation** — re-skin against the editorial design system; opacity timing, density, art direction.
8. **End-to-end pass** — Playwright self-verify across states (default / loading / empty / error / offline) at 375×667 and ≥1024; user testing on a real multi-item bill.

Each step has acceptance criteria from §9 it must satisfy.
