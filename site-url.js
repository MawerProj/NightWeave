export function currentSiteUrl() {
  return globalThis.location?.href || new URL("./index.html", import.meta.url).href;
}

export function siteBaseUrl(current = currentSiteUrl()) {
  return new URL("./", current);
}

export function pageUrl(kind, current = currentSiteUrl()) {
  if (globalThis.NIGHTWEAVE_OFFLINE) {
    const result = new URL(current);
    result.search = ""; result.hash = "";
    return result;
  }
  return new URL(kind === "Q" ? "quiz.html" : kind === "E" ? "exam.html" : "./", siteBaseUrl(current));
}

export function replaceSiteUrl(url) {
  try { globalThis.history?.replaceState(null, "", url); } catch { /* Some file viewers cannot update history. */ }
}

export function localProgressUrl(entry, current = currentSiteUrl()) {
  const result = pageUrl(entry.kind, current);
  if (entry.url) {
    const previous = new URL(entry.url, current);
    result.search = previous.search;
    result.hash = previous.hash;
  }
  return result;
}
