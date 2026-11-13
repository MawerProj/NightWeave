import { projector } from "./astro.js?v=11";
import { visibleSegments } from "./training.js?v=11";

const cache = new WeakMap();

export function clippedConstellationLines(catalog, config) {
  let entries = cache.get(catalog);
  if (!entries) { entries = new Map(); cache.set(catalog, entries); }
  const key = JSON.stringify(config);
  if (!entries.has(key)) {
    if (entries.size >= 12) entries.delete(entries.keys().next().value);
    entries.set(key, visibleSegments(catalog, config));
  }
  return entries.get(key);
}

export function drawConstellationLines(ctx, catalog, config, { color = "#8cc6d380", width = 1.3, highlightId, highlightColor = "#d5ec95", highlightWidth = 2.5 } = {}) {
  const p = projector(config), cx = ctx.canvas.width / 2, cy = ctx.canvas.height / 2, radius = cx - 2;
  ctx.save();
  ctx.lineCap = "round";
  for (const segment of clippedConstellationLines(catalog, config)) {
    const a = p.project(...segment.a), b = p.project(...segment.b);
    if (!a || !b) continue;
    const highlighted = highlightId && segment.id === highlightId;
    ctx.strokeStyle = highlighted ? highlightColor : color;
    ctx.lineWidth = highlighted ? highlightWidth : width;
    ctx.beginPath();
    ctx.moveTo(cx + a[0] * radius, cy + a[1] * radius);
    ctx.lineTo(cx + b[0] * radius, cy + b[1] * radius);
    ctx.stroke();
  }
  ctx.restore();
}
