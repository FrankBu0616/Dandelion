# Dandelion — starter brand kit

Pre-launch identity package. **Dandelion** mark locked in. Two palette options, one type pairing, three wordmark lockups.

Open `brand_kit.html` in a browser for the visual showcase. This file is the written reference.

---

## Logo — Dandelion

**Dandelion** is the canonical mark, and the project takes its name from it: a DAG (three fork sources converging to a diamond merge node), rotated 35° clockwise from vertical. The rotation gives it a windborne-seed-head reading — three seeds drifting on stems toward a heavier core — and structurally breaks the upright-trident silhouette that would otherwise rhyme with the USB icon.

In Dandelion's vocabulary, each side branch the user spins up is a **plant** — a question that's been seeded off the main thread and is growing its own response. **Grafting** brings selected plants back into the main conversation: the user picks which plants take and become part of the trunk's context.

Why the diamond: it visually distinguishes the *merge primitive* from the fork sources. Sources are circles (regular nodes); the merge is a different geometric primitive. That's the visual move that makes the mark mean *what Dandelion is* — fork *and* merge — rather than just "DAG."

Two variants in `brand/logos/`:

| File | Variant | Use |
|---|---|---|
| `dandelion.svg` | Canonical (filled, rotated 35°) | Default — embed in lockups, web headers, anywhere a clean mark is needed |
| `dandelion_app_icon.svg` | App icon (Ink seed with Copper root on rounded Cream tile, mark rotated 35° inside) | macOS / Windows app icon, favicon, OS launcher |

Five reference SVGs from the exploration round remain in `logos/` as record of what was tried: `01_trefoil.svg`, `03_striped_tile.svg`, `04_tributary.svg`, `05_lens.svg`, `06_twist.svg`. Safe to delete if you want a cleaner directory.

The wordmark text uses `currentColor` so it can be recolored by setting `color` on the parent element. The Dandelion mark uses fixed brand colors: Ink seed/stems and a Copper root/merge diamond.

---

## Color palettes

Two directions. **Direction A is the recommendation** — it puts Dandelion on the warm side of LLM tooling, where almost every competitor is cold blue/purple.

### Direction A — Warm anchor (recommended)

| Role | Name | Hex |
|---|---|---|
| Primary ink | Ink | `#0F0F12` |
| Background (light) | Cream | `#F4EFE6` |
| Accent | Copper | `#C97B4E` |
| Secondary accent | Teal | `#3A7A7A` |
| UI / muted | Slate | `#5C5F66` |
| Surface | White | `#FFFFFF` |

### Direction B — Cool modern (reserve)

| Role | Name | Hex |
|---|---|---|
| Primary ink | Ink | `#0A0A0F` |
| Background (light) | Pale | `#F4F4F8` |
| Accent | Violet | `#6E5CFF` |
| Secondary accent | Amber | `#E8A87C` |
| UI / muted | Slate | `#6A6E78` |
| Surface | White | `#FFFFFF` |

---

## Typography

Single pairing — sans for UI, mono for code / node IDs / canvas labels. Both free, widely available.

- **UI sans:** `Inter` ([rsms.me/inter](https://rsms.me/inter/)). Variable font, excellent at all sizes. Use weight 500 for headings and the wordmark, 400 for body. Backup: `Geist` (Vercel) for a slightly more contemporary feel.
- **Monospace:** `JetBrains Mono` ([jetbrains.com/lp/mono](https://www.jetbrains.com/lp/mono/)). Best ligatures in the category. Use 400. Backup: `Geist Mono` if you went with Geist for sans.

Avoid weights 600 or 700 — Inter 500 is heavy enough; 700 starts to feel chunky.

---

## Wordmarks

Three lockups in `brand/`:

- `wordmark_plain.svg` — wordmark alone, lowercase, slightly tracked-in (letter-spacing −2). Use for prose mentions, footer credit.
- `wordmark_lockup_horizontal.svg` — Dandelion mark + wordmark side by side. Use for README header, website nav.
- `wordmark_lockup_stacked.svg` — Dandelion mark above wordmark, centered. Use for app splash, social card center, profile avatars.

Lowercase is intentional: "dandelion" lowercase reads as a contemporary software-tool name. Compare lowercase Vercel, Linear, Arc — same register. Title-case "Dandelion" stays available for prose and headings; the wordmark is the brand artifact.

---

## What to do next

The kit is enough to: cut a favicon (16/32/256 px) by exporting `dandelion_app_icon.svg`, drop the horizontal lockup at the top of the README, and use the stacked lockup as a GitHub social card. The remaining things worth generating once you're ready:

1. **Favicon set** — `.ico` and `.png` exports from `dandelion_app_icon.svg`
2. **GitHub social card** — 1280×640 PNG, stacked lockup centered on Cream background
3. **README banner** — 1280×320 PNG, horizontal lockup with a one-line tagline

Tell me when you want any of those, and I'll generate them.
