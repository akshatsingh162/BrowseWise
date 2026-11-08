# Design system

Shared visual language for the popup and the dashboard. Everything lives in `src/ui/`.

| File                           | Purpose                                                                |
| ------------------------------ | ---------------------------------------------------------------------- |
| `src/ui/styles/tokens.css`     | The only place raw colours, sizes, spacing, radii and timings live.    |
| `src/ui/styles/base.css`       | Reset, bundled Inter font, focus ring, reduced-motion handling.        |
| `src/ui/styles/components.css` | Reusable `bw-*` components: card, buttons, chip, bar, skeleton, state. |
| `src/ui/dom.js`                | Safe DOM builder (text is never injected as HTML).                     |
| `src/ui/icons.js`              | Registry of the Lucide icons in use (the rest are tree-shaken away).   |

## Principles

- **Dark-first, one accent.** Charcoal surfaces with a single indigo accent.
- **Tokens, not literals.** Components use `var(--bw-*)`. Re-theming means editing `tokens.css`.
- **Accessible by construction.** Every text and background pair meets WCAG AA (4.5:1). Keyboard focus is always visible. Animations are disabled for users who prefer reduced motion.
- **Neutral numbers.** More or less screen time is never coloured as good or bad.
- **No third-party requests.** The Inter font file is bundled, icons are inlined SVG, and website favicons come from Chrome's own favicon cache through the extension `_favicon` endpoint.

## Contrast (measured)

| Pair                   | Ratio |
| ---------------------- | ----- |
| Text on surface        | 14.9  |
| Muted text on surface  | 6.9   |
| Faint text on surface  | 5.3   |
| Accent text on surface | 7.5   |
| White on accent button | 4.8   |
| Danger on surface      | 6.5   |

## Adding an icon

1. Import it from `lucide` in `src/ui/icons.js` and register it in `ICONS`.
2. Use `icon('name', { size })` to create the SVG element.

## Font licence

Inter is licensed under the SIL Open Font License 1.1. The licence text is kept in `src/ui/fonts/LICENSE-Inter.txt`.
