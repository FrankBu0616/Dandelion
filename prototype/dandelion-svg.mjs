// Dandelion seed-head visualization for the graft fold.
//
// Renders the grafted plants as a small SVG fan: a copper anchor with stems
// leaning to the upper-right, each ending in a puff and a label.
//
// Pure function. Input is a list of {title} objects (the plant titles being
// grafted). Returns an HTML string that can be dropped into innerHTML.

import { escapeHtml } from "./escape.mjs";

const ANCHOR_X = 22;
const ANCHOR_Y = 92;
const STEM_LEN = 64;
const ANGLE_MIN = 20;   // degrees from vertical, leaning right
const ANGLE_MAX = 78;
const LABEL_CHARS_PER_LINE = 28;
const LABEL_MAX_LINES = 3;

function labelLines(text) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > LABEL_CHARS_PER_LINE && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length === LABEL_MAX_LINES) break;
  }
  if (line && lines.length < LABEL_MAX_LINES) lines.push(line);
  if (words.join(" ").length > lines.join(" ").length && lines.length > 0) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[.…]+$/u, "") + "...";
  }
  return lines.length ? lines : ["Untitled seed"];
}

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
      const fullTitle = t.fullPrompt || t.title || `Seed ${i + 1}`;
      const lines = labelLines(fullTitle);
      const tspans = lines
        .map((line, lineIndex) =>
          `<tspan x="${lx}" dy="${lineIndex === 0 ? 0 : 12}">${escapeHtml(line)}</tspan>`)
        .join("");
      return (
        `<g class="dan-seed" data-seed-i="${i}">` +
        `<title>${escapeHtml(fullTitle)}</title>` +
        `<line class="dan-stem" x1="${ANCHOR_X}" y1="${ANCHOR_Y}" x2="${tx}" y2="${ty}" stroke="#B89572" stroke-width="1.25" stroke-linecap="round" opacity="0.85"/>` +
        `<circle class="dan-puff" cx="${tx}" cy="${ty}" r="5" fill="#FFF8EF" stroke="var(--accent)" stroke-width="1.5"/>` +
        `<text class="dan-label" x="${lx}" y="${ly}" text-anchor="start" dominant-baseline="middle" ` +
        `font-size="10" fill="#5C5F66" font-family="Inter,sans-serif" font-weight="500">${tspans}</text>` +
        `</g>`
      );
    })
    .join("");

  return (
    `<svg class="graft-dandelion" width="220" height="120" viewBox="0 0 220 120" style="overflow:visible" aria-hidden="true">` +
    `<circle cx="${ANCHOR_X}" cy="${ANCHOR_Y}" r="3.5" fill="var(--accent)" opacity="0.68"/>` +
    seeds +
    `</svg>`
  );
}
