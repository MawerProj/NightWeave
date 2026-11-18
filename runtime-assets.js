export async function loadCatalog() {
  if (globalThis.NIGHTWEAVE_OFFLINE?.catalog) return globalThis.NIGHTWEAVE_OFFLINE.catalog;
  const response = await fetch("./assets/catalog.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Каталог недоступен");
  return response.json();
}

export function nasaTextureUrl() {
  return globalThis.NIGHTWEAVE_OFFLINE?.texture || "./assets/nasa-2020.jpg";
}
