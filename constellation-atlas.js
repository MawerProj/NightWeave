import { angularDistance, coordinates, vector } from "./astro.js?v=10";

export function atlasStars(catalog) {
  return catalog.atlasStars || catalog.named;
}

export function constellationView(catalog, constellation) {
  const stars = (constellation.brightStars || []).map(id => atlasStars(catalog).find(star => star.id === id)).filter(Boolean);
  const paths = catalog.lines.filter(line => line.id === constellation.id).flatMap(line => line.paths);
  const points = [...paths.flat(), ...stars.map(star => [star.ra, star.dec])];
  const sum = points.reduce((total, point) => vector(...point).map((value, index) => total[index] + value), [0, 0, 0]);
  const length = Math.hypot(...sum);
  const center = points.length && length > 1e-6 ? coordinates(sum.map(value => value / length)) : [constellation.ra, constellation.dec];
  const radius = Math.max(6, ...points.map(point => angularDistance(center, point)));
  return { stars, paths, ra: center[0], dec: center[1], fov: Math.min(180, Math.max(25, radius * 2 + 12)) };
}
