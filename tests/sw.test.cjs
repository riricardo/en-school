const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto").webcrypto;
test("Snapshots completos; falha conserva anterior; motor só entra no cache ao ser usado", async () => {
  const source = fs
    .readFileSync(path.join(__dirname, "../sw.js"), "utf8")
    .replace(
      "/* BUILD_FILES */ []",
      JSON.stringify(["index.html", "assets/main.js", "data.js"]),
    );
  const store = new Map();
  const urlOf = (x) => (typeof x === "string" ? x : x.href || x.url);
  const caches = {
    async open(name) {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name);
      return {
        async put(key, r) {
          m.set(urlOf(key), r.clone());
        },
        async match(key) {
          return m.get(urlOf(key))?.clone();
        },
      };
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name) {
      return store.delete(name);
    },
  };
  let version = 1,
    online = true,
    broken = false,
    optionalDownloads = 0;
  const handlers = {};
  const context = {
    URL,
    Response,
    AbortController,
    TextEncoder,
    Uint8Array,
    setTimeout,
    clearTimeout,
    crypto,
    caches,
    self: {
      location: { href: "https://example.test/english/sw.js" },
      addEventListener(type, fn) {
        handlers[type] = fn;
      },
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    fetch: async (input) => {
      if (!online) throw Error("Offline");
      const u = urlOf(input);
      if (u.includes("/tts/")) optionalDownloads++;
      return new Response(u + ":" + version, {
        status: broken && u.endsWith("data.js") ? 404 : 200,
      });
    },
  };
  vm.runInNewContext(source, context);
  let pending;
  handlers.install({
    waitUntil(p) {
      pending = p;
    },
  });
  await pending;
  assert.equal(optionalDownloads, 0);
  async function request(file, mode = "cors") {
    let response;
    handlers.fetch({
      request: {
        method: "GET",
        url: "https://example.test/english/" + file,
        mode,
      },
      respondWith(p) {
        response = p;
      },
    });
    return (await response).text();
  }
  online = false;
  assert.match(await request("", "navigate"), /:1$/);
  online = true;
  version = 2;
  broken = true;
  assert.match(await request("", "navigate"), /:1$/);
  broken = false;
  assert.match(await request("", "navigate"), /:2$/);
  await request("tts/piper-1.0.0-ort-1.18.0/ort-wasm-simd.wasm");
  assert.equal(optionalDownloads, 1);
  online = false;
  assert.match(
    await request("tts/piper-1.0.0-ort-1.18.0/ort-wasm-simd.wasm"),
    /:2$/,
  );
  assert.equal(optionalDownloads, 1);
});
