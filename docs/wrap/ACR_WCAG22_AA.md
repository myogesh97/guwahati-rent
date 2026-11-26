# Accessibility Conformance Report (draft): WCAG 2.2 Level AA

VPAT 2.5-style draft. **This is not a conformance claim.** No assistive-technology testing has been done. Rows marked PASS were verified by the method named in Evidence; NEEDS-MANUAL rows say exactly what a person must test.

- **Product:** Guwahati Rent, https://guwahati-rent.netlify.app (`v0.5.0` + branch `wrap/release-audit`)
- **Date:** 26 Nov 2026 · **Evaluator:** Claude (AI), automated + code review
- **Scope:** `/` (map, filters, list view `?view=list`, pin card, rent form, To-Let form, report dialog, stats dialog), `/about.html`, `/privacy.html`, `/terms.html`, `/admin.html`, `/unsubscribe.html`, `/404.html`
- **Also relevant:** EN 301 549 v3.2.1 §9 maps 1:1 to these criteria; ADA Title III has no technical standard, and WCAG 2.x AA is the usual benchmark

**Methods.**
- **Lighthouse 12 accessibility (axe-core):** all 8 routes of the fixed build, initial state; 100 and 0 failed audits each.
- **Lighthouse mobile on the live site:** `/`, `/about`, `/privacy`.
- **Headless-Chrome journey scripts** (`scripts/browser-smoke.mjs`): focus into and out of dialogs, list → card → Esc → focus back.
- **Contrast calculation:** for the changed colours.
- **Source review.**

**Not scanned automatically:** open dialogs, forms mid-entry and error states. axe only sees the initial DOM.

Status key: **PASS** verified · **FAIL** fails · **N/A** not applicable · **NEEDS-MANUAL** needs a human.

## Principle 1: Perceivable

| SC | Level | Status | Evidence | Remediation / manual test |
|---|---|---|---|---|
| 1.1.1 Non-text Content | A | NEEDS-MANUAL | axe `image-alt`, `button-name` pass on all routes; icon buttons have text (`pin-card.ts:257`, SVG `aria-hidden`) | **The map canvas:** confirm with VoiceOver that the list view is announced as the text alternative to the map. **To-Let photos:** the phone number on a board is only in the image (open question in `FINAL_LAUNCH_CHECKLIST.md` §5) |
| 1.2.1–1.2.5 Media | A/AA | N/A | No audio or video | — |
| 1.3.1 Info and Relationships | A | NEEDS-MANUAL | Stats tables have `<caption>`, `scope="col/row"` (`stats.ts:16-24`); `<dl>` for pin details; axe clean | VoiceOver: read the stats tables and the list table; confirm headers are announced. Confirm the form chip groups announce as groups |
| 1.3.2 Meaningful Sequence | A | NEEDS-MANUAL | DOM order matches visual order in source | Linearise with CSS off, or read with a screen reader at 375 px |
| 1.3.3 Sensory Characteristics | A | PASS | Placement copy uses words ("Move the map until the pin is on your home", `main.ts:142`), not shape or position only | — |
| 1.3.4 Orientation | AA | NEEDS-MANUAL | No orientation lock in CSS or manifest | Rotate a phone on `/` with a dialog open |
| 1.3.5 Identify Input Purpose | AA | N/A | No fields collect the user's own personal data (name, email, address) | — |
| 1.4.1 Use of Color | A | NEEDS-MANUAL | Gated vs not-gated pins differ in colour (teal/white); the card states "Gated society" in text | Check the map legend and selected-pin state also differ by more than colour |
| 1.4.2 Audio Control | A | N/A | No audio | — |
| 1.4.3 Contrast (Minimum) | AA | PASS (initial states) | Was **FAIL**: WhatsApp button white on `#128c4b` = 4.3:1. Fixed in `3683d23` (`#0f7a41` = 5.41:1). Lighthouse color-contrast passes on all 8 routes | Check dialog and error states with a contrast picker (not covered by axe) |
| 1.4.4 Resize Text | AA | NEEDS-MANUAL | rem-based type | Browser zoom 200% on `/` and every dialog: nothing cut off, all controls reachable |
| 1.4.5 Images of Text | AA | PASS | No images of text (logo is SVG text; source review) | — |
| 1.4.10 Reflow | AA | NEEDS-MANUAL | Browser suite runs at 375 px with no horizontal scroll check failing; 320 px not in the suite | 320 px wide (or 1280 px at 400%): every dialog and the list table usable without 2-D scrolling (the stats table has a scroll wrapper, which is allowed for data tables) |
| 1.4.11 Non-text Contrast | AA | NEEDS-MANUAL | Focus ring defined globally (`main.css:136`) | Measure focus ring, input borders, chip borders and map pin outlines against their backgrounds (≥3:1) |
| 1.4.12 Text Spacing | AA | NEEDS-MANUAL | — | Apply the text-spacing bookmarklet on `/`, a dialog, `/about`: no clipped text |
| 1.4.13 Content on Hover or Focus | AA | NEEDS-MANUAL | Map hover changes the cursor only (`map.ts:180`) | Check any tooltip or popover is dismissible (Esc) and hoverable |

## Principle 2: Operable

| SC | Level | Status | Evidence | Remediation / manual test |
|---|---|---|---|---|
| 2.1.1 Keyboard | A | NEEDS-MANUAL | Map pans with arrow keys (placement hint, `index.html:238`); list view is the keyboard route to pins; scripted list → card → Esc passes | Full keyboard-only run: add a rent (incl. placement, chips, date picker, Turnstile, consent), filter, open stats, report a pin, spot a To-Let, admin approve/reject |
| 2.1.2 No Keyboard Trap | A | NEEDS-MANUAL | Native `<dialog>`; Esc closes (scripted) | Tab through the flatpickr calendar and the Turnstile iframe; confirm exit |
| 2.1.4 Character Key Shortcuts | A | PASS | No single-key shortcuts registered (source review: only map-native arrow and +/− keys while the map has focus) | — |
| 2.2.1 Timing Adjustable | A | PASS | Toasts are status only; errors stay. The 30-min upload window is a server security limit (exception) | — |
| 2.2.2 Pause, Stop, Hide | A | PASS | Only a 0.16 s dialog animation, off under `prefers-reduced-motion` (`main.css:1075`) | — |
| 2.3.1 Three Flashes | A | PASS | No flashing content | — |
| 2.4.1 Bypass Blocks | A | PASS | Skip link on `/` (`index.html:47`); static pages have a one-link header and `<main>` landmark | — |
| 2.4.2 Page Titled | A | PASS | Unique `<title>` on every page; axe `document-title` passes | — |
| 2.4.3 Focus Order | A | NEEDS-MANUAL | Focus moves into dialogs and back to the trigger (scripted, 45/45 cards) | Check order inside the rent form and after an error |
| 2.4.4 Link Purpose (In Context) | A | PASS | axe `link-name` passes; links have descriptive text | — |
| 2.4.5 Multiple Ways | AA | PASS | Footer nav on every page plus sitemap | — |
| 2.4.6 Headings and Labels | AA | PASS | axe `heading-order`, `label` pass; dialogs titled | — |
| 2.4.7 Focus Visible | AA | PASS | Global `:focus-visible` ring incl. forced-colours (`main.css:136-150`) | Spot-check on the map canvas |
| **2.4.11 Focus Not Obscured (Min)** | AA | NEEDS-MANUAL | Fixed header and bottom bar on phones could cover focused controls | Tab through `/` at 375×812 and 768×1024; no focused element fully hidden behind the header, bottom sheet or toast |
| 2.5.1 Pointer Gestures | A | PASS | Pinch-zoom has +/− buttons (MapLibre NavigationControl) and keyboard; placement works with a single tap (`main.ts:426`) | — |
| 2.5.2 Pointer Cancellation | A | PASS | Native buttons (activate on up-event) | — |
| 2.5.3 Label in Name | A | PASS | Visible text is the accessible name for buttons (source review, axe) | — |
| 2.5.4 Motion Actuation | A | N/A | No motion input | — |
| **2.5.7 Dragging Movements** | AA | PASS | Placing a pin needs no drag: a tap or click on the map picks the spot (`map.ts:139-142`, `main.ts:426`); +/− buttons zoom | — |
| **2.5.8 Target Size (Minimum)** | AA | NEEDS-MANUAL | Controls 40 px mouse / 44 px touch (design notes at the top of `main.css`); some small icons (18–20 px, `main.css:238,367`) | Measure the dialog close buttons, filter chips, map +/− and pin markers at 375 px. Map pins are exempt only if the list view offers the same function (it does) |

## Principle 3: Understandable

| SC | Level | Status | Evidence | Remediation / manual test |
|---|---|---|---|---|
| 3.1.1 Language of Page | A | PASS | `<html lang="en">` on all 7 pages | — |
| 3.1.2 Language of Parts | AA | PASS | No other-language passages (locality names are proper nouns) | — |
| 3.2.1 On Focus | A | PASS | No context change on focus (source review) | — |
| 3.2.2 On Input | A | PASS | Filters update results in place; URL sync doesn't navigate | — |
| 3.2.3 Consistent Navigation | AA | PASS | Same footer nav on all static pages | — |
| 3.2.4 Consistent Identification | AA | PASS | Same labels for the same functions | — |
| **3.2.6 Consistent Help** | A | NEEDS-MANUAL | Help is the About FAQ link, in the same place on each page. A contact method is **missing** (privacy page) | Once a contact is added (PW-01), put it in the same footer position on every page |
| 3.3.1 Error Identification | A | NEEDS-MANUAL | Server returns `fields` and the form highlights them (`edit-pin`, `submit-pin`) | Submit with errors using a screen reader; the error text must be announced and tied to the field |
| 3.3.2 Labels or Instructions | A | PASS | axe `label` passes; instructions in the placement banner | — |
| 3.3.3 Error Suggestion | AA | NEEDS-MANUAL | Messages say what to fix ("Check the highlighted fields") | Confirm each field error says how to fix it, not just that it's wrong |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | PASS | Rent double-check prompt (`double-check.ts`); pins can be edited or deleted afterwards | — |
| **3.3.7 Redundant Entry** | A | PASS | Edit form is pre-filled with the pin's previous answers (`edit-pin` `load`) | — |
| **3.3.8 Accessible Authentication (Min)** | AA | PASS | Admin login is an emailed magic link: no password or cognitive test. Turnstile is non-interactive in most cases | If Turnstile shows an interactive challenge, confirm it has an accessible alternative |

## Principle 4: Robust

| SC | Level | Status | Evidence | Remediation / manual test |
|---|---|---|---|---|
| 4.1.2 Name, Role, Value | A | NEEDS-MANUAL | axe `aria-*`, `button-name` pass; chips are buttons with pressed state (source) | VoiceOver/TalkBack: chips announce selected state; filter toggles announce state; the list table's sort buttons announce sort direction |
| 4.1.3 Status Messages | AA | NEEDS-MANUAL | 11 live regions / `role=status|alert` in `index.html`; toasts announced (FINAL_LAUNCH_CHECKLIST §5) | Confirm "N rents shown" after filtering, the submit result and upload progress are announced without moving focus |

## Summary

| | Count |
|---|---|
| PASS | 27 |
| FAIL (open) | 0 (1 fixed: 1.4.3) |
| NEEDS-MANUAL | 20 |
| N/A | 4 rows (1.2.1–1.2.5 as one row, 1.3.5, 1.4.2, 2.5.4) |

**Conformance cannot be claimed** until the NEEDS-MANUAL rows are tested. The manual script, about 3 hours with VoiceOver (iOS Safari) and TalkBack (Android Chrome), is in [HUMAN_REQUIRED.md](HUMAN_REQUIRED.md) step 9.
