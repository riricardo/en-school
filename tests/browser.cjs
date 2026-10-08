const { chromium } = require("playwright");
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict");
const project = path.resolve(__dirname, "..");
require("child_process").execFileSync(
  process.execPath,
  [path.join(project, "node_modules/vite/bin/vite.js"), "build"],
  {
    cwd: project,
    env: { ...process.env, VITE_BASE_PATH: "/english/" },
    stdio: "inherit",
  },
);
const root = path.join(project, "dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".data": "application/octet-stream",
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/english/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = path.join(
    root,
    url.pathname.slice("/english/".length) || "index.html",
  );
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    "Content-Type",
    types[path.extname(file)] || "application/octet-stream",
  );
  res.setHeader("Content-Length", fs.statSync(file).size);
  fs.createReadStream(file).pipe(res);
});
const fakeWorker = `self.onmessage=({data:d})=>{if(d.action==='prepare'){postMessage({id:d.id,type:'progress',percent:45});setTimeout(()=>postMessage({id:d.id,type:'ready'}),20);}else{let b=new ArrayBuffer(44+8820),v=new DataView(b);function w(o,t){[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)))}w(0,'RIFF');v.setUint32(4,b.byteLength-8,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,8820,true);postMessage({id:d.id,type:'audio',blob:new Blob([b],{type:'audio/wav'})});}}`;
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port + "/english/";
  const browser = await chromium.launch({
    executablePath: process.env.TEST_CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const context = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/assets/tts-worker-*.js", (r) =>
      r.fulfill({ contentType: "text/javascript", body: fakeWorker }),
    );
    await page.addInitScript(() => {
      if (!localStorage.getItem("english-quest-v1"))
        localStorage.setItem(
          "english-quest-v1",
          JSON.stringify({
            version: 1,
            settings: {
              categories: ["noun"],
              directions: ["forward"],
              amount: 100,
            },
            stats: { old: { level: 8 } },
            history: [],
          }),
        );
      localStorage.setItem("japanese-pocket-v2", "preserve");
    });
    await page.goto(url);
    await page.locator("#prompt").waitFor({ state: "visible" });
    assert.equal(await page.locator("#scores .skill-progress").count(), 3);
    let saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("english-quest-v2")),
    );
    assert.equal(saved.legacyV1.stats.old.level, 8);
    assert.deepEqual(saved.stats, {});
    const original = await page.locator("#prompt").innerText();
    await page.locator("#no").click();
    await page.locator("#solution").waitFor({ state: "visible" });
    assert.equal(await page.locator("#next").isVisible(), true);
    saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("english-quest-v2")),
    );
    assert.equal(Object.values(saved.stats)[0].streak, 0);
    assert.equal(Object.values(saved.stats)[0].errors, 1);
    await page.reload();
    await page.locator("#solution").waitFor({ state: "visible" });
    assert.equal(await page.locator("#prompt").innerText(), original);
    await page.locator("#next").click();
    await page.locator("#yes").click();
    await page.locator("#settingsButton").click();
    assert.equal(await page.locator("#lesson").isVisible(), false);
    await page.locator('#directionChecks input[value="forward"]').uncheck();
    await page.locator('#directionChecks input[value="listening"]').check();
    await page.locator("#restart").click();
    await page.locator("#settings").waitFor({ state: "hidden" });
    await page.locator("#yes").waitFor({ state: "visible" });
    await page.waitForFunction(() => !document.getElementById("yes").disabled);
    assert.equal(await page.locator("#prompt").isVisible(), false);
    await page.locator("#yes").click();
    saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("english-quest-v2")),
    );
    assert.ok(
      Object.entries(saved.stats).some(
        ([k, v]) => JSON.parse(k)[2] === "listening" && v.streak === 1,
      ),
    );
    await page.waitForFunction(() => !document.getElementById("no").disabled);
    await page.locator("#no").click();
    assert.equal(await page.locator("#prompt").isVisible(), true);
    assert.equal(await page.locator("#solution").isVisible(), false);
    assert.equal(await page.locator("#answers").isVisible(), true);
    saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("english-quest-v2")),
    );
    const current = saved.round.queue[0];
    assert.equal(saved.round.phase, "reading");
    assert.equal(
      saved.stats[JSON.stringify([current.id, current.form, "listening"])]
        .streak,
      0,
    );
    await page.reload();
    await page.locator("#prompt").waitFor({ state: "visible" });
    assert.equal(await page.locator("#solution").isVisible(), false);
    await page.locator("#no").click();
    await page.locator("#solution").waitFor({ state: "visible" });
    saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("english-quest-v2")),
    );
    assert.equal(
      saved.stats[JSON.stringify([current.id, current.form, "forward"])].streak,
      0,
    );
    await page.locator("#settingsButton").click();
    assert.equal(await page.locator("#solution").isVisible(), false);
    await page.locator("#closeSettings").click();
    await page.locator("#solution").waitFor({ state: "visible" });
    await page.screenshot({
      path: path.join(require("os").tmpdir(), "english-v2.png"),
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
    }
    await page.locator("#settingsButton").click();
    page.once("dialog", (d) => d.accept());
    await page.locator("#resetProgress").click();
    saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("english-quest-v2")),
    );
    assert.deepEqual(saved.stats, {});
    assert.equal(saved.legacyV1, null);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("japanese-pocket-v2")),
      "preserve",
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      "UI: migração, texto, listening simulado, etapas persistidas, reset e tamanhos passaram.",
    );
    if (!process.env.TEST_PIPER) return;
    // Piper real; opcionalmente recebe os bytes oficiais já baixados para teste offline.
    const real = await browser.newContext({
      serviceWorkers: "allow",
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 844 },
    });
    const p = await real.newPage();
    if (process.env.TEST_MODEL_PATH && process.env.TEST_CONFIG_PATH)
      await p.route(
        "https://huggingface.co/rhasspy/piper-voices/**",
        (route) => {
          const config = route.request().url().endsWith(".json");
          const f = path.resolve(
            config ? process.env.TEST_CONFIG_PATH : process.env.TEST_MODEL_PATH,
          );
          return route.fulfill({
            contentType: config
              ? "application/json"
              : "application/octet-stream",
            headers: { "Content-Length": String(fs.statSync(f).size) },
            path: f,
          });
        },
      );
    p.on("console", (m) => {
      if (m.type() === "error") console.log("PIPER", m.text().slice(0, 220));
    });
    p.on("requestfailed", (r) =>
      console.log("FAILED", r.url().slice(0, 150), r.failure()?.errorText),
    );
    await p.goto(url);
    await p.locator("#prompt").waitFor({ state: "visible" });
    await p.locator("#settingsButton").click();
    await p.locator('#directionChecks input[value="reverse"]').uncheck();
    await p.locator("#restart").click();
    await p.locator("#settings").waitFor({ state: "hidden" });
    await p.locator("#playAudio").click();
    console.log("Piper: preparando voz real.");
    const started = Date.now();
    await p.waitForFunction(
      () =>
        document.getElementById("playAudio").classList.contains("playing") ||
        document.getElementById("retryAudio").hidden === false,
      {},
      { timeout: 180000 },
    );
    if (await p.locator("#retryAudio").isVisible())
      throw Error("Piper real falhou.");
    console.log(
      "Piper: gerou e reproduziu inglês em " +
        ((Date.now() - started) / 1000).toFixed(1) +
        "s.",
    );
    await p.waitForFunction(
      () => !document.getElementById("playAudio").classList.contains("playing"),
    );
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    await p.unroute("https://huggingface.co/rhasspy/piper-voices/**");
    await real.setOffline(true);
    await p.reload();
    await p.locator("#prompt").waitFor({ state: "visible" });
    await p.locator("#playAudio").click();
    await p.waitForFunction(
      () =>
        document.getElementById("playAudio").classList.contains("playing") ||
        document.getElementById("retryAudio").hidden === false,
      {},
      { timeout: 120000 },
    );
    assert.equal(await p.locator("#retryAudio").isVisible(), false);
    console.log("Piper: nova geração após recarregar offline passou.");
    await real.close();
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  server.close();
});
