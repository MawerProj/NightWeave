export function rotateOffset(x, y, degrees) {
  const angle = degrees * Math.PI / 180;
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
}

export function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const rotation = Number(canvas.closest("[data-map-view-rotation]")?.dataset.mapViewRotation || 0);
  const style = canvas.ownerDocument.defaultView.getComputedStyle(canvas);
  const width = style.width.endsWith("px") ? parseFloat(style.width) : canvas.offsetWidth || rect.width;
  const height = style.height.endsWith("px") ? parseFloat(style.height) : canvas.offsetHeight || rect.height;
  const [x, y] = rotateOffset(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2, -rotation);
  return [(x / width + 0.5) * canvas.width, (y / height + 0.5) * canvas.height];
}
