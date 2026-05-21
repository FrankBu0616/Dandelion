// Idle dandelion SVG for the main column's empty state.
//
// One big illustration: the central seed-head with two leaves and a few seeds
// drifting off in the corners. CSS in styles/empty-state.css animates the
// rotation and float.
//
// Pure function — returns an HTML string ready to drop into innerHTML.

export function renderIdleDandelion() {
  return (
    `<svg class="dandelion-idle" viewBox="0 0 360 360" role="img" aria-label="A single dandelion waving in the breeze">` +
      `<g class="idle-dandelion">` +
        `<path class="idle-stem" d="M180 326 C178 278 176 224 181 169"/>` +
        `<path class="idle-leaf" d="M176 284 C137 266 118 234 111 197 C145 210 170 236 176 284Z"/>` +
        `<path class="idle-leaf" d="M183 292 C215 265 235 235 244 201 C214 212 190 244 183 292Z"/>` +
        `<g class="idle-head">` +
          `<g transform="translate(181 138)">` +
            renderSeedHead() +
            `<circle cx="0" cy="0" r="8" fill="#B98445" opacity="0.88"/>` +
          `</g>` +
        `</g>` +
      `</g>` +
      renderFloatingSeed({ x: 82,  y: 86,  rot: -28, lineLen: 18, puff: { w: 8, sideY: -6, topY: -10 }, core: { cy: 20, r: 3.3 } }) +
      renderFloatingSeed({ x: 304, y: 72,  rot: 28,  lineLen: 18, puff: { w: 7, sideY: -5, topY: -9  }, core: { cy: 20, r: 3   } }) +
      renderFloatingSeed({ x: 318, y: 218, rot: 54,  lineLen: 16, puff: { w: 6, sideY: -5, topY: -8  }, core: { cy: 18, r: 2.8 } }) +
    `</svg>`
  );
}

function renderSeedHead() {
  return Array.from({ length: 28 }, (_, i) => {
    const angle = i * 12.857;
    const length = i % 4 === 0 ? 58 : i % 3 === 0 ? 51 : 45;
    const core = i % 5 === 0 ? 4.2 : 3.2;
    return (
      `<g transform="rotate(${angle})">` +
        `<line class="idle-seed-line" x1="0" y1="-8" x2="0" y2="-${length}"/>` +
        `<g transform="translate(0 -${length})">` +
          `<line class="idle-seed-puff" x1="-7" y1="-5" x2="0" y2="0"/>` +
          `<line class="idle-seed-puff" x1="0" y1="-8" x2="0" y2="0"/>` +
          `<line class="idle-seed-puff" x1="7" y1="-5" x2="0" y2="0"/>` +
          `<circle class="idle-seed-core" cx="0" cy="2" r="${core}"/>` +
        `</g>` +
      `</g>`
    );
  }).join("");
}

function renderFloatingSeed({ x, y, rot, lineLen, puff, core }) {
  return (
    `<g class="idle-floating-seed-anchor" transform="translate(${x} ${y}) rotate(${rot})">` +
      `<g class="idle-floating-seed">` +
        `<line class="idle-seed-line" x1="0" y1="${lineLen}" x2="0" y2="0"/>` +
        `<line class="idle-seed-puff" x1="-${puff.w}" y1="${puff.sideY}" x2="0" y2="0"/>` +
        `<line class="idle-seed-puff" x1="0" y1="${puff.topY}" x2="0" y2="0"/>` +
        `<line class="idle-seed-puff" x1="${puff.w}" y1="${puff.sideY}" x2="0" y2="0"/>` +
        `<circle class="idle-seed-core" cx="0" cy="${core.cy}" r="${core.r}"/>` +
      `</g>` +
    `</g>`
  );
}
