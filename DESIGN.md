# Recall Studio — Design system

Tokens live in `apps/web/app/globals.css` (`:root` for light, `.dark` for dark) and are exposed to Tailwind through `@theme inline`.

## Color
| Role | Light | Dark |
|---|---|---|
| ground `--bg` | #f7f8f7 | #121716 |
| elevated `--bg-elevated` | #ffffff | #1a2120 |
| ink `--ink` | #16201e | #e8ecea |
| accent (actions, selection, data) `--accent` | #0f766e petrol teal | #35b5a9 |
| ok / bad / warn | #1f7a3a / #b3261e / #9a6400 | #5fcf85 / #ff8a80 / #f2b84b |
| Again / Hard / Good / Easy | red / amber / teal / green | same hues, lighter |

Rules: color goes on data and state, not chrome. Correct/incorrect are always paired with an icon and a text label. One accent; no gradients, no glass.

## Type
One family: **Pretendard Variable** (self-hosted via npm, Korean + Latin), system sans fallback. Mono = system mono for JSON/code only. Scale: 12 / 13 / 14 / 15 / 17–19 (question prompt) / 20 (page title) / 24 (stat). Body line-height 1.55; question prose 1.7; measure ≤ 840px.

## Layout
- Shell: fixed 240px sidebar with its own viewport-height scroll area (hidden in Study/Exam focus mode), 56px top bar with global actions (Copy LLM prompt, shortcuts, theme). Deck/subject disclosure menus show up to five recently reviewed active items and a link to the full list; mobile uses the same menus in the drawer.
- Study: single column, max 840px, progress strip on top, prompt → answer area → verdict → explanation → rating bar → notes.
- Mobile (<768px): study and exam actions stay at the visible viewport's bottom, with safe-area padding and space reserved below the content. Keyboard resize/scroll events reposition the bar; touch devices open answer keyboards only on deliberate focus. Form controls use at least 16px text to prevent focus zoom. Multi-import rows become stacked file cards, and wide question tables scroll within their own container.
- Breakpoints checked: 1440 / 1280 / 768 / 390.

## Components
Buttons (primary / secondary / ghost / soft / danger), inputs, badges, dialog (Radix), checkbox/switch (Radix), tooltip/dropdown (Radix), panel, empty/error/skeleton states, progress strip, rating bar (signature element: four FSRS grades with next intervals), notes panel (one per review round), heatmap + bar charts (plain SVG, one hue).

## Motion
150–250ms state transitions only; `rs-pop` scale-in for dialogs/result; reduced-motion respected.

Async feedback: requests and navigation share a non-blocking top progress bar and status after 300ms; waits over 6 seconds explain that the server is still responding. Passive inbox polling stays quiet. Pending action buttons immediately show a spinner, busy state and progress strip and prevent repeated clicks. Initial data loads use labelled loading panels; cached data stays visible during refresh. Unknown durations remain indeterminate; multi-file imports show actual completed/total files for each validation/save phase. Progress/spinner animations respect reduced motion, and status messages use polite announcements.

## Keyboard
Documented in-app (`?`). Scope manager: global < page < study < modal (exclusive). Never fires inside inputs/textareas/contenteditable or during IME composition; Enter in textareas is a newline; ⌘/Ctrl+Enter submits.
