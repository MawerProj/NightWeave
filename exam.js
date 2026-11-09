import { angularDistance, boundaryCrossings, projector, randomGenerator, scoreAnswer } from "./astro.js?v=9";
import { bayerMatches } from "./bayer.js?v=9";
import { scoreDrawing } from "./training.js?v=9";
import { createVariant, DEFAULT_CONFIG, variantSummary } from "./variant.js?v=9";

export const EXAM_TOLERANCE = 4;
const round = value => Math.round(value * 100) / 100;

export function createExam(catalog, seed) {
  const random = randomGenerator(seed + "exam-v9");
  let first;
  for (let attempt = 0; attempt < 2048; attempt++) {
    first = { ...DEFAULT_CONFIG.maps[0], randomCenter: false,
      ra: random() * 360, dec: Math.asin(random() * 2 - 1) * 180 / Math.PI };
    if (boundaryCrossings({ ...DEFAULT_CONFIG, ...first }).length === 6) break;
  }
  if (boundaryCrossings({ ...DEFAULT_CONFIG, ...first }).length !== 6)
    throw new Error("Не удалось подобрать карту с шестью пересечениями.");
  const exam = createVariant(catalog, { ...DEFAULT_CONFIG, seed, level: "standard",
    bayerTest: true, maps: [first, first, DEFAULT_CONFIG.maps[2]] });
  exam.exam = true;
  exam.participantName = "";
  return exam;
}

export function validParticipantName(value) {
  return /^[\p{L}]+(?:[-’'][\p{L}]+)*\s+[\p{L}]\.\s*[\p{L}]\.$/u.test(String(value).trim());
}

export function gradeExam(exam, catalog) {
  const rows = variantSummary({ ...exam, examReport: undefined }).rows;
  const details = {};
  for (const mode of ["reference", "stars", "messier"]) {
    const attempt = exam.attempts[mode], projection = projector(attempt.config);
    const used = new Set();
    details[mode] = attempt.targets.map(target => {
      const answer = attempt.answers[target.id];
      let expected = target;
      if (target.id.startsWith("edge-") && answer && !answer.absent && !answer.draft) {
        const family = target.id.split("-")[1];
        const candidates = attempt.targets.filter(t => t.id.startsWith(`edge-${family}-`) && !used.has(t.id));
        candidates.sort((a, b) => angularDistance([a.ra, a.dec], [answer.ra, answer.dec]) - angularDistance([b.ra, b.dec], [answer.ra, answer.dec]));
        if (candidates.length) { expected = candidates[0]; used.add(expected.id); }
      }
      const result = scoreAnswer(expected, answer?.draft ? null : answer, projection, EXAM_TOLERANCE);
      const maximum = mode === "messier" ? 1.5 : 2;
      let points = result.points / 100 * maximum;
      if (mode === "stars" && result.visible) {
        const correctBayer = Boolean(answer && !answer.draft && !answer.absent &&
          bayerMatches(answer.bayer, target.bayer, catalog));
        points = result.points / 100 + (correctBayer ? 1 : 0);
        result.reason += correctBayer ? " · Байер ✓" : ` · Байер: ${target.bayer}`;
      }
      return { ...result, target, expected, points: round(points), maximum };
    });
  }
  const drawing = scoreDrawing(exam.attempts.lines.targets, exam.attempts.lines.strokes, EXAM_TOLERANCE);
  const hasMark = mode => Object.values(exam.attempts[mode].answers).some(a => a && !a.draft && !a.absent && Number.isFinite(a.ra) && Number.isFinite(a.dec));
  const scores = {
    points: details.reference.filter(r => !r.target.id.startsWith("edge-")).reduce((sum, r) => sum + r.points, 0),
    edges: details.reference.filter(r => r.target.id.startsWith("edge-")).reduce((sum, r) => sum + r.points, 0),
    stars: details.stars.reduce((sum, r) => sum + r.points, 0),
    messier: details.messier.reduce((sum, r) => sum + r.points, 0),
    lines: drawing.points * 0.16,
    symbols: hasMark("stars") && hasMark("messier") ? 1 : 0,
    name: validParticipantName(exam.participantName) ? 1 : 0,
  };
  for (const row of rows) { row.points = round(scores[row.id]); row.checked = true; }
  return { rows, points: round(rows.reduce((sum, row) => sum + row.points, 0)), maximum: 120,
    complete: true, details, drawing };
}
