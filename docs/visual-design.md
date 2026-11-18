# Visual design

How the dashboard and the popup look, why, and how each effect is built, kept accessible, and switched off.

## Direction

Neutral graphite, one near-white accent, and light used as the only decoration. The look follows modern product dashboards: soft light from above, fine texture, glass-style cards, and generous type. The previous indigo accent was dropped on purpose. The only blue left is the logo, so it stands out.

| Element  | Choice                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Typeface | Plus Jakarta Sans (variable, weights 200 to 800), bundled. Closest match to the reference image, which could not be identified for certain. |
| Accent   | Near-white (`--bw-accent`). Primary buttons are light with dark text. Charts use a slightly softer `--bw-chart-accent`.                     |
| Surfaces | Solid tokens for inputs and dialogs. Cards are translucent glass so the background light tints them gently.                                 |
| Colour   | Only for the nine category hues and the warning and danger states, always beside a text label.                                              |
| Headings | White fading to soft grey, so the first line reads brightest.                                                                               |

## The background

A fixed, decorative container (`.bw-ambient`, hidden from assistive technology) sits behind everything. Layers, back to front:

| Layer    | What it is                                                       | Scroll drift | Pointer depth |
| -------- | ---------------------------------------------------------------- | ------------ | ------------- |
| Silver   | A wide soft glow from the top, like a spotlight                  | 150 px       | 34 px         |
| Ember    | A faint warm glow from the bottom right                          | 300 px       | -52 px        |
| Beam     | A slanted, blurred shaft of light                                | 220 px       | -18 px        |
| Grid     | A fine dot grid that fades out toward the edges                  | 56 px        | 10 px         |
| Grain    | Film grain (`src/ui/textures/grain.svg`) so gradients never band | none         | none          |
| Vignette | Darkens the corners                                              | none         | none          |

## Parallax

There are four kinds of movement. All are decoration.

1. **Scroll depth (background).** Each layer drifts at its own speed as the page scrolls, so the light appears to sit at different distances. This is pure CSS (`animation-timeline: scroll(root)`), so it runs off the main thread with no scroll handler. It needs Chrome 115 or later (verified against Chrome's documentation). Without support the layers simply stay still.
2. **Pointer depth (background).** `ambient.js` sets `--px` and `--py` (from -1 to 1) on the background, and each layer shifts by its own depth, some in opposite directions. Updates are batched into one animation frame, touch input is ignored, and the layers ease back to the middle when the pointer leaves the window.
3. **Scroll reveal and header drift (content).** Cards rise and fade in as they enter the screen. A page header drifts up more slowly than the page and softens as it leaves. These use view timelines (`animation-timeline: view()`) and the `translate` property, so hover effects, which use `transform`, are not disturbed. Cards that are already visible when a refresh redraws them do not replay the animation.
4. **Card spotlight.** The card under the pointer gets a soft highlight that follows it, and the small icon chip in a stat card leans up to 3 px toward the pointer.

A page's top-level blocks also arrive one after another when the page opens (560 ms, played once per page).

### Reduced motion

With `prefers-reduced-motion: reduce`, nothing moves: no scroll drift, no pointer movement (the module never even attaches its listener), no reveal, no entrance, no spotlight offsets. The static background is still drawn. If the preference changes while the page is open, the effects stop or resume at once.

### High contrast

With forced colours active (Windows high contrast), the background is removed and heading gradients fall back to the system text colour.

## Contrast on the real page

Gradients and grain mean text no longer sits on one flat colour, so contrast was measured on the rendered pages rather than only on the tokens:

- Each page was rendered in headless Chromium 153 with all text made transparent.
- For every visible text run, the brightest and darkest background pixels in its box were sampled.
- The ratio was computed against the worst of them (4.5:1 for normal text, 3:1 for large text; gradient headings at their darkest stop).

Result: **345 visible text runs across the popup and all six dashboard pages, none failing; the tightest margin was 5.39:1.** The first measurement failed (page descriptions at about 3.1:1 to 3.7:1, over the brightest part of the glow), which led to softer grid dots and lighter secondary text. Not measured: hover and focus states, chart labels drawn on a canvas, and system-drawn dropdown lists.

## Dialogs

Dialogs use a solid surface with a blurred backdrop. An early version used the glass card and let the page text show through, which is why dialogs are explicitly opaque.

## Performance

- Scroll movement runs on the compositor, not in JavaScript.
- Pointer movement costs one small update per frame, only while the pointer moves.
- Glass cards do not use `backdrop-filter`, which would be re-blurred while the background moves. Only the sidebar and the dialog backdrop do.
- Not measured: frame rates on real hardware. Check with the manual test list.

## Known limitations

- Scroll depth and reveal need Chrome 115+. Older versions show a still background.
- Browsers or machines with forced colours or reduced motion see the plain version by design.
- The font could not be matched with certainty to the reference image.
