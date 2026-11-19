let current = null;

export function cancelConfirmation(kind) {
  if (current?.dataset.confirmation === kind) current.querySelector("[data-continue]").click();
}

export function confirmDrawingCheck({ whole = false, exam = false, onConfirm }) {
  showConfirmation({
    title: exam ? "Завершить экзамен?" : whole ? "Проверить все задания?" : "Проверить рисунок?",
    message: `${whole ? "Будут проверены все ответы, включая рисунок созвездий. После проверки дорисовывать будет нельзя." : "После проверки рисунок созвездий будет закрыт для редактирования."} Продолжить рисовать можно, если сейчас отменить проверку.`,
    cancelLabel: "Продолжить рисовать",
    confirmLabel: exam ? "Завершить и проверить" : whole ? "Проверить всё" : "Проверить рисунок",
    kind: "drawing", onConfirm,
  });
}

export function confirmSeedChange({ onConfirm }) {
  showConfirmation({ title: "Создать новый seed?", message: "Текущие ответы и рисунки будут сброшены. Создать новое задание?", cancelLabel: "Отмена", confirmLabel: "Создать новый seed", kind: "seed", onConfirm });
}

function showConfirmation({ title, message, cancelLabel, confirmLabel, kind, onConfirm }) {
  if (current) return;
  const dialog = document.createElement("dialog");
  dialog.className = "check-confirmation";
  dialog.dataset.confirmation = kind;
  dialog.setAttribute("aria-labelledby", "check-confirmation-title");
  dialog.innerHTML = `<h2 id="check-confirmation-title">${title}</h2><p>${message}</p><div><button type="button" class="secondary" data-continue autofocus>${cancelLabel}</button><button type="button" class="primary" data-confirm>${confirmLabel}</button></div>`;
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
