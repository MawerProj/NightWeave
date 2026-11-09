import { createExam, gradeExam, EXAM_TOLERANCE } from "./exam.js?v=9";
import { drawReferenceIcon, referenceSymbol } from "./reference-icons.js?v=9";
import { nearestPlacedPoint } from "./point-drag.js?v=9";
import { currentSiteUrl } from "./site-url.js?v=9";
import { canvasPoint } from "./map-view.js?v=9";
import { openFullscreen } from "./fullscreen.js?v=9";
import {
  RAD,
  clamp,
  vector,
  coordinates,
  dot,
  projector,
  scoreAnswer,
  referencePoints,
  boundaryCrossings,
  greatCircles,
  angularDistance,
} from "./astro.js?v=9";
import {
  LEVELS,
  selectTargets,
  scoreSandbox,
  resolveObject,
  visibleSegments,
  simplifyStroke,
  scoreDrawing,
  sandboxPoints,
  sortMessier,
} from "./training.js?v=9";
import { GREEK_LETTERS, bayerLabel, bayerMatches } from "./bayer.js?v=9";
import { SkyRenderer, mapHeight } from "./renderer.js?v=9";
import {
  createVariant,
  validateConfig,
  DEFAULT_CONFIG,
  variantSummary,
  variantUrl as taskUrl,
  readVariantUrl,
} from "./variant.js?v=9";
import { Atlas } from "./atlas.js?v=9";
import { makePacket, renderPacket } from "./print.js?v=9";
import { downloadBlob } from "./pdf.js?v=9";
import { parseCode, seedCode, redirectCode, routeLinkedCode } from "./codes.js?v=9";
import { recordProgress, updateProgressCount, showProgress } from "./progress.js?v=9";

const $ = (id) => document.getElementById(id);
const SIZE = 1000,
  CENTER = 500,
  RADIUS = 498;
const sky = $("sky"),
  marks = $("marks");
const context = sky.getContext("2d"),
  overlay = marks.getContext("2d");
const renderer = new SkyRenderer();
const KIND = document.body.dataset.sessionKind || "T";
const isExam = KIND === "E";
const STORAGE = isExam ? "nightweave-exam-v1" : "nightweave-variant-v3";
let draggingMark;
const numericFields = [
  "fov",
  "roll",
  "ra",
  "dec",
  "az",
  "alt",
  "latitude",
  "longitude",
  "count",
  "star-count",
  "magnitude",
  "star-size",
  "exposure",
];
const titles = {
  messier: [
    "Найди объекты<br> далёкого космоса",
    "Выбери объект и поставь точку. Если его нет в этом участке неба, отметь «Вне карты». Кнопка ⓘ открывает каталог.",
  ],
  stars: [
    "Дай звёздам<br> их имена",
    "Найди звёзды из списка. Для отсутствующих звёзд выбери «Вне карты». Уровень сложности определяет набор звёзд и букв Байера.",
  ],
  reference: [
    "Ориентируйся<br> на небесной сфере",
    "Отметь опорные точки. E, Γ и ε — пересечения экваторов и эклиптики с краем области; нумерация пар произвольная.",
  ],
  lines: [
    "Нарисуй<br> знакомые созвездия",
    "Рисуй мышью, пальцем или стилусом. Каждый штрих сохраняется отдельно. Можно переключиться на соединение двумя нажатиями.",
  ],
  sandbox: [
    "Твоё небо.<br> Твои ориентиры.",
    "Смешивай Мессье, звёзды и опорные точки на одной карте. Для Байера выбери букву и впиши созвездие; для равноденствий, солнцестояний и пересечений есть отдельный список.",
  ],
};
let catalog,
  atlas,
  projection,
  baseImage,
  renderPromise,
  toastTimer,
  drawing,
  results = [],
  learned = false;
let variant, freeAttempt;
let state = {
  mode: "reference",
  config: null,
  targets: [],
  answers: {},
  selected: 0,
  checked: false,
  strokes: [],
  pending: null,
  entries: [],
  sandboxType: "messier",
};
const labelBoxes = new WeakMap();
let lastPenContact = -Infinity;
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pixel = (point) => [
  CENTER + point[0] * RADIUS,
  marks.height / 2 + point[1] * RADIUS,
];
const nextFrame = () =>
  new Promise((resolve) =>
    (globalThis.requestAnimationFrame || setTimeout)(resolve),
  );

const variantUrl = (url, config, mode) => taskUrl(url, config, mode, KIND);

function storage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save() {
  try {
    localStorage.setItem(
      STORAGE,
      JSON.stringify({ variant, active: state.mode, freeAttempt }),
    );
  } catch {
    /* Storage is optional. */
  }
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 4000);
}
function openDialog(html) {
  $("dialog-content").innerHTML = html;
  if (!$("dialog").open) $("dialog").showModal();
}
function numericSeed() {
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

function readConfig() {
  const config = {};
  for (const id of numericFields) {
    const input = $(id);
    if (
      !input.checkValidity() ||
      input.value.trim() === "" ||
      !Number.isFinite(Number(input.value))
    ) {
      $("settings").hidden = false;
      input.reportValidity();
      throw new Error("Проверь числовые параметры снимка.");
    }
    config[id] = Number(input.value);
  }
  config.ra *= 15;
  config.starCount = config["star-count"];
  config.messierCount = config.count;
  config.starSize = config["star-size"];
  delete config["star-size"];
  config.count =
    state.mode === "stars" ? config.starCount : config.messierCount;
  for (const id of ["frame", "projection", "level", "display"])
    config[id] = $(id).value;
  config.date = $("date").value + "Z";
  const year = new Date(config.date).getUTCFullYear();
  if (!Number.isFinite(year) || year < 1900 || year > 2100)
    throw new Error("Выбери дату между 1900 и 2100 годом.");
  const code = parseCode($("seed").value.trim() || numericSeed(), KIND);
  if (code.kind !== KIND) throw new Error("Открой этот код через общее поле seed выше.");
  config.seed = code.seed;
  $("seed").value = seedCode(KIND, config.seed);
  config.horizon = $("horizon").checked;
  config.bayerTest = $("bayer-test").checked;
  config.edges = $("edges").checked;
  if (config.projection === "gnomonic" && config.fov > 150) {
    config.fov = 150;
    $("fov").value = 150;
    toast("Поле гномонической проекции ограничено 150°.");
  }
  config.maps = [1, 2, 3].map((index) => ({
    randomCenter: $(`map-${index}-random-center`).checked,
    shape: $(`map-${index}-shape`).value,
    aspect: Number($(`map-${index}-aspect`).value),
    projection: $(`map-${index}-projection`).value,
    fov: Number($(`map-${index}-fov`).value),
    ra: $(`map-${index}-random-center`).checked ? (variant?.base.maps[index - 1].ra ?? DEFAULT_CONFIG.maps[index - 1].ra) : Number($(`map-${index}-ra`).value) * 15,
    dec: $(`map-${index}-random-center`).checked ? (variant?.base.maps[index - 1].dec ?? DEFAULT_CONFIG.maps[index - 1].dec) : Number($(`map-${index}-dec`).value),
    roll: Number($(`map-${index}-roll`).value),
  }));
  return validateConfig(config);
}
function writeConfig(config) {
  for (const id of numericFields) {
    const value =
      id === "ra"
        ? config.ra / 15
        : id === "star-count"
          ? config.starCount
          : id === "count"
            ? config.messierCount
            : id === "star-size"
              ? config.starSize
              : config[id];
    $(id).value = value;
  }
  for (const id of ["frame", "projection", "level", "display", "seed"])
    $(id).value = config[id];
  $("date").value = config.date.replace("Z", "");
  for (const [id, key] of [
    ["horizon", "horizon"],
    ["bayer-test", "bayerTest"],
    ["edges", "edges"],
  ])
    $(id).checked = config[key];
  config.maps?.forEach((map, index) => {
    $(`map-${index + 1}-random-center`).checked = map.randomCenter !== false;
    for (const key of [
      "shape",
      "aspect",
      "projection",
      "fov",
      "ra",
      "dec",
      "roll",
    ])
      $(`map-${index + 1}-${key}`).value =
        key === "ra" ? map.ra / 15 : map[key];
  });
  $("variant-seed").value = seedCode(KIND, config.seed);
  $("seed").value = seedCode(KIND, config.seed);
  for (const [index, map] of (config.maps || []).entries()) {
    for (const key of ["ra", "dec"]) $(`map-${index + 1}-${key}`).readOnly = map.randomCenter !== false;
    if (map.randomCenter !== false && variant?.seed === config.seed) {
      const [ra, dec] = coordinates(projector(variant.configs[index]).basis.forward);
      $(`map-${index + 1}-ra`).value = (ra / 15).toFixed(5);
      $(`map-${index + 1}-dec`).value = dec.toFixed(5);
    }
  }
  updateFrame();
}
function updateFrame() {
  const horizon = $("frame").value === "horizon";
  document.querySelectorAll(".eq-field").forEach((e) => (e.hidden = horizon));
  document.querySelectorAll(".hor-field").forEach((e) => (e.hidden = !horizon));
}
function tolerance() {
  if (isExam) return EXAM_TOLERANCE;
  return Math.max(
    0.3,
    (state.config.fov / 30) * LEVELS[state.config.level].tolerance,
  );
}

function updateVariantUrl() {
  if (!variant) return;
  const url = variantUrl(
    currentSiteUrl(),
    variant.base,
    state.mode,
  );
  globalThis.history?.replaceState(null, "", url);
  $("variant-link").href = url;
}
function updateVariantSummary() {
  if (!variant) return;
  const summary = variantSummary(variant);
  $("variant-number").textContent = seedCode(KIND, variant.seed);
  $("variant-total").textContent = `${summary.points} / ${summary.maximum}`;
  $("variant-status").textContent = isExam ? (summary.complete ? "Экзамен завершён · ответы открыты для разбора" : "Ответы ещё не проверены · результат появится после завершения") : summary.complete
    ? "Все задания проверены"
    : `Проверено ${summary.rows.filter((r) => r.checked).length} из 5 заданий`;
  $("variant-scores").innerHTML = summary.rows
    .map(
      (row) =>
        `<div><span>${row.label}</span><strong>${row.checked ? row.points : "—"} / ${row.maximum}</strong></div>`,
    )
    .join("");
  if (isExam) {
    $("check-variant").disabled = summary.complete;
    $("export-answers").disabled = !summary.complete;
    $("exam-name").value = variant.participantName || "";
    $("exam-name").disabled = summary.complete;
    $("catalog-nav").disabled = !summary.complete;
    $("clear").disabled = summary.complete;
  }
}
function switchMode(mode) {
  if (!variant || (isExam && mode === "sandbox")) return;
  const fullscreenResult = document.querySelector("[data-fullscreen-result]");
  if (fullscreenResult) fullscreenResult.textContent = "";
  state.pending = null;
  if (mode === "sandbox") {
    freeAttempt ||= {
      mode: "sandbox",
      config: { ...variant.configs[2] },
      targets: [],
      answers: {},
      selected: 0,
      checked: false,
      strokes: [],
      pending: null,
      entries: [],
      sandboxType: $("sandbox-type").value,
    };
    state = freeAttempt;
  } else state = variant.attempts[mode];
  projection = projector(state.config);
  results = [];
  drawing = null;
  draggingMark = null;
  sky.classList.remove("dragging-point");
  $("results").hidden = true;
  $("grid").checked = false;
  $("guides").checked = false;
  renderAll();
  if (state.checked) checkAnswer(false);
  updateVariantSummary();
  updateVariantUrl();
  save();
}
function newTask(changeSeed = false, supplied = null) {
  try {
    if (changeSeed) $("seed").value = numericSeed();
    const config = supplied ? validateConfig(supplied) : readConfig();
    const mode = state.mode;
    variant = isExam ? createExam(catalog, config.seed) : createVariant(catalog, config);
    freeAttempt = null;
    writeConfig(variant.base);
    learned = false;
    switchMode(mode);
    toast(
      `Seed ${seedCode(KIND, variant.seed)} создан: ${variant.attempts.stars.targets.length} звезда, ${variant.attempts.messier.targets.length} объекта Мессье.`,
    );
  } catch (error) {
    toast(error.message);
  }
}
function storeModeScore(mode, modeResults, line, record = true) {
  if (!variant || mode === "sandbox" || isExam) return;
  if (mode === "reference") {
    variant.scores.points = modeResults
      .filter((r) => !r.target.id.startsWith("edge-"))
      .reduce((s, r) => s + r.points, 0);
    variant.scores.edges = modeResults
      .filter((r) => r.target.id.startsWith("edge-"))
      .reduce((s, r) => s + r.points, 0);
  } else
    variant.scores[mode] = line
      ? line.points
      : modeResults.reduce((s, r) => s + r.points, 0);
  updateVariantSummary();
  const summary = variantSummary(variant);
  if (record) recordProgress({
    id: "T:" + JSON.stringify(variant.base), kind: "T", seed: variant.seed,
    score: summary.points, maximum: summary.maximum,
    label: `Тренажёр · ${summary.rows.filter(row => row.checked).length} из 5 заданий`,
    url: variantUrl(currentSiteUrl(), variant.base, state.mode),
  });
  save();
}
function checkWholeVariant() {
  if (isExam) {
    if (variant.examReport) return;
    variant.participantName = $("exam-name").value.trim();
    variant.examReport = gradeExam(variant, catalog);
    for (const attempt of Object.values(variant.attempts)) attempt.checked = true;
    const summary = variant.examReport;
    recordProgress({ id: "E:" + variant.seed, kind: "E", seed: variant.seed, score: summary.points, maximum: 120, label: "Экзамен · 5 заданий", url: variantUrl(currentSiteUrl(), variant.base, state.mode) });
    switchMode(state.mode);
    $("variant-summary").scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const active = state.mode;
  for (const mode of ["reference", "stars", "messier", "lines"]) {
    state = variant.attempts[mode];
    projection = projector(state.config);
    state.checked = true;
    const r = calculateResults(),
      line =
        mode === "lines"
          ? scoreDrawing(state.targets, state.strokes, tolerance())
          : null;
    storeModeScore(mode, r, line);
  }
  switchMode(active);
  $("variant-summary").scrollIntoView({ behavior: "smooth", block: "center" });
}
async function copyVariantLink() {
  const url = variantUrl(
    currentSiteUrl(),
    variant.base,
    state.mode,
  );
  try {
    await navigator.clipboard.writeText(url);
    toast("Ссылка на seed скопирована.");
  } catch {
    openDialog(
      `<h2>Ссылка на seed</h2><p>Seed и все настройки включены в ссылку.</p><input aria-label="Ссылка на seed" readonly value="${escape(url)}">`,
    );
  }
}

async function drawBase() {
  sky.height = marks.height = mapHeight(SIZE, state.config);
  $("map-stage").classList.toggle(
    "rectangular",
    state.config.shape === "rectangle",
  );
  $("map-stage").style.aspectRatio =
    state.config.shape === "rectangle"
      ? String(state.config.aspect || 1.6)
      : "1";
  const config = { ...state.config },
    started = performance.now();
  baseImage = null;
  const completed = await renderer.render(sky, catalog, config, (status) => {
    $("render-status").textContent = status;
  });
  if (!completed) return;
  baseImage = context.getImageData(0, 0, SIZE, sky.height);
  $("render-status").textContent +=
    ` · ${Math.round(performance.now() - started)} мс`;
  drawGuides();
}
function drawPath(ctx, path, color, width = 1, dash = []) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  let previous = null;
  for (const c of path) {
    const p = projection.project(...c);
    if (!p) {
      previous = null;
      continue;
    }
    const [x, y] = pixel(p);
    if (previous) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
    previous = [x, y];
  }
  ctx.stroke();
  ctx.setLineDash([]);
}
function drawGuides() {
  if (isExam && !variant.examReport) { $("grid").checked = false; $("guides").checked = false; }
  if (!baseImage) return;
  context.putImageData(baseImage, 0, 0);
  const paper = state.config.display === "paper";
  if ($("grid").checked) {
    for (let ra = 0; ra < 360; ra += 30)
      drawPath(
        context,
        Array.from({ length: 181 }, (_, i) => [ra, i - 90]),
        paper ? "#9998" : "#7ba3ba45",
      );
    for (let dec = -60; dec <= 60; dec += 30)
      drawPath(
        context,
        Array.from({ length: 361 }, (_, i) => [i, dec]),
        paper ? "#9998" : "#7ba3ba45",
      );
    greatCircles().forEach((path, i) =>
      drawPath(
        context,
        path,
        paper ? "#666" : ["#9fc1dd", "#c8c082", "#bb9fc5"][i],
        1,
        [5, 7],
      ),
    );
  }
  if ($("guides").checked && state.mode !== "lines")
    for (const figure of catalog.lines)
      for (const path of figure.paths)
        drawPath(context, path, paper ? "#777" : "#8eb8cb70", 1.3);
}
function marker(ctx, point, label, color, correct = false, target = null) {
  if (!point) return;
  const [x, y] = pixel(point);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  if (target && (state.mode === "reference" || target.kind === "reference")) {
    drawReferenceIcon(ctx, x, y, target, color);
  } else if (state.mode === "messier" || target?.kind === "messier") {
    ctx.moveTo(x, y - 9); ctx.lineTo(x + 8, y + 6); ctx.lineTo(x - 8, y + 6); ctx.closePath();
  } else if (correct || state.mode === "stars") {
    ctx.moveTo(x - 7, y);
    ctx.lineTo(x + 7, y);
    ctx.moveTo(x, y - 7);
    ctx.lineTo(x, y + 7);
  } else ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.stroke();
  if (!label) return;
  ctx.font = "500 17px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  const width = ctx.measureText(label).width,
    boxes = labelBoxes.get(ctx) || [];
  let tx, ty;
  for (const [dx, dy] of [
    [12, -9],
    [12, 30],
    [-width - 12, -9],
    [-width - 12, 30],
    [12, -38],
    [12, 58],
  ]) {
    tx = clamp(x + dx, 8, SIZE - width - 8);
    ty = clamp(y + dy, 25, marks.height - 10);
    if (
      !boxes.some(
        (b) =>
          tx < b.x + b.width + 5 &&
          tx + width + 5 > b.x &&
          ty - 22 < b.y + b.height + 4 &&
          ty + 4 > b.y,
      )
    )
      break;
  }
  boxes.push({ x: tx, y: ty - 22, width, height: 26 });
  labelBoxes.set(ctx, boxes);
  ctx.fillStyle = state.config.display === "paper" ? "#ffffffed" : "#09131ee0";
  ctx.fillRect(tx - 3, ty - 19, width + 6, 24);
  ctx.fillStyle = color;
  ctx.fillText(label, tx, ty);
}
function pair(user, correct, label, target = null) {
  if (user && correct) {
    const a = pixel(user),
      b = pixel(correct);
    overlay.strokeStyle =
      state.config.display === "paper" ? "#666" : "#cbd3c57f";
    overlay.lineWidth = 1.7;
    overlay.setLineDash([5, 6]);
    overlay.beginPath();
    overlay.moveTo(...a);
    overlay.lineTo(...b);
    overlay.stroke();
    overlay.setLineDash([]);
  }
  if (user) marker(overlay, user, label, "#e19759", false, target);
  if (correct)
    marker(
      overlay,
      correct,
      label,
      state.config.display === "paper" ? "#216342" : "#d5ec95",
      true,
      target,
    );
}
function drawMarks() {
  overlay.clearRect(0, 0, SIZE, marks.height);
  labelBoxes.set(overlay, []);
  if (state.mode === "lines") {
    for (const stroke of state.strokes)
      drawPath(overlay, stroke.points, "#eaa46f", 3);
    if (drawing?.coordinates.length)
      drawPath(overlay, drawing.coordinates, "#ffb480", 3);
    if (state.pending)
      marker(overlay, projection.project(...state.pending), "", "#ffb480");
    if (state.checked)
      for (const segment of state.targets)
        drawPath(
          overlay,
          [segment.a, segment.b],
          state.config.display === "paper" ? "#216342" : "#d5ec95",
          2,
          [6, 5],
        );
    return;
  }
  if (state.mode === "sandbox") {
    state.entries.forEach((entry, i) => {
      const r = results[i],
        correct =
          state.checked && r?.target
            ? projection.project(r.target.ra, r.target.dec)
            : null;
      pair(projection.project(entry.ra, entry.dec), correct, entry.label || entry.name, results[i]?.target || (entry.kind === "reference" ? resolveObject(catalog, "reference", entry.name, state.config)[0] : null));
    });
    if (state.pending)
      marker(overlay, projection.project(...state.pending), "?", "#ffb480");
    return;
  }
  state.targets.forEach((target, index) => {
    const answer = state.answers[target.id],
      expected = state.checked ? results[index]?.expected || target : target;
    const user =
      answer && !answer.absent && !answer.draft
        ? projection.project(answer.ra, answer.dec)
        : null;
    pair(
      user,
      state.checked ? projection.project(expected.ra, expected.dec) : null,
      state.mode === "reference" ? "" : state.mode === "messier" ? target.name : String(index + 1),
      target,
    );
  });
}
function renderObjects() {
  const active = state.targets[state.selected];
  $("active-object").textContent = ["messier", "stars", "reference"].includes(
    state.mode,
  )
    ? active
      ? `Сейчас отмечаем: ${active.name}`
      : "На этом уровне нет подходящих объектов"
    : state.mode === "sandbox"
      ? "Свободные подписи на карте"
      : "Рисование созвездий";
  const list = $("objects");
  list.replaceChildren();
  list.hidden = ["lines", "sandbox"].includes(state.mode);
  $("line-tools").hidden = state.mode !== "lines";
  $("sandbox-tools").hidden = state.mode !== "sandbox";
  $("guides").disabled = state.mode === "lines" || (isExam && !variant.examReport);
  if (state.mode === "sandbox") {
    renderEntries();
    return;
  }
  if (state.mode === "lines") return;
  state.targets.forEach((target, index) => {
    const answer = state.answers[target.id],
      row = document.createElement("div");
    row.className =
      "object-row" + (state.selected === index ? " selected" : "");
    const select = document.createElement("button");
    select.className = "object-select";
    if (state.mode === "reference") row.classList.add("reference-row");
    select.setAttribute("aria-pressed", String(state.selected === index));
    select.innerHTML = `<span class="object-number">${state.mode === "reference" ? referenceSymbol(target) : String(index + 1).padStart(2, "0")}</span><span class="object-name">${escape(target.name)}</span><span class="object-state">${answer && !answer.draft ? (answer.absent ? "—" : "✓") : ""}</span>`;
    select.onclick = () => {
      state.selected = index;
      renderObjects();
      save();
      if (globalThis.matchMedia?.("(max-width: 760px)").matches)
        sky.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    row.append(select);
    if (["stars", "messier"].includes(state.mode) && (!isExam || variant.examReport)) {
      const info = document.createElement("button");
      info.className = "object-info";
      info.textContent = "ⓘ";
      info.setAttribute("aria-label", `Каталог: ${target.name}`);
      info.onclick = () => {
        learned = true;
        $("difficulty").textContent = "С ПОДСКАЗКОЙ КАТАЛОГА";
        atlas.detail(target);
      };
      row.append(info);
    }
    const absent = document.createElement("button");
    absent.className = "absent";
    absent.textContent = "Вне карты";
    absent.setAttribute("aria-pressed", String(Boolean(answer?.absent)));
    absent.disabled = state.checked;
    absent.onclick = () => {
      if (answer?.absent) delete state.answers[target.id];
      else state.answers[target.id] = { absent: true };
      advance();
      updateAnswer();
    };
    row.append(absent);
    if (state.mode === "stars" && state.config.bayerTest) {
      const input = document.createElement("input");
      input.className = "bayer-answer";
      input.placeholder = "Байер: α Ori";
      input.setAttribute("aria-label", `Обозначение Байера: ${target.name}`);
      input.value = answer?.bayer || "";
      input.disabled = state.checked;
      input.oninput = () => {
        const previous = state.answers[target.id];
        state.answers[target.id] = {
          ...previous,
          bayer: input.value,
          draft: !previous || previous.draft,
        };
        save();
      };
      const controls = document.createElement("div");
      controls.className = "bayer-editor";
      const greek = document.createElement("select");
      greek.setAttribute("aria-label", `Вставить греческую букву: ${target.name}`);
      greek.innerHTML = '<option value="">Буква…</option>' + GREEK_LETTERS.map(([symbol, name]) => `<option value="${symbol}">${symbol} · ${name}</option>`).join("");
      greek.disabled = state.checked;
      greek.onchange = () => {
        if (!greek.value) return;
        input.value = greek.value + " " + input.value.replace(/^[α-ω]\s*/, "");
        input.oninput(); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
      };
      controls.append(greek, input);
      row.append(controls);
    }
    list.append(row);
  });
}
function pointOptions(select, selected) {
  select.replaceChildren();
  for (const [label, edge] of [["Равноденствия, солнцестояния и опорные точки", false], ["Пересечения с краем этой карты", true]]) {
    const group = document.createElement("optgroup");
    group.label = label;
    for (const point of sandboxPoints(state.config).filter(item => item.id.startsWith("edge-") === edge)) {
      const option = document.createElement("option");
      option.value = point.id;
      option.textContent = point.name;
      group.append(option);
    }
    if (group.children.length) select.append(group);
  }
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}
function sandboxInput() {
  return state.sandboxType === "bayer" ? $("sandbox-constellation") : state.sandboxType === "reference" ? $("sandbox-point") : $("sandbox-name");
}
function renderEntries() {
  const list = $("sandbox-entries");
  list.replaceChildren();
  $("sandbox-name-label").hidden = ["bayer", "reference"].includes(state.sandboxType);
  $("sandbox-bayer-fields").hidden = state.sandboxType !== "bayer";
  $("sandbox-point-label").hidden = state.sandboxType !== "reference";
  pointOptions($("sandbox-point"), $("sandbox-point").value);
  for (const id of ["sandbox-type", "sandbox-name", "sandbox-greek", "sandbox-index", "sandbox-constellation", "sandbox-point"])
    $(id).disabled = state.checked;
  $("sandbox-input-help").textContent = state.sandboxType === "bayer"
    ? "Созвездие впиши самостоятельно: Лира, Лиры, Lyra, Lyrae или Lyr. Индекс нужен только для обозначений вроде π3 Ori."
    : state.sandboxType === "reference"
      ? "Выбери точку по названию. Пересечения с краем рассчитываются для текущей карты; их координаты не подсказываются."
      : "Принимаются русские и английские имена, номера Мессье и запись Байера словами, например альфа Лиры.";
  $("sandbox-location").textContent = state.pending
    ? `RA ${(state.pending[0] / 15).toFixed(3)}h · Dec ${state.pending[1].toFixed(2)}°`
    : "Сначала выбери точку на карте.";
  $("sandbox-add").disabled = state.checked || !state.pending;
  $("sandbox-name").disabled = state.checked;
  if (!state.entries.length) {
    const p = document.createElement("p");
    p.className = "fine";
    p.textContent = "Здесь появятся твои подписи.";
    list.append(p);
  }
  state.entries.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "sandbox-entry";
    const isPoint = entry.kind === "reference";
    const input = document.createElement(isPoint ? "select" : "input");
    if (isPoint) pointOptions(input, entry.targetId);
    else input.value = entry.name;
    input.maxLength = 60;
    input.disabled = state.checked;
    input.setAttribute("aria-label", `Имя отметки ${index + 1}`);
    input.onchange = () => {
      const point = isPoint ? sandboxPoints(state.config).find(item => item.id === input.value) : null;
      entry.name = point ? point.name : input.value.trim();
      entry.label = point?.shortName;
      const found = resolveObject(catalog, entry.kind || state.sandboxType, entry.name, state.config);
      entry.targetId = found.length === 1 ? found[0].id : null;
      drawMarks();
      save();
    };
    const remove = document.createElement("button");
    remove.className = "icon-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Удалить отметку ${index + 1}`);
    remove.disabled = state.checked;
    remove.onclick = () => {
      state.entries.splice(index, 1);
      updateAnswer();
    };
    row.append(input, remove);
    list.append(row);
  });
}
function addEntry() {
  if (!state.pending || state.checked) return;
  let name = $("sandbox-name").value.trim();
  const point = state.sandboxType === "reference" ? sandboxPoints(state.config).find(item => item.id === $("sandbox-point").value) : null;
  try {
    if (state.sandboxType === "bayer") name = bayerLabel($("sandbox-greek").value, $("sandbox-index").value, $("sandbox-constellation").value);
    if (point) name = point.name;
  } catch (error) { toast(error.message); sandboxInput().focus(); return; }
  if (!name) {
    sandboxInput().focus();
    return;
  }
  if (state.entries.length >= 60) {
    toast("До 60 подписей на одном снимке.");
    return;
  }
  const kind = state.sandboxType === "bayer" ? "stars" : state.sandboxType;
  const found = resolveObject(catalog, kind, name, state.config);
  state.entries.push({
    kind,
    name,
    label: point?.shortName,
    ra: state.pending[0],
    dec: state.pending[1],
    targetId: found.length === 1 ? found[0].id : null,
  });
  state.pending = null;
  $("sandbox-name").value = "";
  updateAnswer();
}
function advance() {
  for (let step = 1; step <= state.targets.length; step++) {
    const index = (state.selected + step) % state.targets.length;
    if (
      !state.answers[state.targets[index].id] ||
      state.answers[state.targets[index].id].draft
    ) {
      state.selected = index;
      break;
    }
  }
}
function updateAnswer() {
  renderObjects();
  updateProgress();
  drawMarks();
  save();
}
function updateProgress() {
  const done =
    state.mode === "lines"
      ? state.strokes.length
      : state.mode === "sandbox"
        ? state.entries.length
        : Object.values(state.answers).filter((a) => !a.draft).length;
  const percentage = ["lines", "sandbox"].includes(state.mode)
    ? 0
    : Math.round((done / Math.max(1, state.targets.length)) * 100);
  $("completion-text").textContent =
    state.mode === "lines"
      ? `Штрихов: ${done}`
      : state.mode === "sandbox"
        ? `Подписей: ${done}`
        : `Отмечено ${done} из ${state.targets.length}`;
  $("completion-percent").textContent = ["lines", "sandbox"].includes(
    state.mode,
  )
    ? "✧"
    : percentage + "%";
  $("completion-bar").style.width = percentage + "%";
  $("check").disabled = isExam || state.checked;
  $("check").textContent = isExam ? (variant.examReport ? "Экзамен проверен ✓" : "Проверка всех заданий — в конце") : state.checked
    ? "Ответ проверен ✓"
    : "Проверить ответ ↗";
  $("scoring-hint").textContent = isExam ? "Экзамен · общий результат из 120 · допуск 4°" :
    state.mode === "lines"
      ? "Оцениваем полноту и точность штрихов"
      : state.mode === "sandbox"
        ? "Проверяются подписи и положения · повторы не засчитываются"
        : `До 100 очков за объект · допуск ${tolerance().toFixed(1)}°`;
}
function renderAll() {
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.mode === state.mode)),
    );
  $("task-title").innerHTML = titles[state.mode][0];
  $("task-description").textContent = titles[state.mode][1];
  $("level-description").textContent = LEVELS[state.config.level].description;
  $("difficulty").textContent = LEVELS[state.config.level].label.toUpperCase();
  const names = {
    stereo: "СТЕРЕОГРАФИЧЕСКАЯ",
    equidistant: "РАВНОПРОМЕЖУТОЧНАЯ",
    orthographic: "ОРТОГРАФИЧЕСКАЯ",
    gnomonic: "ГНОМОНИЧЕСКАЯ",
  };
  $("view-label").textContent =
    `${names[state.config.projection]} · ${state.config.fov}°`;
  $("variant-label").textContent = seedCode(KIND, state.config.seed);
  $("observer-label").textContent =
    state.config.frame === "horizon"
      ? `${state.config.latitude}° / ${state.config.longitude}° · UTC`
      : `RA ${(state.config.ra / 15).toFixed(2)}h · DEC ${state.config.dec}°`;
  $("map-tip").textContent =
    state.mode === "sandbox"
      ? "Нажми на карту, затем введи подпись."
      : state.mode === "lines"
        ? "Веди по звёздам мышью, пальцем или стилусом."
        : "Нажми, чтобы поставить точку. Зажми любую поставленную точку и перетащи, чтобы поправить.";
  $("sandbox-type").value = state.sandboxType;
  const [ra, dec] = coordinates(projection.basis.forward);
  for (const [name, direction, sign] of [
    ["north", vector(ra + 180, 90 - dec), 1],
    ["south", vector(ra + 180, 90 - dec), -1],
    ["east", vector(ra + 90, 0), 1],
    ["west", vector(ra + 90, 0), -1],
  ]) {
    const x = dot(direction, projection.basis.right) * sign,
      y = -dot(direction, projection.basis.up) * sign,
      norm = Math.hypot(x, y) || 1,
      label = document.querySelector(`.compass.${name}`);
    const rectangular = state.config.shape === "rectangle";
    const aspect = state.config.aspect || 1.6;
    const ray = rectangular
      ? Math.min(
          1 / Math.max(1e-9, Math.abs(x)),
          1 / aspect / Math.max(1e-9, Math.abs(y)),
        )
      : 1 / norm;
    Object.assign(label.style, {
      left: `${50 + 48.5 * x * ray}%`,
      top: `${50 + 48.5 * y * ray * (rectangular ? aspect : 1)}%`,
      bottom: "auto",
      right: "auto",
      transform: "translate(-50%,-50%)",
    });
  }
  renderObjects();
  updateProgress();
  renderPromise = drawBase();
  drawMarks();
}
function normalizedEvent(event) {
  const [x, y] = canvasPoint(sky, event);
  return [(x - CENTER) / RADIUS, (y - marks.height / 2) / RADIUS];
}
function eventCoordinate(event) {
  return projection.inverse(...normalizedEvent(event));
}
function place(coordinate, focusInput = true) {
  if (!coordinate || state.checked) return;
  if (state.mode === "sandbox") {
    state.pending = coordinate;
    updateAnswer();
    if (focusInput) sandboxInput().focus({ preventScroll: true });
    return;
  }
  if (state.mode === "lines") {
    if (!state.pending) state.pending = coordinate;
    else {
      if (angularDistance(state.pending, coordinate) > 0.1)
        state.strokes.push({ points: [state.pending, coordinate] });
      state.pending = null;
    }
  } else {
    const target = state.targets[state.selected];
    if (!target) return;
    state.answers[target.id] = {
      ra: coordinate[0],
      dec: coordinate[1],
      bayer: state.answers[target.id]?.bayer || "",
    };
    advance();
  }
  updateAnswer();
}
function placedMark(event) {
  if (state.mode === "lines") return null;
  const items = state.mode === "sandbox" ? state.entries : Object.values(state.answers);
  const rect = sky.getBoundingClientRect();
  const scale = Math.hypot(rect.width, rect.height) / Math.hypot(sky.width, sky.height);
  const radius = (event.pointerType === "touch" ? 22 : 12) / Math.max(0.01, scale) / RADIUS;
  return nearestPlacedPoint(items, normalizedEvent(event), (ra, dec) => projection.project(ra, dec), radius);
}
function pointerDown(event) {
  if (event.pointerType === "pen") lastPenContact = performance.now();
  if (event.pointerType === "touch" && performance.now() - lastPenContact < 800)
    return;
  if ((drawing && drawing.id !== event.pointerId) || draggingMark) return;
  if (event.isPrimary === false || state.checked) return;
  event.preventDefault();
  sky.focus({ preventScroll: true });
  const coordinate = eventCoordinate(event);
  if (!coordinate) return;
  const mark = placedMark(event);
  if (mark) {
    draggingMark = { id: event.pointerId, mark, original: { ra: mark.ra, dec: mark.dec } };
    sky.setPointerCapture?.(event.pointerId);
    sky.classList.add("dragging-point");
    return;
  }
  if (
    state.mode === "lines" &&
    ($("draw-tool").value === "freehand" || event.pointerType === "pen")
  ) {
    sky.setPointerCapture?.(event.pointerId);
    drawing = {
      id: event.pointerId,
      screen: [normalizedEvent(event)],
      coordinates: [coordinate],
    };
    state.pending = null;
    drawMarks();
  } else place(coordinate, event.pointerType !== "touch" || !sky.closest(".fullscreen-shell"));
}
function pointerMove(event) {
  const c = eventCoordinate(event);
  $("cursor-coords").textContent = c
    ? `RA ${(c[0] / 15).toFixed(2)}h · DEC ${c[1].toFixed(1)}°`
    : "ВНЕ СНИМКА";
  if (draggingMark?.id === event.pointerId) {
    if (c) { draggingMark.mark.ra = c[0]; draggingMark.mark.dec = c[1]; drawMarks(); }
    event.preventDefault();
    return;
  }
  if (!drawing || drawing.id !== event.pointerId) return;
  const coalesced = event.getCoalescedEvents?.();
  for (const sample of coalesced?.length ? coalesced : [event]) {
    const screen = normalizedEvent(sample),
      coordinate = projection.inverse(...screen);
    if (!coordinate) {
      pointerUp(event);
      return;
    }
    const last = drawing.screen.at(-1);
    if (Math.hypot(screen[0] - last[0], screen[1] - last[1]) < 0.004) continue;
    drawing.screen.push(screen);
    drawing.coordinates.push(coordinate);
  }
  drawMarks();
}
function pointerUp(event) {
  if (draggingMark?.id === event.pointerId) {
    draggingMark = null;
    sky.classList.remove("dragging-point");
    if (sky.hasPointerCapture?.(event.pointerId)) sky.releasePointerCapture(event.pointerId);
    updateAnswer();
    return;
  }
  if (!drawing || drawing.id !== event.pointerId) return;
  if (drawing.screen.length > 1) {
    const simplified = simplifyStroke(drawing.screen, 0.004),
      points = simplified.map((p) => projection.inverse(...p)).filter(Boolean);
    if (points.length > 1) state.strokes.push({ points });
  }
  drawing = null;
  if (sky.hasPointerCapture?.(event.pointerId))
    sky.releasePointerCapture(event.pointerId);
  updateAnswer();
}
function calculateResults() {
  if (state.mode === "sandbox")
    return scoreSandbox(
      state.entries,
      catalog,
      state.sandboxType,
      projection,
      tolerance(),
      state.config,
    );
  if (state.mode === "lines") return [];
  const used = new Set();
  return state.targets.map((target) => {
    const answer = state.answers[target.id];
    let expected = target;
    if (
      target.id.startsWith("edge-") &&
      answer &&
      !answer.absent &&
      !answer.draft
    ) {
      const family = target.id.split("-")[1],
        candidates = state.targets.filter(
          (t) => t.id.startsWith(`edge-${family}-`) && !used.has(t.id),
        );
      candidates.sort(
        (a, b) =>
          angularDistance([a.ra, a.dec], [answer.ra, answer.dec]) -
          angularDistance([b.ra, b.dec], [answer.ra, answer.dec]),
      );
      if (candidates.length) {
        expected = candidates[0];
        used.add(expected.id);
      }
    }
    const result = scoreAnswer(
      expected,
      answer?.draft ? null : answer,
      projection,
      tolerance(),
    );
    if (
      state.mode === "stars" &&
      state.config.bayerTest &&
      result.visible &&
      answer &&
      !answer.absent &&
      !answer.draft
    ) {
      const correct = bayerMatches(answer.bayer, target.bayer, catalog);
      result.points = Math.round(result.points * 0.8 + (correct ? 20 : 0));
      result.reason += correct ? " · Байер ✓" : ` · Байер: ${target.bayer}`;
    }
    return { ...result, target, expected };
  });
}
function checkAnswer(record = true) {
  if (isExam) {
    if (!variant.examReport) return;
    const report = variant.examReport;
    results = report.details[state.mode] || [];
    const row = report.rows.find(row => row.id === state.mode);
    const score = state.mode === "reference" ? report.rows[0].points + report.rows[1].points : row.points;
    const maximum = state.mode === "reference" ? 24 : row.maximum;
    $("results").innerHTML = `<p class="eyebrow">ЭКЗАМЕН · РАЗБОР</p><h2>${score} / ${maximum} баллов</h2><p>Итог экзамена: ${report.points} / 120. Оранжевые отметки — твои; зелёные — правильные. Пунктир показывает смещение.</p>` + (state.mode === "lines" ? `<p>Полнота рисунка: ${Math.round(report.drawing.coverage * 100)}%. Точность: ${Math.round(report.drawing.precision * 100)}%.</p>` : `<div class="table-scroll"><table><thead><tr><th>Объект</th><th>Результат</th><th>Баллы</th></tr></thead><tbody>${results.map(r => `<tr><td>${escape(r.target.name)}</td><td>${escape(r.reason)}</td><td>${r.points} / ${r.maximum}</td></tr>`).join("")}</tbody></table></div>`);
    $("results").hidden = false;
    const fullscreenResult = document.querySelector("[data-fullscreen-result]");
    if (fullscreenResult) fullscreenResult.textContent = `${score} / ${maximum} баллов`;
    updateAnswer();
    return;
  }
  if (state.mode === "sandbox" && !state.entries.length) {
    toast("Сначала добавь хотя бы одну подпись.");
    return;
  }
  state.checked = true;
  state.pending = null;
  drawing = null;
  results = calculateResults();
  const line =
    state.mode === "lines"
      ? scoreDrawing(state.targets, state.strokes, tolerance())
      : null;
  const score = line
      ? line.points
      : results.reduce((sum, r) => sum + r.points, 0),
    maximum = line ? 100 : results.length * 100,
    percent = Math.round((score / Math.max(1, maximum)) * 100);
  const fullscreenResult = document.querySelector("[data-fullscreen-result]");
  if (fullscreenResult) fullscreenResult.textContent = `${score} / ${maximum} баллов`;
  $("results").innerHTML =
    `<div class="results-top"><div><p class="eyebrow">РАЗБОР ЗАДАНИЯ</p><h3>${percent >= 85 ? "Небо становится знакомым" : "Ориентир для следующей попытки"}</h3><p>Seed ${escape(seedCode(KIND, state.config.seed))} · ${LEVELS[state.config.level].label}${learned ? " · каталог использован как подсказка" : ""}</p></div><div class="score">${score}<span style="font-size:14px;color:#92a1aa"> / ${maximum}</span></div></div><div class="legend"><span class="user">○ Твой ответ</span><span class="correct">＋ Правильный ответ</span><span>┄ Смещение</span></div>${line ? `<p>Полнота рисунка: ${Math.round(line.coverage * 100)}%. Точность штрихов: ${Math.round(line.precision * 100)}%. Пропуски и лишние линии снижают оценку; направление штриха не влияет.</p>` : `<div class="table-scroll"><table><thead><tr><th>Объект</th><th>Результат</th><th>Очки</th></tr></thead><tbody>${results.map((r, i) => `<tr><td>${r.target ? `<button class="subtle result-object" data-result="${i}">${escape(r.target.name)} ⓘ</button>` : escape(r.entry?.name || "—")}${r.target?.bayer ? `<br> <span class="mono">${escape(r.target.bayer)}</span>` : ""}</td><td>${escape(r.reason)}</td><td>${r.points} / 100</td></tr>`).join("")}</tbody></table></div><p>Допуск ${tolerance().toFixed(1)}°. Верное отсутствие — 100 очков; пропуск — 0. Повтор одной подписи в песочнице не засчитывается.</p>`}<button class="secondary" id="retry">Повторить задания</button>`;
  $("results").hidden = false;
  $("retry").onclick = clearAnswers;
  document
    .querySelectorAll("[data-result]")
    .forEach(
      (button) =>
        (button.onclick = () => {
          const target = results[Number(button.dataset.result)].target;
          if (target.kind === "reference") openDialog(`<h2>${escape(target.name)}</h2><p>RA ${(target.ra / 15).toFixed(3)}h · Dec ${target.dec.toFixed(2)}°. Положение J2000; пересечения с краем зависят от выбранной карты.</p>`);
          else atlas.detail(target);
        }),
    );
  storeModeScore(state.mode, results, line, record);
  updateAnswer();
  if (record) {
    if (state.mode === "sandbox") recordProgress({
      id: "sandbox:" + JSON.stringify(state.config), kind: "T", seed: state.config.seed,
      score, maximum, label: "Песочница",
      url: variantUrl(currentSiteUrl(), variant.base, "sandbox"),
    });
    $("results").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}
function clearAnswers() {
  if (isExam && variant.examReport) return;
  state.answers = {};
  state.strokes = [];
  state.entries = [];
  state.pending = null;
  state.checked = false;
  state.selected = 0;
  results = [];
  drawing = null;
  $("results").hidden = true;
  if (variant) {
    for (const key of state.mode === "reference"
      ? ["points", "edges"]
      : [state.mode])
      delete variant.scores[key];
    updateVariantSummary();
  }
  updateAnswer();
}
async function exportPdf(answer = false) {
  if (isExam && answer && !variant.examReport) return;
  const buttons = [$("export-pdf"), $("export-answers")];
  buttons.forEach((b) => (b.disabled = true));
  try {
    await nextFrame();
    const packet = makePacket(
        catalog,
        state,
        $("pdf-scope").value === "full",
        variant,
      ),
      bytes = await renderPacket(packet, catalog, answer);
    downloadBlob(
      new Blob([bytes], { type: "application/pdf" }),
      `nightweave-${state.config.seed}-${answer ? "answers" : "tasks"}.pdf`,
    );
    toast(
      answer
        ? "Скачан отдельный PDF с ответами."
        : "Скачан PDF с заданиями, без ответов.",
    );
  } catch (error) {
    toast("Не удалось создать PDF: " + error.message);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
    updateVariantSummary();
  }
}
function snapshot() {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = marks.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sky, 0, 0);
  ctx.drawImage(marks, 0, 0);
  canvas.toBlob((blob) => downloadBlob(blob, "nightweave-snapshot.png"));
}
function showHistory() { showProgress(openDialog); }
function bindEvents() {
  if (isExam) {
    $("exam-name").oninput = () => { if (variant && !variant.examReport) { variant.participantName = $("exam-name").value; save(); } };
    document.querySelector('[data-mode="sandbox"]').hidden = true;
    $("settings-toggle").hidden = true;
    $("level").closest("label").hidden = true;
    $("level-description").hidden = true;
    for (const id of ["level", "bayer-test", "star-count", "count", "grid", "guides", "random-view", "apply"]) $(id).disabled = true;
    $("pdf-scope").value = "full";
    $("pdf-scope").disabled = true;
  }
  for (const index of [1, 2, 3]) $(`map-${index}-random-center`).onchange = () => {
    for (const key of ["ra", "dec"]) $(`map-${index}-${key}`).readOnly = $(`map-${index}-random-center`).checked;
  };
  $("expand-map").onclick = () => openFullscreen({
    content: document.querySelector(".lab-body"), stage: $("map-stage"), canvas: sky,
    title: isExam ? "Экзамен" : "Тренажёр неба", navigation: document.querySelector(".tabs"), settings: isExam ? undefined : $("settings"),
    canStartGesture: () => performance.now() - lastPenContact >= 800,
    onSingleTouchEnd: () => {
      if (state.mode === "sandbox" && state.pending && !state.checked && !draggingMark) sandboxInput().focus({ preventScroll: true });
    },
    captureInteraction: () => {
      const attempt = state;
      const before = structuredClone({ answers: state.answers, selected: state.selected, pending: state.pending, strokes: state.strokes, entries: state.entries });
      return () => {
        if (state !== attempt) return;
        drawing = null;
        draggingMark = null;
        sky.classList.remove("dragging-point");
        Object.assign(state, before);
        updateAnswer();
      };
    },
  });
  $("sandbox-greek").innerHTML = GREEK_LETTERS.map(([symbol, name]) => `<option value="${symbol}">${symbol} · ${name}</option>`).join("");
  $("settings-toggle").onclick = () => {
    $("settings").hidden = !$("settings").hidden;
    $("settings-toggle").setAttribute(
      "aria-expanded",
      String(!$("settings").hidden),
    );
  };
  $("frame").onchange = updateFrame;
  $("apply").onclick = () => newTask();
  $("new-task").onclick = () => newTask(true);
  $("random-view").onclick = () => {
    $("ra").value = (Math.random() * 24).toFixed(2);
    $("dec").value = (Math.asin(Math.random() * 2 - 1) / RAD).toFixed(1);
    $("az").value = Math.floor(Math.random() * 360);
    $("alt").value = Math.floor(15 + Math.random() * 65);
    $("roll").value = Math.floor(Math.random() * 360);
    newTask(true);
  };
  document.querySelectorAll("[data-mode]").forEach(
    (button) =>
      (button.onclick = () => {
        switchMode(button.dataset.mode);
      }),
  );
  $("generate-variant").onclick = () => newTask(true);
  $("load-variant").onclick = () => {
    try {
      const seed = redirectCode($("variant-seed").value, KIND);
      if (seed === null) return;
      $("seed").value = seed;
      newTask();
    } catch (error) { toast(error.message); }
  };
  $("variant-seed").onkeydown = (event) => {
    if (event.key === "Enter") $("load-variant").click();
  };
  $("copy-variant").onclick = copyVariantLink;
  $("check-variant").onclick = checkWholeVariant;
  $("level").onchange = () => newTask();
  $("display").onchange = () => {
    if (!state.config) return;
    variant.base.display = $("display").value;
    for (const attempt of Object.values(variant.attempts))
      attempt.config.display = $("display").value;
    state.config.display = $("display").value;
    updateVariantUrl();
    renderPromise = drawBase();
    drawMarks();
    save();
  };
  $("grid").onchange = drawGuides;
  $("guides").onchange = drawGuides;
  sky.addEventListener("pointerdown", pointerDown);
  sky.addEventListener("pointermove", pointerMove);
  sky.addEventListener("pointerup", pointerUp);
  sky.addEventListener("pointercancel", () => {
    if (draggingMark) Object.assign(draggingMark.mark, draggingMark.original);
    draggingMark = null;
    sky.classList.remove("dragging-point");
    drawing = null;
    save();
    drawMarks();
  });
  sky.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      drawing = null;
      state.pending = null;
      updateAnswer();
    }
    if (["Delete", "Backspace"].includes(event.key) && !state.checked) {
      if (state.mode === "lines") state.strokes.pop();
      else if (state.mode === "sandbox") state.entries.pop();
      else if (state.targets[state.selected])
        delete state.answers[state.targets[state.selected].id];
      updateAnswer();
      event.preventDefault();
    }
    if (
      ["ArrowRight", "ArrowLeft"].includes(event.key) &&
      !["lines", "sandbox"].includes(state.mode)
    ) {
      state.selected =
        (state.selected +
          (event.key === "ArrowRight" ? 1 : -1) +
          state.targets.length) %
        Math.max(1, state.targets.length);
      renderObjects();
      event.preventDefault();
    }
  });
  $("undo-line").onclick = () => {
    if (!state.checked) {
      state.strokes.pop();
      state.pending = null;
      updateAnswer();
    }
  };
  $("sandbox-add").onclick = addEntry;
  for (const id of ["sandbox-name", "sandbox-constellation", "sandbox-index", "sandbox-point"]) $(id).onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addEntry();
    }
  };
  $("sandbox-type").onchange = () => {
    for (const entry of state.entries) entry.kind ||= state.sandboxType === "bayer" ? "stars" : state.sandboxType;
    state.sandboxType = $("sandbox-type").value;
    updateAnswer();
  };
  $("sandbox-cancel").onclick = () => {
    state.pending = null;
    updateAnswer();
  };
  $("clear").onclick = clearAnswers;
  $("check").onclick = () => checkAnswer();
  $("export-pdf").onclick = () => exportPdf(false);
  $("export-answers").onclick = () => exportPdf(true);
  $("snapshot").onclick = snapshot;
  document.querySelector(".dialog-close").onclick = () => $("dialog").close();
  $("dialog").addEventListener("click", (event) => {
    if (event.target !== $("dialog")) return;
    const r = $("dialog").getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      $("dialog").close();
  });
  $("practice-nav").onclick = () =>
    document.querySelector(".lab").scrollIntoView({ behavior: "smooth" });
  $("catalog-nav").onclick = () => atlas?.open();
  $("history-nav").onclick = showHistory;
  $("help-nav").onclick = () =>
    openDialog(
      `<p class="eyebrow">FIELD NOTES</p><h2>Как заниматься в Nightweave</h2><ol><li>Выбери сложность: начальный уровень ограничивает звёзды буквами α–β; экспертный открывает весь каталог.</li><li>В параметрах отдельно задаются количества звёзд и объектов Мессье, поле зрения, наблюдатель, время UTC, размер звёзд и яркость фона.</li><li>Режимы вида: цветные звёзды на однотонном фоне; звёзды с Млечным Путём NASA; контрастные белые звёзды; чёрные точки на белом.</li><li>В обычном задании выбери объект и нажми на карту. «Вне карты» — ответ об отсутствии. ⓘ открывает карточку объекта и карту-искатель.</li><li>В песочнице выбери каталог, нажми на карту и напиши имя вручную. Принимаются номера M/М, русские и английские имена и обозначения Байера. Повторы и неизвестные имена получают ноль.</li><li>В режиме созвездий рисуй стилусом, пальцем или мышью. Есть соединение двумя нажатиями и отмена последнего штриха. Стилус всегда рисует.</li><li>PDF «Полный вариант» содержит условия и три карты. «Текущее задание» экспортирует выбранную тему. Задания и ответы скачиваются отдельными кнопками.</li></ol><p>Сначала появляется быстрый звёздный предпросмотр. Фон NASA уточняется в отдельном потоке и кэшируется. Для мгновенной работы выбери режим без Млечного Пути.</p><p>Клавиатура: ←/→ выбирают объект, Delete удаляет отметку, Esc отменяет незавершённую линию. Для нанесения точек используется мышь или сенсорный экран.</p>`,
    );
  $("sources").onclick = () =>
    openDialog(
      `<p class="eyebrow">ОБ АТЛАСЕ</p><h2>Данные и методика</h2><p>Фон: <a href="https://svs.gsfc.nasa.gov/4851/" target="_blank" rel="noreferrer">NASA Deep Star Maps 2020</a>, NASA/Goddard SVS (Ernie Wright, Laurence Schuler, Ian Jones); Gaia DR2: ESA/Gaia/DPAC. Локальная JPEG-копия — Wikimedia Commons.</p><p>Каталоги: <a href="https://github.com/ofrohn/d3-celestial" target="_blank" rel="noreferrer">D3-Celestial</a>, Olaf Frohn, BSD-3-Clause. ${catalog.stars.length} звезды до 6m, ${catalog.named.length} именованных звезды с обозначениями Байера, 110 объектов Мессье. Типы и альтернативные названия взяты из этого каталога. Карты-искатели генерируются из тех же координат.</p><p>Линии всех 88 созвездий: <a href="https://github.com/Stellarium/stellarium/blob/master/skycultures/modern/index.json" target="_blank" rel="noreferrer">Stellarium Modern</a>, Stellarium team, CC BY-SA 4.0. Исходные цепочки HIP переведены в координаты J2000; этот набор используется в тренажёре, каталоге, квизах и PDF.</p><p>Координаты J2000; для горизонта учитываются среднее звёздное время и прецессия. Без рефракции, нутации, аберрации и собственного движения. Фон NASA включает более слабые звёзды; в остальных режимах предел величины применяется ко всем точкам.</p><p>Баллы: 100 × max(0, 1 − угловая ошибка / допуск). Допуск зависит от поля и уровня. Верное отсутствие — 100, пропуск — 0. При проверке Байера 80 очков даёт положение, 20 — обозначение. Штрихи оцениваются по полноте и точности покрытия эталонных линий; это учебная эвристика.</p><p>Печатный комплект повторяет структуру Q24S3OC, Q25S1OC, Q25S3OC, Q26S1OC, Q26S3OC: условия и три карты. Исходные задания не копируются. PDF растровый, A4, около 200 dpi.</p>`,
    );
}
async function loadTexture() {
  try {
    const image = new Image();
    image.src = "./assets/nasa-2020.jpg";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    renderer.setTexture({
      pixels: ctx.getImageData(0, 0, image.width, image.height).data,
      width: image.width,
      height: image.height,
    });
    if (state.config?.display === "milkyway") renderPromise = drawBase();
  } catch {
    $("asset-status").textContent = "Каталог J2000 · фон NASA недоступен";
    if (state.config?.display === "milkyway")
      toast("Фон NASA недоступен. Звёздная карта продолжает работать.");
  }
}
async function initialize() {
  bindEvents();
  try {
    if (routeLinkedCode(KIND)) return;
    const response = await fetch("./assets/catalog.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Каталог недоступен");
    catalog = await response.json();
    atlas = new Atlas(catalog, openDialog);
    let linked = null;
    try {
      linked = readVariantUrl(currentSiteUrl());
    } catch (error) {
      toast(error.message);
    }
    const saved = linked ? storage(STORAGE, null) : null;
    if (
      saved?.variant?.base &&
      saved.variant.generation === 9 &&
      saved.variant.configs?.[0]?.ra === saved.variant.configs?.[1]?.ra &&
      saved.variant.configs?.[0]?.dec === saved.variant.configs?.[1]?.dec &&
      (!linked ||
        (isExam ? linked.config.seed === saved.variant.seed && saved.variant.exam : JSON.stringify(validateConfig(linked.config)) ===
          JSON.stringify(validateConfig(saved.variant.base))))
    ) {
      variant = saved.variant;
      const selectedId = variant.attempts.messier.targets[variant.attempts.messier.selected]?.id;
      variant.attempts.messier.targets = sortMessier(variant.attempts.messier.targets);
      variant.attempts.messier.selected = Math.max(0, variant.attempts.messier.targets.findIndex(target => target.id === selectedId));
      const segments = visibleSegments(catalog, variant.configs[2]);
      if (JSON.stringify(segments) !== JSON.stringify(variant.attempts.lines.targets)) {
        variant.attempts.lines.targets = segments;
        variant.attempts.lines.checked = false;
        delete variant.scores.lines;
      }
      freeAttempt = saved.freeAttempt;
      writeConfig(variant.base);
      state.mode = (isExam && linked?.mode === "sandbox") ? "reference" : linked?.mode || "reference";
      switchMode(state.mode);
    } else {
      state.mode = (isExam && linked?.mode === "sandbox") ? "reference" : linked?.mode || "reference";
      newTask(false, linked?.config || { ...DEFAULT_CONFIG, seed: numericSeed() });
    }
    updateProgressCount();
    $("map-loading").hidden = true;
    loadTexture();
  } catch (error) {
    $("map-loading").textContent =
      "Не удалось загрузить данные. Запусти сайт через npm start.";
    toast(error.message);
  }
}
initialize();
