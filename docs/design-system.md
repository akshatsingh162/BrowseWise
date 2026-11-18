# Design system

Shared visual language for the popup and the dashboard. Everything lives in `src/ui/`.

| File                           | Purpose                                                                     |
| ------------------------------ | --------------------------------------------------------------------------- |
| `src/ui/styles/tokens.css`     | The only place raw colours, sizes, spacing, radii and timings live.         |
| `src/ui/styles/base.css`       | Reset, bundled Plus Jakarta Sans font, focus ring, reduced-motion handling. |
| `src/ui/styles/ambient.css`    | Background light, grid and grain, plus scroll and pointer depth effects.    |
| `src/ui/ambient.js`            | Builds the background and handles pointer parallax and card spotlights.     |
| `src/ui/styles/components.css` | Reusable `bw-*` components: card, buttons, chip, bar, skeleton, state.      |
| `src/ui/dom.js`                | Safe DOM builder (text is never injected as HTML).                          |
| `src/ui/icons.js`              | Registry of the Lucide icons in use (the rest are tree-shaken away).        |

## Principles

- **Dark-first, one accent.** Neutral graphite surfaces with a single near-white accent. Colour is reserved for categories and for warning and danger states. See [Visual design](visual-design.md).
- **Tokens, not literals.** Components use `var(--bw-*)`. Re-theming means editing `tokens.css`.
- **Accessible by construction.** Every text and background pair meets WCAG AA (4.5:1). Keyboard focus is always visible. Animations are disabled for users who prefer reduced motion.
- **Neutral numbers.** More or less screen time is never coloured as good or bad.
- **No third-party requests.** The Plus Jakarta Sans font file is bundled, icons are inlined SVG, and website favicons come from Chrome's own favicon cache through the extension `_favicon` endpoint.

## Contrast (measured)

Token pairs, computed from the hex values:

| Pair                           | Ratio |
| ------------------------------ | ----- |
| Text on surface                | 17.0  |
| Muted text on surface          | 8.8   |
| Faint text on surface          | 7.0   |
| Muted text on raised surface   | 8.2   |
| Faint text on raised surface   | 6.6   |
| Dark text on the accent button | 17.7  |
| Danger on surface              | 6.8   |
| Warning on surface             | 9.2   |

Because the page background now has light behind some text, the real rendered result is also measured. See [Visual design](visual-design.md#contrast-on-the-real-page).

## Adding an icon

1. Import it from `lucide` in `src/ui/icons.js` and register it in `ICONS`.
2. Use `icon('name', { size })` to create the SVG element.

## Font licence

Plus Jakarta Sans is licensed under the SIL Open Font License 1.1. The licence text is kept in `src/ui/fonts/LICENSE-PlusJakartaSans.txt`.

## Category colours

Nine muted hues (`--bw-cat-*` in `tokens.css`) identify categories in the share bar and list. Each is at least 4.5:1 against the card surface (graphics need 3:1). Colour is never the only signal: every category also has a text label and a percentage, and the bar has a spoken summary.

## Brand blue and the interface accent

The logo uses brand blue (`#114f7b`). The interface itself is neutral graphite with a near-white accent (`--bw-accent`), so the logo is the one touch of blue. See `docs/branding.md`.

## Switch, danger button, and progress levels

- **Switch** (`.bw-switch`): a button with `role="switch"` and `aria-checked`, always paired with a text label.
- **Danger button** (`.bw-btn-danger`): for destructive actions, which are always confirmed in a dialog.
- **Progress levels:** the bar changes colour at 80% (warning) and at the limit (danger), but the state is always also written in words.
