const { chromium } = require("playwright");
const http = require("http"),
  fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict");
const project = path.resolve(__dirname, "..");
const waitForWorkerEvents = async (run, predicate, timeout = 20000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const events = workerEvents.filter((event) => event.run === run);
    if (predicate(events)) return events;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw Error("Timed out waiting for simulated audio worker events.");
};
require("child_process").execFileSync(
  process.execPath,
  [path.join(project, "node_modules/vite/bin/vite.js"), "build"],
  {
    cwd: project,
    stdio: "inherit",
  },
);
const root = path.join(project, "dist");
const workerEvents = [];
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
  if (url.pathname === "/en-school/__worker_event") {
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      workerEvents.push({
        ...JSON.parse(body),
        run: url.searchParams.get("run") || "",
      });
      res.writeHead(204);
      res.end();
    });
    return;
  }
  if (!url.pathname.startsWith("/en-school/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const file = path.join(
    root,
    url.pathname.slice("/en-school/".length) || "index.html",
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
const fakeWorker = `const log=e=>fetch('/en-school/__worker_event',{method:'POST',body:JSON.stringify(e)}).catch(()=>{});self.onmessage=({data:d})=>{log({action:d.action,text:d.text||''});if(d.action==='prepare'){postMessage({id:d.id,type:'progress',percent:45});setTimeout(()=>postMessage({id:d.id,type:'ready'}),20);}else{let b=new ArrayBuffer(44+8820),v=new DataView(b);function w(o,t){[...t].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)))}w(0,'RIFF');v.setUint32(4,b.byteLength-8,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,44100,true);v.setUint32(28,88200,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,8820,true);const delay=d.text==='ticket'?2500:d.text==='bill'?500:30;setTimeout(()=>postMessage({id:d.id,type:'audio',blob:new Blob([b],{type:'audio/wav'})}),delay);}}`;
const windowFakeWorker = fakeWorker.replaceAll(
  "/__worker_event",
  "/__worker_event?run=window",
);
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port + "/en-school/";
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
    await page.locator("#audioSpeed").selectOption("1.25");
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
    assert.equal(saved.settings.playbackRate, 1.25);
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
    workerEvents.length = 0;
    const audioContext = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
    });
    const audioPage = await audioContext.newPage();
    audioPage.on("pageerror", (e) => errors.push(e.message));
    await audioPage.route("**/assets/tts-worker-*.js", (r) =>
      r.fulfill({ contentType: "text/javascript", body: windowFakeWorker }),
    );
    await audioPage.addInitScript(() => {
      window.__playbackRates = [];
      HTMLMediaElement.prototype.play = function () {
        window.__playbackRates.push(this.playbackRate);
        return Promise.resolve();
      };
      const queue = [
        "en-n001",
        "en-n002",
        "en-n003",
        "en-n004",
        "en-n005",
        "en-v001",
        "en-v002",
        "en-v003",
        "en-v004",
        "en-a001",
        "en-a002",
        "en-a003",
      ].map((id) => ({ id, form: "base", skill: "reverse" }));
      localStorage.setItem(
        "english-quest-v2",
        JSON.stringify({
          version: 2,
          settings: {
            categories: ["noun"],
            directions: ["listening"],
            situation: "",
            amount: 100,
            repeatGap: 1,
            autoAudio: false,
            playbackRate: 1.5,
          },
          stats: {},
          round: {
            queue,
            repeatGap: 1,
            done: 0,
            phase: "question",
            failed: false,
            heard: false,
          },
          legacyV1: null,
        }),
      );
    });
    await audioPage.goto(url);
    await audioPage.locator("#prompt").waitFor({ state: "visible" });
    let audioEvents = await waitForWorkerEvents("window", (events) =>
      events.some((event) => event.action === "speak"),
    );
    const firstSpeech = audioEvents.find((event) => event.action === "speak");
    assert.ok(firstSpeech, JSON.stringify(audioEvents));
    assert.equal(firstSpeech.text, "ticket");
    await waitForWorkerEvents(
      "window",
      (events) =>
        events.some(
          (event) => event.action === "speak" && event.text === "bill",
        ),
    );
    let audioSaved = await audioPage.evaluate(() =>
      JSON.parse(localStorage.getItem("english-quest-v2")),
    );
    assert.deepEqual(audioSaved.stats, {});
    assert.equal(audioSaved.round.heard, false);
    await audioPage.locator("#yes").click();
    await audioPage.locator("#no").click();
    await audioPage.locator("#solution").waitFor({ state: "visible" });
    await audioPage.locator("#playAudio").click();
    await audioPage.waitForFunction(() =>
      window.__playbackRates.includes(1.5),
    );
    await audioPage.waitForFunction(
      () =>
        document.getElementById("audioText").textContent === "Gerando áudio…" ||
        document.getElementById("playAudio").classList.contains("playing"),
    );
    audioEvents = await waitForWorkerEvents(
      "window",
      (events) =>
        events.filter((event) => event.action === "speak").length >= 2,
    );
    assert.deepEqual(
      audioEvents
        .filter((event) => event.action === "speak")
        .slice(0, 2)
        .map((event) => event.text),
      ["ticket", "bill"],
    );
    await audioPage.waitForFunction(
      () => document.getElementById("playAudio").classList.contains("playing"),
    );
    await audioPage.locator("#next").click();
    audioSaved = await audioPage.evaluate(() =>
      JSON.parse(localStorage.getItem("english-quest-v2")),
    );
    assert.equal(audioSaved.round.queue[0].id, "en-n003");
    assert.equal(audioSaved.round.queue[1].id, "en-n002");
    assert.equal(audioSaved.round.queue[1].review, true);
    const expectedWindowTexts = await audioPage.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem("english-quest-v2"));
      return [
        ...new Set(
          saved.round.queue.slice(0, 10).map((task) =>
            window.STUDY_DATA.find((card) => card.id === task.id).english,
          ),
        ),
      ];
    });
    assert.equal(expectedWindowTexts.length, 10);
    audioEvents = await waitForWorkerEvents(
      "window",
      (events) =>
        events.filter((event) => event.action === "speak").length >=
        expectedWindowTexts.length + 1,
    );
    const generatedTexts = audioEvents
      .filter((event) => event.action === "speak")
      .map((event) => event.text);
    assert.deepEqual(
      generatedTexts.slice(0, 3),
      ["ticket", "bill", "platform"],
    );
    assert.deepEqual(
      new Set(generatedTexts),
      new Set(["ticket", ...expectedWindowTexts]),
    );
    assert.equal(new Set(generatedTexts).size, generatedTexts.length);
    assert.equal(
      generatedTexts.filter((text) => text === "bill").length,
      1,
    );
    assert.deepEqual(errors, []);
    await audioContext.close();
    console.log(
      "Áudio simulado: janela, prioridade, revisão, cache, indicador e progresso passaram.",
    );
    workerEvents.length = 0;
    const indicatorContext = await browser.newContext({
      serviceWorkers: "block",
      viewport: { width: 390, height: 844 },
    });
    const indicatorPage = await indicatorContext.newPage();
    indicatorPage.on("pageerror", (e) => errors.push(e.message));
    await indicatorPage.route("**/assets/tts-worker-*.js", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: fakeWorker.replaceAll(
          "/__worker_event",
          "/__worker_event?run=indicator",
        ),
      }),
    );
    await indicatorPage.addInitScript(() => {
      localStorage.setItem(
        "english-quest-v2",
        JSON.stringify({
          version: 2,
          settings: {
            categories: ["noun"],
            directions: ["reverse"],
            situation: "",
            amount: 100,
            repeatGap: 20,
            autoAudio: false,
            playbackRate: 0.75,
          },
          stats: {},
          round: {
            queue: [{ id: "en-n001", form: "base", skill: "reverse" }],
            repeatGap: 20,
            done: 0,
            phase: "question",
            failed: false,
            heard: false,
          },
          legacyV1: null,
        }),
      );
    });
    await indicatorPage.goto(url);
    await indicatorPage.locator("#prompt").waitFor({ state: "visible" });
    await indicatorPage.locator("#no").click();
    await indicatorPage.locator("#playAudio").click();
    await indicatorPage.waitForFunction(
      () => document.getElementById("audioText").textContent === "Gerando áudio…",
    );
    const indicatorEvents = await waitForWorkerEvents(
      "indicator",
      (events) => events.some((event) => event.action === "speak"),
    );
    assert.equal(
      indicatorEvents.find((event) => event.action === "speak").text,
      "ticket",
    );
    await indicatorPage.waitForFunction(
      () => document.getElementById("playAudio").classList.contains("playing"),
    );
    await indicatorContext.close();
    console.log(
      "Áudio manual: indicador atrasado, velocidade e reprodução simulada passaram.",
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
