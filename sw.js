/* Snapshots completos para o app; o motor TTS só é baixado quando usado. */
const FILES = ["assets/index-B8pr_jff.js","assets/index-BpdWlx5Q.css","assets/ort.wasm.min-4XBKGcRb.js","assets/piper-o91UDS6e-DchrM4kQ.js","assets/tts-worker-B_OZ3gr4.js","data.js","icon-192.png","icon-512.png","icon.svg","index.html","manifest.json"];
const base = new URL("./", self.location.href);
const PREFIX = "english-quest-" + encodeURIComponent(base.pathname) + "-v2-";
const META = PREFIX + "meta";
const OPTIONAL = PREFIX + "tts";
const marker = new URL("__snapshot__", base).href;
let active = null,
  refreshing = null;
async function current() {
  if (active) return active;
  const response = await (await caches.open(META)).match(marker);
  return (active = response ? await response.text() : null);
}
async function refresh() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const entries = await Promise.all(
        FILES.map(async (file) => {
          const url = new URL(file, base).href;
          const response = await fetch(url, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!response.ok) throw Error("Atualização incompleta.");
          const hash = await crypto.subtle.digest(
            "SHA-256",
            await response.clone().arrayBuffer(),
          );
          return [url, response, [...new Uint8Array(hash)].join(",")];
        }),
      );
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          entries.map(([url, , hash]) => url + hash).join("|"),
        ),
      );
      const name =
        PREFIX +
        "snapshot-" +
        [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      const previous = await current();
      const cache = await caches.open(name);
      await Promise.all(
        entries.map(([url, response]) => cache.put(url, response)),
      );
      await (await caches.open(META)).put(marker, new Response(name));
      active = name;
      await Promise.all(
        (await caches.keys())
          .filter(
            (key) =>
              key.startsWith(PREFIX + "snapshot-") &&
              key !== name &&
              key !== previous,
          )
          .map((key) => caches.delete(key)),
      );
      return name;
    } finally {
      clearTimeout(timer);
    }
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}
self.addEventListener("install", (event) =>
  event.waitUntil(refresh().then(() => self.skipWaiting())),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== base.origin ||
    !url.pathname.startsWith(base.pathname)
  )
    return;
  event.respondWith(
    (async () => {
      // Versionamento está no caminho tts/piper-X-ort-Y, evitando misturar binários entre versões.
      if (url.pathname.startsWith(new URL("tts/", base).pathname)) {
        const cache = await caches.open(OPTIONAL);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }
      let name = await current();
      if (event.request.mode === "navigate") {
        try {
          name = await refresh();
        } catch {}
        const cached =
          name &&
          (await (await caches.open(name)).match(new URL("index.html", base)));
        return cached || fetch(event.request);
      }
      if (name) {
        const clean = new URL(url.href);
        clean.search = "";
        const hit = await (await caches.open(name)).match(clean.href);
        if (hit) return hit;
      }
      return fetch(event.request);
    })(),
  );
});
