// HTML-escape helper. Pure function — shared by prototype modules and any
// future renderer that builds HTML strings.

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
}
