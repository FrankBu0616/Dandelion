// Dandelion seed-head visualization for the graft fold.
//
// Renders the grafted plants as a small SVG fan: a copper anchor with stems
// leaning to the upper-right, each ending in a puff and a label.
//
// Pure function. Input is a list of {title} objects (the plant titles being
// grafted). Returns an HTML string that can be dropped into innerHTML.

import { escapeHtml } from "./escape.mjs";

const ANCHOR_X = 16;
const ANCHOR_Y = 104;
const STEM_LEN = 70;
const ANGLE_MIN = 20;   // degrees from vertical, leaning right
const ANGLE_MAX = 78;

/**
 * @param {{title?: string}[]} plants
 * @returns {string} SVG markup
 */
export function renderDandelionSVG(plants) {
  const n = plants.length;
  const angles =
    n === 1
      ? [(ANGLE_MIN + ANGLE_MAX) / 2]
      : Array.from({ length: n }, (_, i) => ANGLE_MIN + ((ANGLE_MAX - ANGLE_MIN) * i) / (n - 1));

  const seeds = plants
    .map((t, i) => {
      const theta = (angles[i] * Math.PI) / 180;
      const tx = +(ANCHOR_X + STEM_LEN * Math.sin(theta)).toFixed(1);
      const ty = +(ANCHOR_Y - STEM_LEN * Math.cos(theta)).toFixed(1);
      const lx = +(ANCHOR_X + (STEM_LEN + 12) * Math.sin(theta)).toFixed(1);
      const ly = +(ANCHOR_Y - (STEM_LEN + 12) * Math.cos(theta)).toFixed(1);
      const title = (t.title || `Seed ${i + 1}`).slice(0, 18);
      return (
        `<g class="dan-seed" data-seed-i="${i}">` +
        `<line class="dan-stem" x1="${ANCHOR_X}" y1="${ANCHOR_Y}" x2="${tx}" y2="${ty}" stroke="#C4B5A0" stroke-width="1" stroke-linecap="round" opacity="0.7"/>` +
        `<circle class="dan-puff" cx="${tx}" cy="${ty}" r="5" fill="white" stroke="var(--accent)" stroke-width="1.5"/>` +
        `<text class="dan-label" x="${lx}" y="${ly}" text-anchor="start" dominant-baseline="middle" ` +
        `font-size="10" fill="#5C5F66" font-family="Inter,sans-serif" font-weight="500">${escapeHtml(title)}</text>` +
        `</g>`
      );
    })
    .join("");

  return (
    `<svg class="graft-dandelion" width="220" height="110" style="overflow:visible">` +
    `<circle cx="${ANCHOR_X}" cy="${ANCHOR_Y}" r="3" fill="var(--accent)" opacity="0.55"/>` +
    seeds +
    `</svg>`
  );
}
