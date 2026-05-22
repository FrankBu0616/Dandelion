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

import { marked } from "https://esm.sh/marked@13.0.3";
import katex from "https://esm.sh/katex@0.16.11";
import DOMPurify from "https://esm.sh/dompurify@3.2.6";

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
