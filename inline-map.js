import { attachMapGestures } from "./map-gestures.js?v=11";
import { attachMapWheel } from "./map-wheel.js?v=11";

const controllers = new WeakMap();
const styleKeys = ["width", "position", "left", "top", "transform", "transformOrigin"];

export function suspendInlineMap(canvas) {
  return controllers.get(canvas)?.suspend() || (() => {});
}

export function attachInlineMap({ stage, canvas, captureInteraction, canStartGesture, onSingleTouchEnd }) {
  if (controllers.has(canvas)) return controllers.get(canvas);
  const document = canvas.ownerDocument;
  const viewport = document.createElement("div"), frame = document.createElement("div"), controls = document.createElement("div");
  viewport.className = "inline-map-viewport";
  viewport.setAttribute("aria-label", "Карта: два пальца перемещают, масштабируют и вращают; колесо меняет масштаб, Shift + колесо вращает");
  frame.className = "inline-transform-frame";
  controls.className = "inline-map-controls";
  controls.innerHTML = '<button type="button" data-zoom-out aria-label="Уменьшить обычную карту">−</button><output aria-label="Масштаб обычной карты">100%</output><button type="button" data-zoom-in aria-label="Увеличить обычную карту">+</button><button type="button" data-turn-left aria-label="Повернуть карту против часовой стрелки">↶</button><button type="button" data-turn-right aria-label="Повернуть карту по часовой стрелке">↷</button><button type="button" data-pan aria-pressed="false">Перемещать</button><button type="button" data-fit>Вписать</button><span>Колесо — масштаб · Shift + колесо — поворот · два пальца — свободное управление</span>';
  const originalStyle = Object.fromEntries(styleKeys.map(key => [key, stage.style[key]]));
  const originalRotation = stage.dataset.mapViewRotation;
  stage.before(viewport);
  viewport.append(frame);
  frame.append(stage);
  viewport.after(controls);
  let zoom = 1, rotation = 0, width = 0, height = 0, suspended = false, panning = false, drag = null;
  const output = controls.querySelector("output");
  function fit() {
    if (suspended) return;
    viewport.hidden = controls.hidden = canvas.hidden;
    if (canvas.hidden) return;
    const ratio = canvas.width / canvas.height;
    const available = viewport.clientWidth || viewport.parentElement?.clientWidth || canvas.getBoundingClientRect().width || canvas.width;
    const base = Math.max(80, Math.min(available, stage === canvas ? 600 : 670));
    viewport.style.height = `${base / ratio}px`;
    width = base * zoom; height = width / ratio;
    const angle = rotation * Math.PI / 180;
    frame.style.width = `${Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle))}px`;
    frame.style.height = `${Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle))}px`;
    Object.assign(stage.style, { width: `${width}px`, position: "absolute", left: "50%", top: "50%", transform: `translate(-50%, -50%) rotate(${rotation}deg)`, transformOrigin: "center" });
    stage.dataset.mapViewRotation = String(rotation);
    output.value = output.textContent = `${Math.round(zoom * 100)}%`;
    controls.querySelector("[data-zoom-out]").disabled = zoom <= 1;
    controls.querySelector("[data-zoom-in]").disabled = zoom >= 3;
  }
  const setZoom = value => { zoom = Math.max(1, Math.min(3, value)); fit(); };
  const setRotation = value => { rotation = value; fit(); };
  const options = { viewport, stage, getZoom: () => zoom, setZoom, getRotation: () => rotation, setRotation, getStageSize: () => ({ width, height }) };
  const removeGestures = attachMapGestures({ ...options, captureInteraction, canStartGesture,
    onSingleTouchEnd: () => { if (!panning) onSingleTouchEnd?.(); }, onStart: () => { drag = null; } });
  const removeWheel = attachMapWheel({ ...options, enabled: () => !suspended });
  controls.querySelector("[data-zoom-out]").onclick = () => setZoom(zoom - .25);
  controls.querySelector("[data-zoom-in]").onclick = () => setZoom(zoom + .25);
  controls.querySelector("[data-turn-left]").onclick = () => setRotation(rotation - 15);
  controls.querySelector("[data-turn-right]").onclick = () => setRotation(rotation + 15);
  controls.querySelector("[data-pan]").onclick = event => {
    panning = !panning;
    event.currentTarget.setAttribute("aria-pressed", String(panning));
    viewport.classList.toggle("is-panning", panning);
  };
  viewport.addEventListener("pointerdown", event => {
    if (!panning || event.pointerType === "pen" || event.button !== 0 || (event.pointerType === "touch" && canStartGesture?.() === false)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture?.(event.pointerId);
  }, true);
  viewport.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault(); event.stopImmediatePropagation();
    viewport.scrollLeft = drag.left + drag.x - event.clientX;
    viewport.scrollTop = drag.top + drag.y - event.clientY;
  }, true);
  const stop = event => {
    if (!drag || drag.id !== event.pointerId) return;
    event.stopImmediatePropagation(); drag = null;
    if (viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener("pointerup", stop, true);
  viewport.addEventListener("pointercancel", stop, true);
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
  resize?.observe(viewport);
  const Mutation = document.defaultView?.MutationObserver;
  const changes = Mutation ? new Mutation(fit) : null;
  changes?.observe(canvas, { attributes: true, attributeFilter: ["width", "height", "hidden"] });
  const reset = () => { zoom = 1; rotation = 0; fit(); viewport.scrollLeft = viewport.scrollTop = 0; };
  controls.querySelector("[data-fit]").onclick = reset;
  const controller = {
    viewport, controls, reset, refresh: fit,
    suspend() {
      suspended = true; drag = null;
      const left = viewport.scrollLeft, top = viewport.scrollTop;
      viewport.replaceWith(stage);
      Object.assign(stage.style, originalStyle);
      if (originalRotation === undefined) delete stage.dataset.mapViewRotation;
      else stage.dataset.mapViewRotation = originalRotation;
      controls.hidden = true;
      return () => {
        stage.replaceWith(viewport); frame.append(stage); suspended = false;
        fit(); viewport.scrollLeft = left; viewport.scrollTop = top;
      };
    },
    destroy() {
      resize?.disconnect(); changes?.disconnect(); removeGestures(); removeWheel();
      if (!suspended) viewport.replaceWith(stage);
      Object.assign(stage.style, originalStyle); controls.remove(); controllers.delete(canvas);
    },
  };
  controllers.set(canvas, controller);
  fit();
  return controller;
}
