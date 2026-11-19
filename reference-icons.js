import { GREAT_CIRCLE_TYPES } from "./astro.js?v=14";

export function referenceSymbol(target) {
  if (target.id.startsWith("edge-")) {
    const [, family, index] = target.id.split("-");
    const type = GREAT_CIRCLE_TYPES[Number(family)];
    if (type) return type.edgePrefix + (Number(index) + 1);
  }
  return { spring: "♈", autumn: "♎", summer: "♋", winter: "♑",
    G1: "НГ1", G2: "НГ2", "epsilon-1": "ЭГ1", "epsilon--1": "ЭГ2",
    north: "N", south: "S" }[target.id] || target.shortName || "✦";
}

export function drawReferenceIcon(ctx, x, y, target, color, size = 26) {
  ctx.save();
  ctx.font = `600 ${size}px "Nightweave Symbols", serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const halfWidth = ctx.measureText(referenceSymbol(target)).width / 2 + 3;
  const tx = Math.max(halfWidth, Math.min(ctx.canvas.width - halfWidth, x));
  const ty = Math.max(size / 2, Math.min(ctx.canvas.height - size / 2, y));
  if (tx !== x || ty !== y) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
    ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
    ctx.stroke();
  }
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#0c141b";
  ctx.strokeText(referenceSymbol(target), tx, ty);
  ctx.fillStyle = color;
  ctx.fillText(referenceSymbol(target), tx, ty);
  ctx.restore();
}
