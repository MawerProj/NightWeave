import { rotateOffset } from "./map-view.js?v=11";

export function attachMapWheel({ viewport, stage, getZoom, setZoom, getRotation, setRotation, getStageSize, enabled = () => true }) {
  function wheel(event) {
    if (!enabled() || event.buttons) return;
    const raw = event.deltaY || event.deltaX;
    if (!raw) return;
    event.preventDefault();
    event.stopPropagation();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight || 600 : 1;
    const delta = Math.max(-300, Math.min(300, raw * units));
    const before = stage.getBoundingClientRect(), size = getStageSize();
    const [x, y] = rotateOffset(event.clientX - before.left - before.width / 2, event.clientY - before.top - before.height / 2, -getRotation());
    const anchor = [x / Math.max(1, size.width), y / Math.max(1, size.height)];
    if (event.shiftKey) setRotation(getRotation() + delta * .15);
    else setZoom(getZoom() * Math.exp(-delta * .0015));
    const after = stage.getBoundingClientRect(), next = getStageSize();
    const [dx, dy] = rotateOffset(anchor[0] * next.width, anchor[1] * next.height, getRotation());
    viewport.scrollLeft += after.left + after.width / 2 + dx - event.clientX;
    viewport.scrollTop += after.top + after.height / 2 + dy - event.clientY;
  }
  viewport.addEventListener("wheel", wheel, { passive: false });
  return () => viewport.removeEventListener("wheel", wheel);
}
