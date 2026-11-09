import { atlasStars, constellationView } from "./constellation-atlas.js?v=10";
import { openFullscreen, closeFullscreen } from "./fullscreen.js?v=10";
import { projector } from "./astro.js?v=10";
import { vectorMap } from "./renderer.js?v=10";
import { normalizeName } from "./training.js?v=10";
import { downloadBlob } from "./pdf.js?v=10";

const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export class Atlas {
  constructor(catalog, openDialog) {
    this.catalog = catalog;
    this.openDialog = openDialog;
    this.kind = "messier";
    this.query = "";
  }
  open() {
    closeFullscreen();
    this.query = "";
    this.openDialog(
      `<p class="eyebrow">FIELD GUIDE</p><h2>Каталог неба</h2><div class="atlas-search"><label>Каталог<select id="atlas-kind"><option value="messier">Мессье · 110 объектов</option><option value="stars">Звёзды · ${atlasStars(this.catalog).length}</option><option value="constellations">Созвездия · ${this.catalog.constellations.length}</option></select></label><label>Поиск<input id="atlas-query" type="search" placeholder="M31, Вега, α Lyr, Орион, Orion…" autocomplete="off"></label></div><p id="atlas-count" class="fine"></p><div id="atlas-list" class="atlas-list"></div>`,
    );
    const kind = document.getElementById("atlas-kind"),
      query = document.getElementById("atlas-query");
    kind.value = this.kind;
    query.value = this.query;
    const render = () => {
      this.kind = kind.value;
      this.query = query.value;
      const pool =
        this.kind === "messier"
          ? this.catalog.messier
          : [...(this.kind === "constellations" ? this.catalog.constellations : atlasStars(this.catalog))].sort((a, b) =>
              a.name.localeCompare(b.name, "ru"),
            );
      const term = normalizeName(query.value);
      const found = pool.filter((object) =>
        normalizeName(
          [
            object.name,
            object.title,
            object.id,
            object.bayer,
            object.constellationName,
            object.typeName,
            object.latinName,
            ...(object.aliases || []),
          ].join(" "),
        ).includes(term),
      );
      document.getElementById("atlas-count").textContent =
        `Найдено: ${found.length} из ${pool.length}`;
      const list = document.getElementById("atlas-list");
      list.replaceChildren();
      for (const object of found) {
        const button = document.createElement("button");
        button.className = "atlas-item";
        button.innerHTML = `<strong>${escape(object.name)}</strong><span>${escape(object.latinName ? `${object.latinName} · ${object.id}` : object.title || object.constellationName)}${object.bayer ? " · " + escape(object.bayer) : ""}</span><small>${escape(object.typeName || (object.latinName ? "Созвездие" : "Звезда"))} ↗</small>`;
        button.onclick = () => this.detail(object);
        list.append(button);
      }
      if (!found.length)
        list.textContent =
          "Объект не найден. Попробуй номер Мессье, имя, обозначение Байера или название созвездия.";
    };
    kind.onchange = render;
    query.oninput = render;
    render();
  }
  detail(object, returnTo = null) {
    closeFullscreen();
    const constellation = Boolean(object.latinName);
    const view = constellation ? constellationView(this.catalog, object) : null;
    const messier = !constellation && object.id.startsWith("M");
    this.openDialog(
      `<button class="subtle" id="atlas-back">${returnTo ? "← " + escape(returnTo.name) : "← Весь каталог"}</button><p class="eyebrow">${constellation ? "CONSTELLATION · " + escape(object.id) : messier ? "MESSIER " + object.number : escape(object.constellationName).toUpperCase()}</p><h2>${escape(object.name)}${messier ? " · " + escape(object.title) : ""}</h2><dl class="object-facts">${constellation ? `<div><dt>Русское название</dt><dd>${escape(object.name)}</dd></div><div><dt>Латинское название</dt><dd>${escape(object.latinName)}</dd></div><div><dt>Сокращение IAU</dt><dd>${escape(object.id)}</dd></div><div><dt>Родительный падеж</dt><dd>${escape(object.genitive)}</dd></div>` : messier ? `<div><dt>Тип</dt><dd>${escape(object.typeName)}</dd></div><div><dt>Другое обозначение</dt><dd>${escape(object.detail || "—")}</dd></div>` : `<div><dt>Созвездие</dt><dd><button class="subtle" id="object-constellation">${escape(object.constellationName)} (${escape(object.constellation)}) ↗</button></dd></div><div><dt>Байер</dt><dd>${escape(object.bayer || "—")}</dd></div>`}<div><dt>${constellation ? "Центр карты J2000" : "Координаты J2000"}</dt><dd>RA ${(((((view?.ra ?? object.ra) % 360) + 360) % 360) / 15).toFixed(3)}h · Dec ${(view?.dec ?? object.dec).toFixed(3)}°</dd></div>${constellation ? "" : `<div><dt>Звёздная величина</dt><dd>${object.mag.toFixed(2)}m</dd></div>`}</dl>${constellation ? `<h3>Самые яркие звёзды</h3><p class="fine">По видимой звёздной величине: чем меньше число, тем ярче звезда.</p><ul class="constellation-stars">${view.stars.map(star => `<li><a href="#catalog-star-${star.id}" data-atlas-star="${star.id}">${escape(star.name)}</a><span>${escape(star.bayer || star.id)} · ${star.mag.toFixed(2)}m</span></li>`).join("")}</ul>` : ""}${object.note ? `<p>${escape(object.note)}</p>` : ""}<div class="finder-view"><div class="finder-toolbar"><label class="checkbox"><input id="finder-lines" type="checkbox" checked> Линии созвездий</label><label>Поле зрения<select id="finder-fov">${constellation ? `<option value="${view.fov}" selected>Всё созвездие · ${Math.ceil(view.fov)}°</option>` : ""}<option value="35">35°</option><option value="60" ${constellation ? "" : "selected"}>60°</option><option value="100">100°</option></select></label><button class="secondary" id="finder-expand" data-map-expand>⛶ На весь экран</button><button class="subtle" id="finder-png">↓ PNG</button></div><canvas id="finder" width="800" height="800" class="finder" aria-label="Карта-искатель ${escape(object.name)}"></canvas></div><p class="fine">Схема положения на небе, север сверху, восток слева. ${constellation ? "Выделены линии выбранного созвездия и его самые яркие звёзды. Линии можно отключить. Это схема расположения, а не официальные границы созвездия." : "Оранжевый крест — объект. Это карта-искатель, а не телескопическая фотография."}</p><p class="fine">Данные: D3-Celestial / Hipparcos, J2000.${constellation ? ' <a href="https://www.iau.org/IAU/Astronomy-FAQs/Constellations.aspx" target="_blank" rel="noreferrer">Названия и сокращения IAU ↗</a>' : ""}${messier ? ' <a href="https://science.nasa.gov/mission/hubble/science/explore-the-night-sky/hubble-messier-catalog/" target="_blank" rel="noreferrer">Каталог NASA ↗</a>' : ""}</p>`,
    );
    const canvas = document.getElementById("finder"),
      ctx = canvas.getContext("2d");
    const render = () => {
      const config = {
        frame: "equatorial",
        ra: view?.ra ?? object.ra,
        dec: view?.dec ?? object.dec,
        roll: 0,
        fov: Number(document.getElementById("finder-fov").value),
        projection: "stereo",
        horizon: false,
        latitude: 0,
        longitude: 0,
        date: "2000-01-01T12:00Z",
        magnitude: 6,
        display: "stars",
        starSize: 1.2,
      };
      const p = projector(config),
        size = canvas.width,
        center = size / 2,
        radius = center - 2;
      vectorMap(canvas, this.catalog, config);
      if (document.getElementById("finder-lines").checked) {
        ctx.strokeStyle = "#8cc6d380";
        ctx.lineWidth = 1.3;
        for (const figure of this.catalog.lines)
          for (const path of figure.paths) {
            ctx.strokeStyle = constellation && figure.id === object.id ? "#d5ec95" : "#8cc6d350";
            ctx.lineWidth = constellation && figure.id === object.id ? 2.5 : 1.3;
            ctx.beginPath();
            let previous = null;
            for (const coordinate of path) {
              const point = p.project(...coordinate);
              if (!point) {
                previous = null;
                continue;
              }
              const x = center + point[0] * radius,
                y = center + point[1] * radius;
              if (
                previous &&
                Math.hypot(x - previous[0], y - previous[1]) < size / 3
              )
                ctx.lineTo(x, y);
              else ctx.moveTo(x, y);
              previous = [x, y];
            }
            ctx.stroke();
          }
      }
      ctx.font = "17px system-ui";
      ctx.fillStyle = "#abc4cf";
      let labels = 0;
      const labelBoxes = [];
      for (const star of (view?.stars || this.catalog.named.filter((s) => s.mag < 2.8).sort((a, b) => a.mag - b.mag))) {
        const point = p.project(star.ra, star.dec);
        if (!point || star.id === object.id || labels++ > 12) continue;
        const x = center + point[0] * radius,
          y = center + point[1] * radius;
        if (!constellation && Math.hypot(x - center, y - center) < 32) continue;
        if (constellation) { ctx.strokeStyle = "#ffb480"; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke(); }
        const label = star.name,
          width = ctx.measureText(label).width;
        let tx = Math.max(5, Math.min(size - width - 5, x + 8)), ty = Math.max(20, y - 8);
        if (constellation) {
          for (const [dx, dy] of [[8, -8], [-width - 10, -8], [8, 24], [-width - 10, 24], [8, -34], [8, 50]]) {
            tx = Math.max(5, Math.min(size - width - 5, x + dx));
            ty = Math.max(22, Math.min(size - 5, y + dy));
            if (!labelBoxes.some(box => tx < box.x + box.width + 7 && tx + width + 7 > box.x && Math.abs(ty - box.y) < 25)) break;
          }
          labelBoxes.push({ x: tx, y: ty, width });
          ctx.fillStyle = "#061018ee";
          ctx.fillRect(tx - 3, ty - 18, width + 6, 23);
          ctx.fillStyle = "#abc4cf";
        }
        ctx.fillText(label, tx, ty);
      }
      if (!constellation) {
      ctx.strokeStyle = "#ffb480";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(center - 10, center);
      ctx.lineTo(center + 10, center);
      ctx.moveTo(center, center - 10);
      ctx.lineTo(center, center + 10);
      ctx.stroke();
      ctx.fillStyle = "#ffb480";
      ctx.font = "20px system-ui";
      ctx.fillText(object.name, center + 14, center + 24);
      }
    };
    document.getElementById("atlas-back").onclick = () => returnTo ? this.detail(returnTo) : this.open();
    for (const link of document.querySelectorAll("[data-atlas-star]")) link.onclick = event => {
      event.preventDefault();
      const star = atlasStars(this.catalog).find(star => star.id === link.dataset.atlasStar);
      if (star) this.detail(star, object);
    };
    const constellationLink = document.getElementById("object-constellation");
    if (constellationLink) constellationLink.onclick = () => {
      const found = this.catalog.constellations.find(c => c.id === object.constellation);
      if (found) this.detail(found);
    };
    document.getElementById("finder-lines").onchange = render;
    document.getElementById("finder-fov").onchange = render;
    document.getElementById("finder-png").onclick = () =>
      canvas.toBlob((blob) =>
        downloadBlob(blob, `nightweave-${object.id}.png`),
      );
    document.getElementById("finder-expand").onclick = () => openFullscreen({ content: document.querySelector(".finder-view"), stage: canvas, canvas, title: "Карта-искатель " + object.name });
    render();
  }
}
