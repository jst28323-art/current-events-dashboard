# DESIGN LANGUAGE — macOS calm for a live feed

The owner's brief: *"emulate apple's macos. i want it to be minimalistic, clean, and intuitive to use."* This page turns
that into rules a session can apply without re-deciding them. The research behind it is
`docs/research/architecture_hosting_frontend.md` §9 (licensing quotes verified 2026-10-02).

## Principles

1. **Content first, chrome quiet.** The feed is dense with information; everything around it recedes. Translucent
   materials only on chrome (sidebar, toolbar, tab bar), never on feed content, which stays plain and opaque
   (Apple's own guidance for its current "Liquid Glass" material: use it for the navigation layer, sparingly).
2. **One glance tells you what is live.** A live item is the only thing on screen allowed to use a saturated color
   and motion (a small pulsing red dot). Everything else is grayscale plus the accent color.
3. **Familiar structure.** Sidebar (sources) → list (feed) → inspector (detail), like Mail, Notes or News on macOS.
   No novel navigation.
4. **Honest labels.** Origin labels ("official", "unofficial", "from House Democrats", "third-party", "inferred")
   are neutral gray chips with words, never party colors (D-009). Freshness is always visible ("2 min ago · Senate
   LIS"). A stale source says "stale", not nothing.
5. **Calm motion.** New items slide in gently at the top; no layout jumps under the reader's finger (new items wait
   behind a "3 new" pill while the user is scrolled down). Respect `prefers-reduced-motion`.

## Licensing (binding)

- **Never self-host or embed SF Pro.** Apple's font license limits it to mock-ups for Apple platforms. Use the system
  font stack: Apple devices render SF Pro themselves; other devices get the fallback.
- **Never use SF Symbols on the web.** Use **Lucide** (ISC license; thin outline style closest to SF Symbols).
- Apple's HIG is a reference for patterns and values, not an asset source.

## Tokens (CSS custom properties; light and dark)

The placeholder page (`site/index.html`) defines the first version of these tokens. The system colors below are the
widely published iOS/macOS values. Re-check them against the HIG Color page when the design system is built, since
Apple publishes them as images.

| token | light | dark | use |
|---|---|---|---|
| `--bg` | `#ffffff` | `#1e1e1e` | content background |
| `--bg-window` | `#f5f5f7` | `#161617` | page behind panes |
| `--material` | `rgb(246 246 246 / 0.72)` + `backdrop-filter: blur(20px) saturate(180%)` | `rgb(40 40 40 / 0.68)` + same | sidebar, toolbar, tab bar |
| `--label` | `rgb(0 0 0 / 0.85)` | `rgb(255 255 255 / 0.88)` | primary text |
| `--label-2` | `rgb(0 0 0 / 0.55)` | `rgb(255 255 255 / 0.58)` | secondary text, timestamps |
| `--label-3` | `rgb(0 0 0 / 0.30)` | `rgb(255 255 255 / 0.30)` | placeholders, disabled |
| `--separator` | `rgb(0 0 0 / 0.10)` | `rgb(255 255 255 / 0.10)` | hairlines (1px, or 0.5px on 2x screens) |
| `--accent` | `#007aff` | `#0a84ff` | selection, links, focus ring |
| `--live` | `#ff3b30` | `#ff453a` | the live dot and "LIVE" chip only |
| `--ok` | `#34c759` | `#30d158` | passed / agreed |
| `--warn` | `#ff9500` | `#ff9f0a` | stale source, delayed |
| `--chip` | `rgb(0 0 0 / 0.06)` | `rgb(255 255 255 / 0.10)` | neutral label chips |

Radius: 10px for panes and cards, 6px for controls, 999px for chips. Spacing: a 4px grid (4/8/12/16/24/32).
Shadows: one soft window shadow (`0 10px 30px rgb(0 0 0 / 0.12)`), nothing else.

## Typography

- Stack: `-apple-system, BlinkMacSystemFont, "Inter", system-ui, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`.
  Inter (OFL-1.1) may be self-hosted later for non-Apple devices; the placeholder uses no web fonts.
- Mono (vote counts, document numbers): `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`, with
  `font-variant-numeric: tabular-nums` for anything that changes live.
- Desktop scale (macOS-like): 13px body, 11px secondary, 15px item titles, 22px section title, 26px large title.
  Phone scale (iOS-like): 17px body, 15px secondary, 17px semibold titles, 34px large title. Never below 11px.

## Layout

- **≥ 1100px:** three panes. Sidebar 240px (translucent material), feed 400–480px, inspector fills the rest. Unified
  toolbar on top: title, search field, a segmented filter (All · Live · Votes · Actions · Documents).
- **700–1099px:** sidebar collapses to icons (or a toggle); feed + inspector.
- **< 700px (phone):** one column with a large title, a bottom tab bar (Live · Feed · Search · Settings), and the
  inspector as a pushed page. Safe-area insets respected; thumb-reachable controls.
- **Sidebar sections** (source list; user-customizable later): Live Now · Senate · House · White House · Cabinet &
  Agencies · Federal Register · Courts · Saved Searches.

## Feed item anatomy

```
● LIVE  Senate · Roll call vote 256                         2 min ago
On passage of H.R. 2347 — Agreed to, 52–47
[official · Senate LIS]  [F5 F6]                      Details ›
```

- Line 1: kind icon (Lucide) or live dot · source · relative time (absolute time on hover/long-press, in the user's
  time zone with the zone shown).
- Line 2: the fact, in plain words (what happened, the result). No editorializing, no adjectives.
- Line 3: origin chip(s), then disclosure into the inspector.
- Votes show the tally in tabular numerals; the inspector shows the member-level breakdown (party/state, searchable).

## Accessibility and quality bars

- WCAG AA contrast in both themes; visible focus ring in `--accent`; full keyboard use (⌘K or `/` search, J/K to move,
  Enter to open, Esc to close); `aria-live="polite"` for new-item announcements (rate-limited).
- Test every UI change at 390×844 and 1440×900, light and dark, in Chromium and WebKit (Playwright runs WebKit on
  Windows, which catches Safari-only `backdrop-filter` issues before the iPhone does).
