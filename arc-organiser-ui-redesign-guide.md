# Arc Organiser: Step-by-Step UI Redesign Guide

How to take the current UI (v2.0) to the Apple / Google Material You level shown in the reference images. Work in the order below, because each phase builds on the one before it.

**References used**
- Image 2: collaboration platform (bento tiles, floating glass pill, bottom dock)
- Images 3-5: Material You (dynamic color, organic shapes, quick-capture cluster)
- Apple: Liquid Glass edge highlights, spring motion, strict type scale

---

## Phase 1: Clean the foundation

### Step 1: Calm the background

Image 2 uses a quiet photo and images 3-5 use a soft blurred gradient. The current wallpaper is detailed anime-style artwork, so everything on top of it competes with it. Pick one fix:

- Keep the artwork but add a scrim: blur it about 20px and overlay 25-35% of your surface color.
- Or switch to a generated gradient mesh built from the wallpaper's colors.

Save a pre-blurred, downscaled WebP (under about 300KB) so the new tab doesn't decode a huge image on every open.

### Step 2: Build one color system

This is what makes images 3-5 look unified. Use Google's `@material/material-color-utilities` package:

1. Call `sourceColorFromImage()` on the wallpaper to get a seed color.
2. Call `themeFromSourceColor()` to generate the full tonal palette, with light and dark variants.
3. Write the results into CSS variables.

Delete the five random gradient tints. Distinguish collections with a small accent dot or icon instead of a tinted card.

### Step 3: Set your tokens once

```css
:root {
  --primary: #874a8a;        /* from the generated palette */
  --on-primary: #fff;
  --tile: #ffffff;           /* surface-container-lowest */
  --tile-soft: #f6ecf6;      /* surface-container */
  --text: #1d1a1e;
  --text-muted: #6b6470;

  --r-tile: 28px;            /* the 3 radii you will ever use */
  --r-inner: 16px;
  --r-pill: 999px;
  --gap: 16px;               /* 8pt grid: 8, 16, 24, 32 only */
  --shadow: 0 1px 2px rgb(0 0 0 / .05), 0 10px 30px rgb(0 0 0 / .08);
  --spring: cubic-bezier(.2, .9, .3, 1.15);
}
```

### Step 4: Choose one typeface and a strict scale

Bundle the font inside the extension. Don't load it from a CDN, or the new tab will flash.

| Role | Size | Weight | Use |
|---|---|---|---|
| Display | 56/64 | 600 | Timer, temperature (the "65°" look) |
| Title | 15/20 | 600 | Tile names |
| Body | 13/18 | 450 | Bookmark rows |
| Caption | 11/14 | 500, muted | Counts, domains, labels |

---

## Phase 2: Rebuild the layout

### Step 5: Replace the masonry with a bento grid

Image 2 works because every tile sits on the same grid.

```css
.board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
  grid-auto-rows: 176px;
  grid-auto-flow: dense;
  gap: var(--gap);
}
.t-1x1 { }
.t-2x1 { grid-column: span 2; }
.t-1x2 { grid-row: span 2; }
.t-2x2 { grid-column: span 2; grid-row: span 2; }
```

Give each tile a size:

- A collection is 1×2 or 2×2 (five rows plus "+4 more").
- The Pomodoro, weather and quick-add are 1×1.
- The Today tile is 2×1.

### Step 6: Give every tile the same anatomy

Copied from image 2's white tiles:

- Title top-left, with a muted subtitle underneath.
- Content in the middle.
- A footer with a stack of favicons on the left and a circular count badge on the right.

```css
.tile {
  background: var(--tile);
  border-radius: var(--r-tile);
  padding: 20px;
  box-shadow: var(--shadow);
  transition: transform .35s var(--spring), box-shadow .35s var(--spring);
}
.tile:hover { transform: translateY(-2px) scale(1.01); }
```

### Step 7: Collapse the empty states

The three "No bookmarks yet" cards become one translucent ghost tile with a "+" and a label, like the "Create a room" tile in image 2.

---

## Phase 3: Glass and shape, used sparingly

### Step 8: Use glass only on floating layers

That means the top bar, the dock, popovers and the ghost tile, not the content tiles.

```css
.glass {
  background: color-mix(in srgb, var(--tile) 55%, transparent);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgb(255 255 255 / .35);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .5), var(--shadow);
}
```

The edge highlight is what gives it the Apple Liquid Glass feel. Keep it to four glass layers on screen at once or the page will lag.

### Step 9: Flatten the bookmark rows

- Rows are 36px tall with no white pill.
- The favicon sits in a 24px container with an 8px radius.
- Hover shows a soft `--tile-soft` background with a 12px radius.
- For crisp favicons, add the `"favicon"` permission to your manifest and use Chromium's `/_favicon/?pageUrl=…&size=32` endpoint.
- For sites with no favicon, show a letter avatar tinted from your palette.

### Step 10: Add one or two organic shapes, no more

Material You uses scalloped and clover shapes (images 4-5), but only for hero elements. Use them for the quick-capture cluster and one photo or clock tile.

- Draw the shape as an SVG `clipPath` with `clipPathUnits="objectBoundingBox"`.
- In recent Chromium you can use `corner-shape: squircle` on regular tiles, with a fallback.

---

## Phase 4: Rework the chrome around the tiles

### Step 11: Split the top bar into three floating pieces

Based on image 2:

- **Left:** a segmented control for Home and Projects, with a white sliding thumb.
- **Center:** a live pill. At rest it shows time and date. When the Pomodoro runs, it grows into a timer with a progress ring and a pause button, like the "Meeting is about to start -5:23" pill.
- **Right:** a weather chip and a circular search button.

### Step 12: Move the left rail to a bottom dock

Spaces become dock items, with an active dot and a slight scale-up on hover. Theme and settings go into a single overflow button at the top right. This frees about 70px of width, which your tiles can use.

### Step 13: Rebuild each widget

- **Pomodoro:** a 56px display numeral, a thin progress ring, and one filled primary button. Use an outlined icon for the secondary action.
- **Calendar:** replace the month grid with a week strip plus the next three events. Keep the full month in an expanded view.
- **Weather and focus-today chips:** show a large numeral with the icon in the corner.

### Step 14: Build the quick-capture cluster from image 5

It has a clover-shaped tile with the primary "+" in the center and four corner actions (task, voice, sketch, screenshot). Tapping "+" morphs it into the horizontal toolbar. For resize mode, show the selection outline with four dot handles, as in the image.

---

## Phase 5: Motion and polish

### Step 15: Add motion with a few rules

- Use the `--spring` curve with 250-350ms durations.
- Stagger the first load by 30ms per tile, capped at 8 tiles.
- Use the View Transitions API to expand a tile into a full sheet.
- Wrap everything in a `prefers-reduced-motion` check.

### Step 16: Standardize icons

Pick one set, such as Material Symbols Rounded or Lucide, and use it at one size (20px) and one stroke weight.

### Step 17: Check contrast and dark mode

Generate dark mode from the same seed color. Make sure text on tiles meets 4.5:1 contrast, and test on at least three wallpapers because the scrim has to hold up on all of them.

### Step 18: Make the new tab paint instantly

Cache the last rendered layout in `chrome.storage.local` and render it before anything else loads. Use `content-visibility: auto` on offscreen tiles, and aim for first paint under 100ms.

---

## What to delete

- The five gradient tints.
- The white pill behind every bookmark.
- The three empty collection cards.
- The second line of chips in the top bar.

---

## Suggested working order

| Session | Steps | Focus |
|---|---|---|
| 1 | 1-4 | Background, color, tokens, type. The old layout will already look calmer. |
| 2 | 5-7 | Grid and tiles |
| 3 | 8-10 | Glass, rows, shapes |
| 4 | 11-14 | Top pill, dock, widgets, capture |
| 5 | 15-18 | Motion and polish |
