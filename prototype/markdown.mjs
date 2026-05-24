// Shared markdown + math renderer for assistant bubbles.
//
// Strategy: extract math spans first ($...$, $$...$$, \(...\), \[...\])
// into placeholder tokens, run marked on the masked text (so it can't eat
// underscores/asterisks inside the math), then swap each placeholder for a
// KaTeX-rendered HTML span. KaTeX's CSS is loaded once from CDN in
// prototype.html; without it the math glyphs/spacing will look broken.
//
// Model output is untrusted. Marked intentionally leaves sanitization to the
// caller, so the rendered HTML is cleaned before it reaches innerHTML.

// Pulled from jsdelivr's ESM build (`/+esm`). esm.sh was failing in some
// regions (ERR_CONNECTION_CLOSED), which broke this module's imports —
// which in turn cascaded into main-thread.mjs and killed bootstrap.mjs
// before any UI got wired. jsdelivr is more reliable across geos and
// serves the same packages.
import { marked } from "https://cdn.jsdelivr.net/npm/marked@13.0.3/+esm";
import katex from "https://cdn.jsdelivr.net/npm/katex@0.16.11/+esm";
import DOMPurify from "https://cdn.jsdelivr.net/npm/dompurify@3.2.6/+esm";

marked.setOptions({ breaks: true, gfm: true });

const PLACEHOLDER = (i) => `DANDELIONMATHPLACEHOLDER${i}END`;
const PLACEHOLDER_RE = /DANDELIONMATHPLACEHOLDER(\d+)END/g;

// Order matters: try display delimiters before inline so $$...$$ isn't eaten
// piece-by-piece as two $...$ spans. `\(...\)` / `\[...\]` are also accepted.
const MATH_PATTERNS = [
  { re: /\$\$([\s\S]+?)\$\$/g, display: true },
  { re: /\\\[([\s\S]+?)\\\]/g, display: true },
  { re: /(?<!\\)\$([^\n$]+?)(?<!\\)\$/g, display: false },
  { re: /\\\(([\s\S]+?)\\\)/g, display: false },
];

function escapeHtmlMin(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function extractMath(text) {
  const spans = [];
  let out = text;
  for (const { re, display } of MATH_PATTERNS) {
    out = out.replace(re, (_, tex) => {
      const i = spans.length;
      spans.push({ tex, display });
      return PLACEHOLDER(i);
    });
  }
  return { masked: out, spans };
}

function renderMath(spans, html) {
  return html.replace(PLACEHOLDER_RE, (_, i) => {
    const { tex, display } = spans[Number(i)] || {};
    if (tex == null) return _;
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
      });
    } catch {
      // Last-resort fallback: show the original source so the user can see
      // what failed to render, instead of a blank.
      const delim = display ? "$$" : "$";
      return `<code>${escapeHtmlMin(delim + tex + delim)}</code>`;
    }
  });
}

export function renderMarkdown(text) {
  if (!text) return "";
  const { masked, spans } = extractMath(text);
  const html = marked.parse(masked);
  return DOMPurify.sanitize(renderMath(spans, html));
}
