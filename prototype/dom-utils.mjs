// Small DOM helpers shared between modules.

export function autoSizeTextarea(el, max) {
  el.style.height = "auto";
  el.style.height = Math.min(max, el.scrollHeight) + "px";
}
