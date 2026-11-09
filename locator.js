import { projector } from "./astro.js?v=9";
import { vectorMap, mapHeight } from "./renderer.js?v=9";

export function drawLocator(
  canvas,
  catalog,
  question,
  lines = true,
  paper = false,
) {
  const config = { ...question.map, display: paper ? "paper" : "mono" };
  canvas.height = mapHeight(canvas.width, config);
  vectorMap(canvas, catalog, config);
  const ctx = canvas.getContext("2d"),
    p = projector(config),
    cx = canvas.width / 2,
    cy = canvas.height / 2,
    radius = cx - 2;
  if (lines) {
    ctx.strokeStyle = paper ? "#888" : "#8cc6d380";
    ctx.lineWidth = Math.max(1, canvas.width / 700);
    for (const figure of catalog.lines)
      for (const path of figure.paths) {
        ctx.beginPath();
        let previous = null;
        for (const c of path) {
          const point = p.project(...c);
          if (!point) {
            previous = null;
            continue;
          }
          const x = cx + point[0] * radius,
            y = cy + point[1] * radius;
          if (previous) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
          previous = point;
        }
        ctx.stroke();
      }
  }
  const position = p.project(question.object.ra, question.object.dec);
  if (position) {
    const x = cx + position[0] * radius,
      y = cy + position[1] * radius;
    ctx.strokeStyle = paper ? "#000" : "#ffb480";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 10, y);
    ctx.lineTo(x + 10, y);
    ctx.moveTo(x, y - 10);
    ctx.lineTo(x, y + 10);
    ctx.stroke();
  }
}
