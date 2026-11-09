import {
  boundaryCrossings,
  projector,
  randomGenerator,
  referencePoints,
  clamp,
  angularDistance,
} from "./astro.js?v=9";
import { selectTargets, visibleSegments } from "./training.js?v=9";
import { parseCode, seedCode, changedSettings, seedParams } from "./codes.js?v=9";
import { pageUrl } from "./site-url.js?v=9";

export const DEFAULT_MAPS = [
  {
    shape: "circle",
    aspect: 1,
    projection: "stereo",
    fov: 120,
    ra: 84,
    dec: 20,
    roll: 0,
    randomCenter: true,
  },
  {
    shape: "circle",
    aspect: 1,
    projection: "stereo",
    fov: 120,
    ra: 84,
    dec: 20,
    roll: 0,
    randomCenter: true,
  },
  {
    shape: "rectangle",
    aspect: 1.6,
    projection: "gnomonic",
    fov: 95,
    ra: 270,
    dec: -15,
    roll: 0,
    randomCenter: true,
  },
];
export const DEFAULT_CONFIG = {
  frame: "equatorial",
  ra: 84,
  dec: 20,
  az: 180,
  alt: 60,
  latitude: 55.75,
  longitude: 37.62,
  date: "2026-01-15T20:00Z",
  fov: 120,
  roll: 0,
  projection: "stereo",
  shape: "circle",
  aspect: 1,
  starCount: 21,
  messierCount: 24,
  count: 24,
  magnitude: 5.5,
  starSize: 1,
  exposure: 0.65,
  level: "beginner",
  display: "milkyway",
  horizon: false,
  bayerTest: false,
  edges: true,
  seed: "684920157",
  maps: DEFAULT_MAPS,
};

export function validateConfig(input = {}) {
  const c = { ...DEFAULT_CONFIG };
  const ranges = {
    ra: [0, 360],
    dec: [-90, 90],
    az: [0, 360],
    alt: [-90, 90],
    latitude: [-90, 90],
    longitude: [-180, 180],
    fov: [20, 180],
    roll: [-360, 360],
    starCount: [1, 24],
    messierCount: [1, 24],
    magnitude: [0, 6],
    starSize: [0.5, 2.5],
    exposure: [0, 1.5],
  };
  for (const [key, [low, high]] of Object.entries(ranges))
    if (input[key] !== undefined) {
      const n = Number(input[key]);
      if (!Number.isFinite(n) || n < low || n > high)
        throw new Error(`Некорректный параметр ${key}`);
      c[key] = n;
    }
  for (const [key, values] of Object.entries({
    frame: ["equatorial", "horizon"],
    projection: ["stereo", "equidistant", "orthographic", "gnomonic"],
    level: ["beginner", "standard", "advanced", "expert"],
    display: ["stars", "milkyway", "mono", "paper"],
  }))
    if (input[key] !== undefined) {
      if (!values.includes(input[key]))
        throw new Error(`Некорректный параметр ${key}`);
      c[key] = input[key];
    }
  for (const key of ["horizon", "bayerTest", "edges"])
    if (typeof input[key] === "boolean") c[key] = input[key];
  if (input.date !== undefined) {
    const date = new Date(input.date);
    if (
      !Number.isFinite(date.getTime()) ||
      date.getUTCFullYear() < 1900 ||
      date.getUTCFullYear() > 2100
    )
      throw new Error("Некорректная дата");
    c.date = date.toISOString();
  }
  const code = parseCode(input.seed ?? c.seed, "T");
  if (!["T", "E"].includes(code.kind)) throw new Error("Для тренажёра нужен seed с префиксом T.");
  c.seed = code.seed;
  c.date = new Date(c.date).toISOString();
  c.starCount = Math.round(c.starCount);
  c.messierCount = Math.round(c.messierCount);
  c.maps = DEFAULT_MAPS.map((defaults, index) => {
    const m = input.maps?.[index] || defaults;
    const result = { ...defaults };
    if (typeof m.randomCenter === "boolean") result.randomCenter = m.randomCenter;
    if (m.shape !== undefined && !["circle", "rectangle"].includes(m.shape))
      throw new Error("Неизвестная форма карты");
    if (
      m.projection !== undefined &&
      !["stereo", "equidistant", "orthographic", "gnomonic"].includes(
        m.projection,
      )
    )
      throw new Error("Неизвестная проекция");
    for (const key of ["shape", "projection"])
      if (m[key] !== undefined) result[key] = m[key];
    for (const [key, range] of Object.entries({
      ra: [0, 360],
      dec: [-90, 90],
      fov: [20, 180],
      roll: [-360, 360],
      aspect: [1, 2],
    }))
      if (m[key] !== undefined) {
        const n = Number(m[key]);
        if (!Number.isFinite(n) || n < range[0] || n > range[1])
          throw new Error("Некорректные параметры карты");
        result[key] = n;
      }
    if (result.projection === "gnomonic")
      result.fov = Math.min(150, result.fov);
    if (result.shape === "rectangle" && result.projection === "orthographic")
      result.fov = Math.min(110, result.fov);
    return result;
  });
  c.maps[1] = { ...c.maps[0] };
  return c;
}

export function createVariant(catalog, input) {
  const base = validateConfig(input),
    random = randomGenerator(base.seed + "maps-v9");
  const centers = [];
  let firstConfig;
  const configs = base.maps.map((map, index) => {
    if (index === 1) return { ...firstConfig };
    let center = base.frame === "horizon" ? [base.az, base.alt] : [map.ra, map.dec];
    if (map.randomCenter) {
      let best = null, bestDistance = -1;
      for (let attempt = 0; attempt < 256; attempt++) {
        const candidate = [random() * 360, Math.asin(base.frame === "horizon" ? 0.1 + random() * 0.85 : random() * 2 - 1) * 180 / Math.PI];
        const distance = centers.length ? Math.min(...centers.map(previous => angularDistance(candidate, previous))) : 180;
        if (distance > bestDistance) { best = candidate; bestDistance = distance; }
        if (distance >= (index === 2 ? 70 : 30)) break;
      }
      center = best;
    }
    centers.push(center);
    const config = {
    ...base,
    ...map,
    ...(base.frame === "horizon" ? { az: center[0], alt: center[1] } : { ra: center[0], dec: center[1] }),
    roll: map.roll + Math.floor(random() * 360),
    seed: base.seed,
    maps: undefined,
    };
    if (index === 0) firstConfig = config;
    return config;
  });
  const references = referencePoints.filter((point) =>
    ["spring", "autumn", "summer", "winter", "G1", "epsilon-1"].includes(
      point.id,
    ),
  );
  const edges = boundaryCrossings(configs[0]);
  const stars = selectTargets(catalog, "stars", {
    ...configs[1],
    count: base.starCount,
  });
  const messier = selectTargets(catalog, "messier", {
    ...configs[2],
    count: base.messierCount,
  });
  const lines = visibleSegments(catalog, configs[2]);
  const attempt = (mode, config, targets) => ({
    mode,
    config,
    targets,
    answers: {},
    selected: 0,
    checked: false,
    strokes: [],
    pending: null,
    entries: [],
    sandboxType: "messier",
  });
  return {
    generation: 9,
    seed: base.seed,
    base,
    configs,
    references,
    edges,
    attempts: {
      reference: attempt("reference", configs[0], [...references, ...edges]),
      stars: attempt("stars", configs[1], stars),
      messier: attempt("messier", configs[2], messier),
      lines: attempt("lines", configs[2], lines),
    },
    scores: {},
  };
}

export function variantSummary(variant) {
  if (variant.exam) return variant.examReport || { rows: [["points", "1. Опорные точки", 12], ["edges", "2. Пересечения с краем", 12], ["stars", "3. Имена звёзд", 42], ["messier", "4. Объекты Мессье", 36], ["lines", "5. Фигуры созвездий", 16], ["symbols", "Крестики и треугольники", 1], ["name", "Фамилия И. О.", 1]].map(([id, label, maximum]) => ({ id, label, maximum, points: 0, checked: false })), points: 0, maximum: 120, complete: false };
  const definitions = [
    ["points", "1. Опорные точки", variant.references.length * 100],
    ["edges", "2. Пересечения с краем", variant.edges.length * 100],
    ["stars", "3. Имена звёзд", variant.attempts.stars.targets.length * 100],
    [
      "messier",
      "4. Объекты Мессье",
      variant.attempts.messier.targets.length * 100,
    ],
    ["lines", "5. Фигуры созвездий", 100],
  ];
  const rows = definitions.map(([id, label, maximum]) => ({
    id,
    label,
    maximum,
    points: Math.round(clamp(variant.scores[id] ?? 0, 0, maximum)),
    checked: maximum === 0 || Object.hasOwn(variant.scores, id),
  }));
  return {
    rows,
    points: rows.reduce((sum, r) => sum + r.points, 0),
    maximum: rows.reduce((sum, r) => sum + r.maximum, 0),
    complete: rows.every((r) => r.checked),
  };
}

export function variantUrl(url, config, mode = "reference", kind = "T") {
  const validated = validateConfig(config),
    result = pageUrl(kind, url);
  result.search = "";
  result.hash = "";
  result.searchParams.set("seed", seedCode(kind, validated.seed));
  const settings = { ...validated };
  delete settings.seed;
  const defaults = { ...validateConfig(), seed: undefined };
  delete defaults.seed;
  const changed = changedSettings(settings, defaults);
  if (changed && kind !== "E") result.searchParams.set("cfg", JSON.stringify(changed));
  if (mode !== "reference") result.searchParams.set("mode", mode);
  return result.href;
}
export function readVariantUrl(url) {
  const params = seedParams(url);
  if (!params.has("seed")) return null;
  const raw = params.get("cfg");
  if (raw && raw.length > 8000)
    throw new Error("Слишком длинные параметры ссылки");
  const config = validateConfig({
    ...(raw ? JSON.parse(raw) : {}),
    seed: params.get("seed"),
  });
  const mode = params.get("mode");
  return {
    config,
    mode: ["reference", "stars", "messier", "lines", "sandbox"].includes(mode)
      ? mode
      : "reference",
  };
}
