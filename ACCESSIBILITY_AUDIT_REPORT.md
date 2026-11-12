# Guwahati Rent: Accessibility Audit Report (WCAG 2.2 AA)

**Date:** 12 Nov 2026 · **Baseline:** `c78d677` (live `v0.4.0`) · **Target:** WCAG 2.2 Level AA
**Companion files:** [SEO_A11Y_TEST_RESULTS.md](SEO_A11Y_TEST_RESULTS.md) (commands, environment, raw results) · [WEBSITE_LAUNCH_GAP_ANALYSIS.md](WEBSITE_LAUNCH_GAP_ANALYSIS.md)

## Assessment: **NEEDS WORK**: not claimable as WCAG 2.2 AA conformant yet

- **Most of the work is already done well:** native dialogs with focus management, a real accessible table as the map alternative, labelled forms with inline errors, 44 px touch targets, reduced-motion support, and documented colour contrast. axe-core finds **0 violations** in 18 scans (6 static pages, 12 states of the map app) after the fixes below. Lighthouse Accessibility scores 100 on live.
- **I found and fixed 5 real failures** (none deployed yet):
  1. To-Let boards could only be opened by clicking the map (keyboard users couldn't reach them).
  2. Toast messages ("Link copied", "Your pin was deleted", errors) often weren't announced.
  3. The focus ring vanished in Windows High Contrast / forced-colours mode.
  4. The skip link pointed at an empty target on desktop.
  5. Placement mode gave screen-reader and keyboard users no instructions.
- **Why it isn't claimable:**
  - **No screen-reader testing was done** (VoiceOver, TalkBack and NVDA were not available in this session).
  - The To-Let board's phone number exists only inside a photo (1.1.1 PARTIAL, a deliberate privacy trade-off you need to decide on).
  - Filter result counts aren't announced (4.1.3 PARTIAL).
  - The fixes aren't deployed.
- **No compliance percentage is given.** Automated tools catch only part of WCAG; the statuses below combine automated, scripted-keyboard and code review evidence. Each one says which.

**Evidence key:** **A** = axe-core 4.10.3 · **K** = scripted keyboard test (trusted CDP key events in headless Chrome) · **V** = viewport/reflow measurement · **C** = code/CSS review · **T** = Chrome accessibility tree via CDP · **H** = needs a human (not done)

---

## 1. Per-criterion status (WCAG 2.2, Levels A and AA)

Statuses are **after** the fixes in this change. "Was" notes where they differ from the live site.

### Perceivable

| SC | Name | Status | Evidence / notes |
|---|---|---|---|
| 1.1.1 | Non-text Content (A) | **PARTIAL** | Icons `aria-hidden`; icon buttons labelled; map canvas named; preview canvas `role=img` + label (A, C). **Gap:** a To-Let board's phone number exists only in the photo (`alt="Photo of a To-Let board"`). That is deliberate (the site never transcribes numbers, for privacy), but a blind user can't get the number. Your decision (gap P1-10). |
| 1.2.1–1.2.5 | Time-based media | **N/A** | No audio or video. |
| 1.3.1 | Info and Relationships (A) | **PASS** | Landmarks, headings, `<table>` with caption/`scope`/`aria-sort`, `fieldset`/`legend` for every radio/checkbox group, `dl` for pin details (A, C). Minor: redundant `role="radiogroup"` divs inside fieldsets (harmless). |
| 1.3.2 | Meaningful Sequence (A) | **PASS** | DOM order matches visual order (K tab walk). |
| 1.3.3 | Sensory Characteristics (A) | **PASS** | Instructions don't depend on shape or colour alone ("square sign" in the map label is paired with "To-Let board"). |
| 1.3.4 | Orientation (AA) | **PASS** | No orientation lock (C). Tested portrait and landscape viewports (V). |
| 1.3.5 | Identify Input Purpose (AA) | **PASS** | The only personal-data field is the admin email: `type=email autocomplete=email`. Rent fields aren't about the user. |
| 1.4.1 | Use of Color (A) | **PASS** | Gated vs not-gated = solid vs ring (shape); boards = square; errors = text + `aria-invalid` + border; warnings are worded. The heatmap is colour-only but has a text legend, and the list's Monsoon column gives the same data as text. |
| 1.4.2 | Audio Control (A) | **N/A** | No audio. |
| 1.4.3 | Contrast (Minimum) (AA) | **PASS** | axe: 0 violations in every state (A). Tokens documented in `main.css` (ink 15:1, muted 5.6:1, teal-2 5.3:1, white on action 4.6:1). An early axe run flagged 4 items in Filters; that was measured mid open-animation (60 % opacity) and is clean once the animation ends. Needs-review items checked by hand: dialog titles ink on white; legend ink-2 on white; attribution 75 % black on a white chip. |
| 1.4.4 | Resize Text (AA) | **PASS** | 200 % zoom (1280→640 CSS px): nothing lost or clipped (V). Browser text-only zoom not tested. |
| 1.4.5 | Images of Text (AA) | **PASS** | No images of text in the UI. User photos of real boards are photographs, not presentation choices (see 1.1.1 for the phone number). |
| 1.4.10 | Reflow (AA) | **PASS** | 320 px and 640 px (= 200 %): no page-level horizontal scroll on any page; dialogs fit; controls not clipped (V). The rent table scrolls sideways inside its container: allowed for data tables. The map is 2-D content: allowed. |
| 1.4.11 | Non-text Contrast (AA) | **PASS** | Field edges 3.3:1, focus ring 3.7:1, gated pin teal on basemap ≈ 3.8:1+, board icon has a white halo and 15:1 ink stroke (C). The heatmap's lightest band is low-contrast by nature; the list carries the same data. |
| 1.4.12 | Text Spacing (AA) | **PASS** | WCAG spacing overrides injected at 320, 375 and 640 px: no clipped or overlapping controls, no horizontal overflow (V). The only flag was `.tool-long`, which is intentionally visually hidden on narrow screens. |
| 1.4.13 | Content on Hover or Focus (AA) | **N/A** | No hover/focus pop-ups. Map hover only recolours a pin. |

### Operable

| SC | Name | Status | Evidence / notes |
|---|---|---|---|
| 2.1.1 | Keyboard (A) | **PASS** (was **FAIL**) | **Was:** To-Let boards opened only from a map click. **Fixed:** the list view lists boards ("To-Let board near Beltola · Pinned 3 days ago · Expires in 57 days"); Enter opens the board dialog (K, stubbed board). Rents: the list table opens every pin (K). Adding a pin: "Pin your rent" → arrow keys on the focused map → "Use this spot" → form (K). Cluster expansion is pointer-only, but every rent is in the list. |
| 2.1.2 | No Keyboard Trap (A) | **PASS** | Tab passes into and out of the map canvas and its controls; modal dialogs keep focus inside and release it on Esc (K). |
| 2.1.4 | Character Key Shortcuts (A) | **PASS** | MapLibre's arrow/±/- keys act only while the map has focus (C). |
| 2.2.1 | Timing Adjustable (A) | **PARTIAL** | When the clipboard API fails, the link to copy is shown in a toast that disappears after 8 s (`pin-card.ts`, `main.ts`). Every other toast is a confirmation. Turnstile tokens expire, but the forms reset them (C). |
| 2.2.2 | Pause, Stop, Hide (A) | **PASS** | No auto-moving or updating content beyond a 160 ms dialog animation (disabled under reduced motion). |
| 2.3.1 | Three Flashes (A) | **PASS** | Nothing flashes. |
| 2.4.1 | Bypass Blocks (A) | **PASS** (was **PARTIAL**) | **Was:** "Skip to actions" targeted `#main-actions`, which on desktop contains only hidden buttons, so focus fell off the page. **Fixed:** "Skip to main content" → `<main tabindex="-1">`; next Tab = first map tool (K). |
| 2.4.2 | Page Titled (A) | **PASS** | Unique titles on every page. |
| 2.4.3 | Focus Order (A) | **PASS** | Logical order: skip link → header → toolbar → map → map controls (K). Focus moves into dialogs and back to the trigger, including list rows and board items (K). |
| 2.4.4 | Link Purpose (In Context) (A) | **PASS** | All links descriptive. The new Privacy link on the form says "(opens in a new tab)" to screen readers. |
| 2.4.5 | Multiple Ways (AA) | **PASS** (was **PARTIAL**) | **Fixed:** footer navigation on the static pages; the header links About; the form links Privacy. |
| 2.4.6 | Headings and Labels (AA) | **PASS** | Descriptive dialog titles, section headings and field labels. |
| 2.4.7 | Focus Visible (AA) | **PASS** (was **FAIL** in forced colours) | Normal mode: a ring on every one of 40 Tab stops (K). **Was:** the ring is a `box-shadow`, which forced-colours mode removes; computed `outline: none` (K, emulated `forced-colors: active`). **Fixed:** `@media (forced-colors: active)` adds a `CanvasText` outline (main + static pages). Verified: `outline: 2px solid`. |
| 2.4.11 | Focus Not Obscured (Minimum) (AA) | **PASS** (desktop) | No focused element covered by the header, toolbar or toasts (K, `elementFromPoint` at each stop, 1366×768). **Not tested:** keyboard on a phone-size viewport with the bottom sheet open. |
| 2.5.1 | Pointer Gestures (A) | **PASS** | Pinch zoom has ± buttons; nothing needs a multipoint or path gesture. |
| 2.5.2 | Pointer Cancellation (A) | **PASS** | Native buttons fire on release; a backdrop click closes a dialog only if the press also started on the backdrop (C). |
| 2.5.3 | Label in Name (A) | **PASS** | Accessible names begin with the visible text ("Filters, 2 active"; list rows "2 BHK flat, ₹12,000 a month: details"; brand "Guwahati Rent home"). |
| 2.5.4 | Motion Actuation (A) | **N/A** | No motion input. |
| 2.5.7 | Dragging Movements (AA) | **PASS** | Panning by drag has single-pointer alternatives: in placement mode a single tap sets the spot; tapping a cluster zooms to it; double-tap zooms at a point; ± buttons; "Find my location"; the list view needs no map at all (C). |
| 2.5.8 | Target Size (Minimum) (AA) | **PASS** | Every control outside the map ≥ 44 px on touch (smoke test). The attribution links (59×14, 85×14) are inline text: excepted. Pins drawn in the canvas: the "equivalent" exception applies, since every rent is a full-size button in the list on the same page. |

### Understandable

| SC | Name | Status | Evidence / notes |
|---|---|---|---|
| 3.1.1 | Language of Page (A) | **PASS** | `lang="en"` on every page. |
| 3.1.2 | Language of Parts (AA) | **PASS** | No passages in another language. Locality names are proper nouns. |
| 3.2.1 | On Focus (A) | **PASS** | Focus never triggers navigation or submission. |
| 3.2.2 | On Input (A) | **PASS** | Filters update the map and list live, with no change of context; the form reveals follow-up questions in place. |
| 3.2.3 | Consistent Navigation (AA) | **PASS** | Static pages share the header and (now) footer. |
| 3.2.4 | Consistent Identification (AA) | **PASS** (note) | Same function, two labels: "Spot a To-Let" (desktop header) vs "To-Let board" (phone button). They are never shown together; unifying them is P3. |
| 3.2.6 | Consistent Help (A) | **N/A** today | No help mechanism (contact, help page) exists. Once a contact is added (launch requirement), place it in the same spot on every page. |
| 3.3.1 | Error Identification (A) | **PASS** | The rent form names the field and the problem inline and in a summary; `aria-invalid`; focus moves to the first problem (K). The report form does the same for the missing reason (K). |
| 3.3.2 | Labels or Instructions (A) | **PASS** | Visible labels; "Only The home and Rent are needed"; units and format hints ("Number of months, not the amount in ₹"). |
| 3.3.3 | Error Suggestion (AA) | **PASS** | "Expected between ₹5,000 and ₹90,000 a month." Double-check prompt for a rent far from the local median (K, C). |
| 3.3.4 | Error Prevention (Legal, Financial, Data) (AA) | **PASS** | No legal or financial transactions. Deleting a pin needs two presses; a submitted pin can be edited or deleted with its token. |
| 3.3.7 | Redundant Entry (A) | **PASS** | Editing re-fills every answer; "Move pin" keeps the form; the To-Let photo survives a detour to the map (C). |
| 3.3.8 | Accessible Authentication (Minimum) (AA) | **PASS** (Turnstile **NOT VERIFIED**) | Users never log in. Admin login is an email link: no password, no cognitive test. Turnstile is usually invisible; its interactive checkbox fallback wasn't exercised with assistive tech (it can't run on localhost). |

### Robust

| SC | Name | Status | Evidence / notes |
|---|---|---|---|
| 4.1.1 | Parsing | **N/A** | Removed in WCAG 2.2. |
| 4.1.2 | Name, Role, Value (A) | **PASS** | axe 0 violations; toggle buttons use `aria-pressed`; sort headers `aria-sort`; dialogs labelled by their `h2` (A, T). |
| 4.1.3 | Status Messages (AA) | **PARTIAL** (was **FAIL**) | **Was:** the toast's live region was `hidden` until the message arrived, and screen readers commonly drop text that appears together with its region. **Fixed:** the region is always rendered (empty = visually collapsed), and the message is written 50 ms later (T: `role=status`, `live=polite`, not ignored while idle). **Still partial:** the "No rents match these filters" panel uses the same show-with-content pattern, and the live result count ("Show 12 rents") isn't announced while filtering (gap P2-7). Form errors use `role=alert` + focus, which works. |

---

## 2. Keyboard testing

Scripted with real (trusted) key events through the Chrome DevTools Protocol on the production build, desktop 1366×768. A person using a keyboard has **not** walked these flows.

| Journey | Result |
|---|---|
| First visit: welcome dialog takes focus, Tab cycles only Privacy → Terms → "Show me the map", Enter closes | PASS |
| Skip link → main → first map tool | PASS (after fix) |
| Tab through the whole page: 40 stops, ring visible on all, none obscured | PASS |
| Map canvas focusable (MapLibre: arrows pan, ± zoom), named "Map" | PASS |
| Filters: Enter opens; Space toggles "2 BHK"; URL updates `?bhk=2`; Esc closes; focus returns to Filters | PASS |
| Stats: open, Esc, focus returns | PASS |
| List: Enter on a row opens pin details; Esc returns to the same row | PASS |
| Pin details → Report: empty submit shows "Choose what is wrong with this pin.", focus to the first reason, `aria-invalid` | PASS |
| Copy link → toast written into the live region | PASS (after fix) |
| To-Let board from the list → dialog → Esc → focus back on the board item | PASS (after fix; stubbed board, 0 are live) |
| Pin your rent (keyboard) → placement mode, focus on "Use this spot" (now described by the instructions) → arrows move the map → form opens | PASS |
| Rent form: empty submit → inline error, `aria-invalid`, focus on Rent; ₹500 → range suggestion | PASS |
| Rent form valid submit | **NOT VERIFIED**: Turnstile can't issue tokens on localhost, so the submit waits and then shows the spam-check message. Must be checked on production (gap P0-2). |
| To-Let photo upload by keyboard | **NOT RUN**: needs a file picker or camera. |

## 3. Screen-reader testing: **NOT RUN**

No VoiceOver, TalkBack or NVDA session was possible here. I inspected the Chrome accessibility tree (CDP) for the toast and relied on axe for names and roles. **That is not a substitute.** Before claiming conformance, run VoiceOver on iOS Safari and TalkBack on Android Chrome through: welcome → list view → open a rent → report → back; Filters; Stats; Pin your rent with "Find my location" → submit; To-Let from the list. Listen for the toast announcements and the placement instructions.

## 4. Map accessibility (MapLibre)

| Aspect | Finding |
|---|---|
| Keyboard | Canvas is focusable; MapLibre provides arrow-key pan and ± zoom. Placement instructions now tell keyboard users how (shown on mouse-and-keyboard devices; always read to screen readers through `aria-describedby`). |
| Names | Container: "Map of rents in Guwahati. Each dot is a rent someone pays; each square sign is a To-Let board." Canvas: "Map". Controls: "Zoom in", "Zoom out", "Find my location", "Toggle attribution". |
| Markers | Drawn in WebGL from one GeoJSON source (SPEC §5.14), so they aren't individually focusable. That is the right architecture; the **list view is the equivalent**: same filtered data, sortable, every rent openable. **Now it includes To-Let boards too.** |
| Placement for blind users | Possible but coarse: "Find my location" → "Use this spot"; the form then says "Near <locality>". Acceptable; worth confirming in the screen-reader pass. |
| Loading / errors | "Loading map…" and "The map could not load…" in a `role=status` region; "Could not load rents" toast. |
| Dense markers | Clustering, with a count and ₹ label; tested up to 20,000 demo pins (smoke test). |
| Colour | Gated vs not-gated by fill vs ring; boards by square shape, not only colour. |

**Is the list view an adequate alternative?** Yes, for reading rents and boards (after this fix). For *placing* a pin the map is unavoidable; the keyboard path works, and accuracy for blind users relies on geolocation.

## 5. Mobile, zoom and reflow

320 px, 375 px and 640 px (= 1280 at 200 %): no page overflow on any page, dialogs fit and scroll inside, controls not clipped, text-spacing overrides cause no loss. Six viewports (375–1440) in the smoke test: touch targets ≥ 44 px, floating controls never overlap. Not tested: a real phone, iOS text-size settings, landscape keyboard.

## 6. Motion

`prefers-reduced-motion` turns off the dialog animation and map fly-to/ease (jumps instead) (C). No auto-play or parallax.

## 7. Automated results

| Tool | Scope | Result |
|---|---|---|
| axe-core 4.10.3 (wcag2a/aa, 21a/aa, 22aa, best-practice) | 6 static pages + 12 states of the map app | **0 violations** after the fixes. Before: 4 contrast flags in Filters (an artifact of the open animation, see 1.4.3). Needs-review items: contrast over map/dialog backdrops, all checked by hand. |
| Lighthouse 12.8.2 Accessibility (live) | `/`, `/about.html`, `/privacy.html` | 100 / 100 / 100 |
| Browser smoke suite (`npm run test:browser`) | 6 viewports + 7 demo modes | 207 PASS, 0 FAIL |

## 8. Fixes implemented (not deployed)

| # | Problem (WCAG) | Fix | Files |
|---|---|---|---|
| 1 | To-Let boards keyboard-inaccessible (2.1.1) | "To-Let boards" section in the list view; each opens the board dialog with focus return | `index.html`, `src/ui/list-view.ts`, `src/main.ts`, `src/localities.ts` (`nearestIn`), `src/styles/main.css` |
| 2 | Toasts not reliably announced (4.1.3) | Live region always rendered; message written after a 50 ms tick; empty = collapsed | `src/ui/toast.ts`, `index.html`, `src/styles/main.css` |
| 3 | Focus ring invisible in forced colours (2.4.7) | `@media (forced-colors: active)` outline | `src/styles/main.css`, `src/styles/page.css` |
| 4 | Skip link to an empty target on desktop (2.4.1) | "Skip to main content" → `main[tabindex=-1]` | `index.html` |
| 5 | Placement mode had no instructions for keyboard or screen-reader users (3.3.2) | Keyboard hint, and `aria-describedby` on "Use this spot" | `index.html`, `src/styles/main.css` |
| 6 | Privacy and Terms hard to reach (2.4.5) | Footer navigation; Privacy link on the form | static pages, `index.html`, `page.css` |

## 9. Remaining work

| Item | WCAG | Priority |
|---|---|---|
| Screen-reader pass (VoiceOver iOS, TalkBack) | all | **P1**, required before any conformance statement |
| Deploy these fixes | 2.1.1, 2.4.1, 2.4.7, 4.1.3 | P0 (ship with the next release) |
| Board phone number only in the photo | 1.1.1 | P1, your decision (e.g. an optional moderator-typed number, which contradicts the current privacy promise) |
| Announce filter result counts; map empty-state panel | 4.1.3 | P2 |
| Copy-link fallback disappears after 8 s | 2.2.1 | P2 (e.g. keep it until dismissed, or use a native prompt) |
| Turnstile interactive challenge with assistive tech | 3.3.8 / 2.1.1 | P2 (verify on production) |
| Unify "Spot a To-Let" / "To-Let board" labels | 3.2.4 | P3 |
| Keyboard pass on a phone-size viewport with the bottom sheet | 2.4.11 | P3 |
