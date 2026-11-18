const EPSILON = 1e-10;

function squaredDistance(point, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return (point[0] - a[0] - t * dx) ** 2 + (point[1] - a[1] - t * dy) ** 2;
}

function outsideIntervals(a, b, start, end, radius) {
  const dx = b[0] - a[0], dy = b[1] - a[1], lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return squaredDistance(a, start, end) > radius * radius ? [[0, 1]] : [];
  const cuts = [0, 1];
  const add = value => { if (value > EPSILON && value < 1 - EPSILON) cuts.push(value); };
  for (const center of [start, end]) {
    const x = a[0] - center[0], y = a[1] - center[1];
    const linear = 2 * (x * dx + y * dy), constant = x * x + y * y - radius * radius;
    const discriminant = linear * linear - 4 * lengthSquared * constant;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      add((-linear - root) / (2 * lengthSquared)); add((-linear + root) / (2 * lengthSquared));
    }
  }
  const sx = end[0] - start[0], sy = end[1] - start[1], length = Math.hypot(sx, sy);
  if (length > EPSILON) {
    const distance = ((a[0] - start[0]) * -sy + (a[1] - start[1]) * sx) / length;
    const change = (dx * -sy + dy * sx) / length;
    if (Math.abs(change) > EPSILON) { add((radius - distance) / change); add((-radius - distance) / change); }
    const along = ((a[0] - start[0]) * sx + (a[1] - start[1]) * sy) / length;
    const alongChange = (dx * sx + dy * sy) / length;
    if (Math.abs(alongChange) > EPSILON) { add(-along / alongChange); add((length - along) / alongChange); }
  }
  cuts.sort((x, y) => x - y);
  const intervals = [];
  for (let i = 1; i < cuts.length; i++) {
    const low = cuts[i - 1], high = cuts[i];
    if (high - low < EPSILON) continue;
    const t = (low + high) / 2;
    if (squaredDistance([a[0] + t * dx, a[1] + t * dy], start, end) < radius * radius - EPSILON) continue;
    const previous = intervals.at(-1);
    if (previous && Math.abs(previous[1] - low) < EPSILON) previous[1] = high;
    else intervals.push([low, high]);
  }
  return intervals;
}

export function eraseStrokes(strokes, start, end, radius, projection) {
  let changed = false;
  const result = [];
  for (const stroke of strokes) {
    const screen = stroke.points.map(point => projection.project(...point));
    if (screen.some(point => !point)) { result.push(stroke); continue; }
    const pieces = [];
    let piece = [], last = null, removed = false;
    const flush = () => { if (piece.length >= 2) pieces.push({ ...stroke, points: piece }); piece = []; last = null; };
    for (let index = 1; index < screen.length; index++) {
      const a = screen[index - 1], b = screen[index];
      const intervals = outsideIntervals(a, b, start, end, radius);
      if (intervals.length !== 1 || intervals[0][0] !== 0 || intervals[0][1] !== 1) removed = true;
      for (const [low, high] of intervals) {
        const interpolate = t => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
        const from = interpolate(low), to = interpolate(high);
        const fromSky = low === 0 ? stroke.points[index - 1] : projection.inverse(...from);
        const toSky = high === 1 ? stroke.points[index] : projection.inverse(...to);
        if (!fromSky || !toSky) { flush(); continue; }
        if (!last || Math.hypot(last[0] - from[0], last[1] - from[1]) > EPSILON) { flush(); piece = [fromSky]; }
        piece.push(toSky); last = to;
        if (high < 1) flush();
      }
      if (!intervals.length) flush();
    }
    flush();
    if (removed) { changed = true; result.push(...pieces); }
    else result.push(stroke);
  }
  return changed ? result : strokes;
}
