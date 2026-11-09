# Branding

## Logo

The BrowseWise mark is a white "bw" monogram on a blue tile.

| Item         | Value                             |
| ------------ | --------------------------------- |
| Brand blue   | `#114f7b`                         |
| Letters      | White (`#ffffff`)                 |
| Tile corners | Rounded (radius 28 on a 128 grid) |

### Files

| File                                 | Purpose                                                              |
| ------------------------------------ | -------------------------------------------------------------------- |
| `docs/assets/logo-original.png`      | The original artwork supplied by the author. The master source.      |
| `public/icons/logo.svg`              | A clean vector redrawn from the original. Used inside the extension. |
| `public/icons/icon-16/32/48/128.png` | Toolbar, extensions page, and store icons, rendered from the SVG.    |
| `docs/assets/logo.png`               | 512 px version for the README and store listing.                     |

### How the vector was made

The original image is a soft, slightly blurry raster. The letter outlines were extracted at sub-pixel precision, lightly simplified into straight edges and fine arcs (about 120 points), and fitted into the tile. This keeps the sharp corners of the original. The result was compared against the original and overlaps it by roughly 98% of the letter area; the remaining difference is edge softness in the source.

The 16 px and 32 px icons use slightly larger letters (about 16%) so the mark stays legible at toolbar size. This is standard practice for small icons.

### Using the logo

- Keep clear space of at least a quarter of the tile's width on all sides.
- Do not stretch, recolour, rotate, or add effects.
- On the dark interface the blue tile is used as is. The interface accent colour (indigo) is separate from the brand blue.

### Chrome Web Store note

The store recommends a 128 px icon with about 16 px of transparent padding around the artwork. The current 128 px icon fills the tile edge to edge. A padded version will be prepared in the store-submission phase.
