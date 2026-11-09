export function referenceSymbol(target) {
  if (target.id.startsWith("edge-")) return target.name.split(" ·")[0];
  return { spring: "♈", autumn: "♎", summer: "♋", winter: "♑",
    G1: "Γ₁", G2: "Γ₂", "epsilon-1": "ε₁", "epsilon--1": "ε₂",
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
