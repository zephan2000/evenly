# UX principles

The rubric for `/ux-audit`. Every UI change is checked against this. When something here proves wrong in practice, update it — don't just ignore it.

## North-star principles

1. **Tap budget.** Hero path (scan receipt → save expense) ≤ 6 taps. If a flow grows past 6, redesign.
2. **AI does the boring work.** Never ask the user to re-type something the AI already extracted. Always show AI output as editable, never as a confirmation dialog.
3. **Mobile-first.** Designs are validated at 375×667 first. Tablet/web is a layout adjustment, not a rethink.
4. **Progressive disclosure over many screens.** Use the spotlight pattern (below) instead of multi-screen wizards when steps are sequential within one task.
5. **Defaults beat decisions.** Every choice the user has to make is friction. Pick a sensible default; let them override.

## Hard requirements

Every UI screen must have answers for:

- **Empty state** — what does this screen look like with zero data?
- **Loading state** — skeleton (preferred) or spinner. Never a blank screen.
- **Error state** — what if the network is down, the AI fails, the API rate-limits?
- **Offline state** — does this work offline? If yes, how? If no, how is the user told?
- **Tap targets** — minimum 44×44pt on iOS, 48dp on Android. Never closer than 8pt apart.
- **Screen reader labels** — every interactive element has an `accessibilityLabel`.
- **Color independence** — no information conveyed by color alone (icon + color, never color alone).
- **Optimistic updates** — mutations show success immediately, reconcile if server rejects.

## The spotlight wizard pattern

Used for the bill-splitting flow. **One screen, multiple sequential steps stacked vertically, with opacity gradient indicating progress.**

### Visual treatment

| Step state | Opacity | Border                       | Interactive?                         |
| ---------- | ------- | ---------------------------- | ------------------------------------ |
| Active     | 100%    | accent border, slight shadow | yes                                  |
| Completed  | 70%     | none                         | yes (tap to revisit, becomes active) |
| Future     | 30%     | none                         | no                                   |

Transition: 200ms ease-out on `opacity` and `transform: scale(1.02)` for the active step.

### Step model

`currentStepId` is a state value, not derived from "last interactive element." Steps update it on focus or explicit advance:

```ts
type WizardStep = {
  id: string;
  status: 'future' | 'active' | 'completed';
};
```

When the user taps a completed step, it becomes active and subsequent steps revert to future or completed based on their own data.

### Mobile collapse

On <600px viewports, non-active steps collapse to a one-line summary. Tapping the summary expands and makes that step active.

### Auto-advance

When a step is completed (e.g., user taps "Done" or all required fields are filled), advance to the next future step automatically. Don't require an explicit "Next" button if the completion signal is unambiguous.

## Bill splitting specifics

- **Step 1 — Share groups:** user identifies groups of items that split equally (e.g., "everyone shared starters", "Z+A shared wine"). Defaults: every item starts in "all members" share group.
- **Step 2..N — Per-person panels:** for items NOT covered by a share group, assign per person. AI suggests defaults from history.
- Tax & service charge are NEVER assigned manually; they distribute proportionally based on each person's pre-tax subtotal share.
- Currency override appears at the top of the expense screen, not at the end.

## AI output handling

- AI extractions appear in editable form fields, prefilled. User can edit any field freely.
- Low-confidence (`confidence.overall < 0.7`) extractions show a yellow warning banner: "Please verify these values."
- Extraction failures fall back to manual entry with a single message: "Couldn't read this receipt. Please enter manually." Never blame the user.
- Never show raw error messages from the AI provider. Translate to user-friendly language.

## Forbidden patterns

- ❌ Multi-screen sequential wizards for a single task (use spotlight instead).
- ❌ Confirmation dialogs for AI output ("Is this right? Yes / No").
- ❌ "Are you sure?" modals for reversible actions. Use undo toasts.
- ❌ Spinners on top of empty screens. Use skeletons.
- ❌ Tooltips for primary information (especially on mobile — they don't exist).
- ❌ Date pickers requiring manual scroll for "today." Always default to today and offer one-tap "yesterday."
- ❌ Currency dropdowns sorted alphabetically. Sort by frequency-of-use within the trip, then alphabetic.

## Accessibility floor

- Color contrast: WCAG AA minimum (4.5:1 normal, 3:1 large).
- Font size: minimum 14pt for body, 12pt for captions.
- Dynamic Type: respect iOS/Android system font scaling.
- Keyboard navigation works on web build (focus rings visible, tab order logical).

## Performance guidelines

- First meaningful paint ≤ 2s on a 3G connection.
- Receipt extraction round-trip ≤ 6s. Show skeleton from tap until extraction returns.
- List screens use FlatList with `keyExtractor` and stable IDs.
- Images use `expo-image` with `contentFit="cover"` and explicit dimensions.

## What to do when in doubt

1. Check this document.
2. Check Splitwise / Tricount for the closest analog flow.
3. Pick the option with fewer taps.
4. If still unsure, leave a `// UX: [open question]` comment and surface in PR.
