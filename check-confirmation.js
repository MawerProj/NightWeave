let current = null;

export function confirmDrawingCheck({ whole = false, exam = false, onConfirm }) {
  if (current) return;
  const dialog = document.createElement("dialog");
  dialog.className = "check-confirmation";
  dialog.setAttribute("aria-labelledby", "check-confirmation-title");
  dialog.innerHTML = `<h2 id="check-confirmation-title">${exam ? "Завершить экзамен?" : whole ? "Проверить все задания?" : "Проверить рисунок?"}</h2><p>${whole ? "Будут проверены все ответы, включая рисунок созвездий. После проверки дорисовывать будет нельзя." : "После проверки рисунок созвездий будет закрыт для редактирования."} Продолжить рисовать можно, если сейчас отменить проверку.</p><div><button type="button" class="secondary" data-continue autofocus>Продолжить рисовать</button><button type="button" class="primary" data-confirm>${exam ? "Завершить и проверить" : whole ? "Проверить всё" : "Проверить рисунок"}</button></div>`;
  const finish = confirmed => {
    if (current !== dialog) return;
    current = null;
    dialog.close(); dialog.remove();
    if (confirmed) onConfirm();
  };
  dialog.querySelector("[data-continue]").onclick = () => finish(false);
  dialog.querySelector("[data-confirm]").onclick = () => finish(true);
  dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
  (document.fullscreenElement || document.querySelector(".fullscreen-shell") || document.body).append(dialog);
  current = dialog;
  dialog.showModal();
  dialog.querySelector("[data-continue]").focus({ preventScroll: true });
}
