// Distances use the unrotated canvas coordinates, so view rotation does not affect picking.
export function nearestPlacedPoint(items, point, project, radius) {
  let nearest = null, distance = radius;
  for (const item of items) {
    if (!item || item.absent || item.draft) continue;
    const projected = project(item.ra, item.dec);
    if (!projected) continue;
    const separation = Math.hypot(projected[0] - point[0], projected[1] - point[1]);
    if (separation < distance) { nearest = item; distance = separation; }
  }
  return nearest;
}
