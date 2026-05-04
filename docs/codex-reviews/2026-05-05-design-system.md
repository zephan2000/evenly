**Findings**

1. **Severity:** blocker  
   **Section:** 3. Color  
   **Problem:** The primary violet is not safe for core interactive UI. `#A171F5` on white is `3.39:1`, and the pressed violet `#8B5CF6` is `4.23:1`. That misses WCAG AA for normal-sized button text, links, segmented controls, and focusable text actions. If this lands as the main CTA color, the system fails the accessibility floor immediately.  
   **Fix:** Split brand into `brand-accent` and `brand-interactive`. Keep `#A171F5` for washes only. Set:
   - `brand-interactive: #7C3AED`
   - `brand-interactive-pressed: #6D28D9`
   - `brand-focus-ring: #C4B5FD`
   - `brand-wash-bg: #F4EEFE`
     Use white text only on `#7C3AED` or darker.

2. **Severity:** blocker  
   **Section:** 4. Typography  
   **Problem:** `micro` at `11/600` violates your own accessibility floor. `docs/ux-principles.md` says minimum `12pt` for captions and `14pt` for body. Chips and tags at 11 will be illegible on 375-wide devices, especially with Dynamic Type enabled.  
   **Fix:** Delete `micro`. Replace with:
   - `chip: 12 / 600 / line-height 16`
   - `caption: 13 / 400 / line-height 18`
     Also set a rule: no text token below `12pt`.

3. **Severity:** major  
   **Section:** 6. Liquid Glass / 3. Color  
   **Problem:** White glyphs inside category icon containers fail contrast on most of the proposed category colors. Measured against the icon hues, white only clears none of the safe body-text thresholds, and groceries is especially bad at `1.80:1`. The current “gradient square + white glyph” is decorative but not readable.  
   **Fix:** Remove white glyphs from category containers. Use flat tint containers with dark glyphs:
   - Container backgrounds: keep current tints
   - Glyph color: `#1A1625` by default
   - Optional per-category dark glyphs: Meals `#C24E00`, Transport `#0059B8`, Lodging `#1E7A43`, Entertainment `#A62A78`, Groceries `#A35A00`, Shopping `#5C616B`
     Keep category meaning as `icon + text label`, never color alone.

4. **Severity:** major  
   **Section:** 3. Color  
   **Problem:** Reusing category hues as semantic colors is a system mistake. Lodging green doubling as success, groceries amber doubling as warning, and transport blue doubling as info collapses content taxonomy and system status into the same signal. That weakens color independence and makes banners/chips semantically muddy.  
   **Fix:** Separate semantic tokens from category tokens:
   - `info-fg: #155EEF`, `info-bg: #EAF2FF`
   - `success-fg: #067647`, `success-bg: #ECFDF3`
   - `warning-fg: #B54708`, `warning-bg: #FFFAEB`
   - `error-fg: #B42318`, `error-bg: #FEF3F2`
     Category colors should never be reused for system feedback.

5. **Severity:** major  
   **Section:** 3. Color / 2. The Stripe register split  
   **Problem:** The “leading-color stripe on home recent-list” is a color-discipline leak. You already have category icons/chips. Adding a second per-row accent turns the working register into a candy-striped list and pushes the system toward YouTrip-loud.  
   **Fix:** Delete the leading-color stripe entirely. In working surfaces, each row gets exactly one category cue:
   - Either a `28–32pt` category icon tile
   - Or a small labeled chip
     Not both.

6. **Severity:** major  
   **Section:** 4. Typography  
   **Problem:** Geist Mono is overscoped. `amount-inline` at `15` in list rows will create visual chatter, widen amounts unnecessarily, and make dense mobile lists feel mechanical instead of calm. Mono earns its place in hero totals; it does not earn it in every row.  
   **Fix:** Restrict Mono to hero/saved totals only:
   - Keep `display-xl` in Geist Mono
   - Change row amounts to `Geist Sans 15/600`
   - If tabular numerals are needed, use `fontVariant: ['tabular-nums']` with Geist Sans
   - Keep totals tables at `15/600` sans as well

7. **Severity:** major  
   **Section:** 4. Typography  
   **Problem:** The type system is incomplete. There are no line-height tokens, no Dynamic Type behavior, and no keyboard/focus styling for web. That directly misses the accessibility floor in `docs/ux-principles.md`.  
   **Fix:** Add explicit typography behavior:
   - `display-xl 40/44`
   - `display 28/34`
   - `title 22/28`
   - `subtitle 17/24`
   - `body 15/22`
   - `caption 13/18`
   - `chip 12/16`
     Require system font scaling up to at least `120%`. Add web focus treatment: `2px solid #7C3AED` with `2px` offset on all interactive elements.

8. **Severity:** major  
   **Section:** 6. Liquid Glass  
   **Problem:** The glass scope is still too loose for the claimed discipline. Hero mesh, sticky save blur, category icon gradients with inner highlights, and a future floating tab bar means the system already has three optical effects families before it ships. That is not Stripe-disciplined; it is feature-collecting.  
   **Fix:** Cut M1 glass down to two places only:
   - Hero amount block
   - Sticky save bar
     Make category icons flat tint squares with no gradient, no inner highlight, no shadow. Remove the post-M1 tab bar treatment from this doc entirely.

9. **Severity:** major  
   **Section:** 8. Screens / 9. Interaction patterns  
   **Problem:** State coverage is asserted, not specified. The hard requirement is “every screen must have empty/loading/error/offline,” but the proposal does not actually define them for C1, C3, C4, C5, or C6. Right now this is not a state-complete system.  
   **Fix:** Add a per-screen state matrix. Minimum required definitions:
   - `C1 sign-in`: loading session restore, auth error, offline sign-in-disabled state
   - `C3 trip-create`: empty first-trip helper, submit-loading, create-failure, offline-disabled create
   - `C4 scan`: picker default, processing loading, extraction error, offline blocked
   - `C5 edit`: prefilled default, manual-entry empty, low-confidence warning, save error, offline read-only or queued-save rule
   - `C6 saved-detail`: normal default, deleted/tombstone empty, loading after optimistic save, rollback error, offline cached snapshot

10. **Severity:** major  
    **Section:** 8. Screens / `docs/ai-prompts.md` / `docs/ux-principles.md`  
    **Problem:** The edit flow ignores two required AI states: low-confidence extraction and extraction failure fallback. The rubric requires a yellow verification banner for `confidence.overall < 0.7`, and the prompt doc requires a manual-entry fallback with a specific user-facing message. Those states are not in the design system.  
    **Fix:** Add explicit C4/C5 rules:
    - On extraction failure: show `Couldn't read this receipt. Please enter manually.` with CTA `Enter manually`
    - On low confidence: show warning banner below nav, above form
    - Manual mode defaults: `date=today`, `currency=trip default`, all editable fields blank or AI-prefilled where present
    - Warning banner colors: `warning-bg #FFFAEB`, `warning-fg #B54708`

11. **Severity:** major  
    **Section:** 8. Screens  
    **Problem:** “Single column, all fields visible” does not survive a real receipt at `375×667`. The extraction shape includes merchant, date, currency, tax mode, tax label, category, items array, subtotal, service, tip, tax, total, notes, confidence warning, and receipt preview. With a sticky save bar and mobile keyboard, this becomes a long, brittle scroll.  
    **Fix:** Keep one screen, but stop insisting on literal all-at-once visibility. Structure C5 into four stacked sections:
    - `Receipt`: thumbnail, merchant, date, currency, category
    - `Items`: first 3 rows visible, then `Show all N items`
    - `Totals`: subtotal, service, tip, tax, total
    - `Notes`
      Set sticky save bar height to `72pt` plus safe-area inset, and reserve at least `96pt` bottom content padding so the last fields never sit under it.

12. **Severity:** minor  
    **Section:** 5. Spacing, radii, elevation  
    **Problem:** You have global spacing tokens but no component rhythm. That means implementation will drift, especially on mobile lists and forms. Paper systems that omit row heights and field gaps always end up inconsistent.  
    **Fix:** Add component-level layout tokens:
    - Screen padding: `16pt` mobile, `24pt` web
    - List row height: `72pt`
    - Form field vertical gap: `12pt`
    - Section gap: `24pt`
    - Chip height: `28pt` or `32pt`
    - Icon/label gap: `12pt`
    - Minimum safe-area bottom inset for sticky bars: `16pt`

13. **Severity:** minor  
    **Section:** 2. The Stripe register split / 3. Color / 6. Liquid Glass  
    **Problem:** “Rich allowed” is too vague. That sentence is where systems drift from disciplined to loud. With violet hero washes, possible pink mesh, category gradients, and blur, the spec gives too much room for visual inflation.  
    **Fix:** Lock the hero register to one formula:
    - Page wash: `linear-gradient(180deg, #FCF8FF 0%, #F4EEFE 58%, #FFFFFF 100%)`
    - Single accent glow behind hero amount: `rgba(122,90,248,0.14)`
    - No pink in M1
    - Saved-detail header must reuse the same hero wash, not invent a second treatment

14. **Severity:** minor  
    **Section:** 9. Interaction patterns  
    **Problem:** “Receipt thumbnails as small chips (~60pt)” is the wrong metaphor. A chip reads like metadata, not a preview artifact. That will hurt scan/edit comprehension on mobile.  
    **Fix:** Change the component from chip to thumbnail tile:
    - `56×56pt`
    - Radius `10`
    - Border `1px #E9E7EE`
    - Optional filename/date caption below in `13/400`
      Keep tap-to-open full preview.

**Bottom line**

The biggest problems are not taste-level. They are structural: inaccessible brand contrast, an invalid `11pt` token, category/semantic color conflation, overscoped mono usage, and incomplete state coverage. Fix those first.

The core direction is salvageable if you make it stricter: darker interactive violet, flatter category treatment, semantic colors separated from taxonomy, Mono reserved for hero totals, and a real per-screen state matrix. That gets you closer to the “Stripe-disciplined middle” you said you want.
