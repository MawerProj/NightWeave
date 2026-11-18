export function setupInstall() {
  const local = !["https:", "http:"].includes(location.protocol);
  const installed = globalThis.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  const section = document.createElement("section");
  section.className = "app-install";
  section.setAttribute("aria-label", "Приложение на устройстве");
  section.innerHTML = `<div><strong>${local ? "Локальное приложение" : "Nightweave на устройстве"}</strong><p data-install-status role="status">${local ? "Все ресурсы внутри этого файла. Можно пользоваться без интернета." : "Сохраняем приложение для работы без интернета…"}</p></div><button class="secondary" type="button" data-install ${local || installed ? "hidden" : ""}>Установить на устройство</button><details><summary>Как добавить иконку</summary><p>Android: открой приложение с сайта в Chrome → меню ⋮ → «Установить приложение» или «Добавить на главный экран».</p><p>iPad / iPhone: открой приложение с сайта в Safari → «Поделиться» → «На экран „Домой“». Если доступен переключатель «Открывать как веб-приложение», оставь его включённым.</p><p>Дождись сообщения «Готово к работе без интернета», затем открой приложение с новой иконки один раз с интернетом. После этого его можно запускать без сети. Браузер может удалить сохранённые данные при очистке хранилища.</p>${local ? "<p>Иконка веб-приложения устанавливается с HTTPS-сайта. Локальный HTML можно открывать в браузере, но мобильный просмотрщик файлов может не запускать JavaScript.</p>" : ""}</details>`;
  const main = document.querySelector("main");
  (main || document.body).prepend(section);
  if (local) return;

  const status = section.querySelector("[data-install-status]");
  const button = section.querySelector("[data-install]");
  let prompt = null;
  globalThis.addEventListener("beforeinstallprompt", event => {
    event.preventDefault(); prompt = event;
  });
  globalThis.addEventListener("appinstalled", () => { button.hidden = true; prompt = null; });
  button.onclick = async () => {
    if (!prompt) { section.querySelector("details").open = true; return; }
    const request = prompt; prompt = null;
    try { await request.prompt(); await request.userChoice; }
    catch { section.querySelector("details").open = true; }
  };
  for (const [rel, href] of [["manifest", "manifest.webmanifest"], ["apple-touch-icon", "assets/app-icon-192.png"]]) {
    const link = document.createElement("link"); link.rel = rel; link.href = new URL(href, location.href); document.head.append(link);
  }
  if (!("serviceWorker" in navigator) || !globalThis.isSecureContext) {
    status.textContent = "Для сохранения приложения открой сайт по HTTPS. Также можно скачать самостоятельный HTML-файл.";
    return;
  }
  navigator.serviceWorker.register(new URL("service-worker.js", location.href), { scope: "./", updateViaCache: "none" })
    .then(registration => {
      const worker = registration.installing || registration.waiting || registration.active;
      if (!worker) throw new Error("No application worker");
      if (worker.state === "activated") return;
      return new Promise((resolve, reject) => {
        const changed = () => {
          if (worker.state === "activated" || worker.state === "redundant") {
            worker.removeEventListener("statechange", changed);
            worker.state === "activated" ? resolve() : reject(new Error("Offline save failed"));
          }
        };
        worker.addEventListener("statechange", changed); changed();
      });
    })
    .then(() => { status.textContent = "Готово к работе без интернета. Можно добавить иконку на главный экран."; })
    .catch(() => { status.textContent = "Не удалось сохранить приложение. Проверь интернет и свободное место, затем обнови страницу."; });
}
