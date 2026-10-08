/* Piper em uma thread separada: a interface continua responsiva durante a geração. */
export class PiperAudio extends EventTarget {
  constructor() {
    super();
    this.ready = false;
    this.pending = new Map();
    this.jobs = new Map();
    this.queue = [];
    this.cache = new Map();
    this.window = new Set();
    this.id = 0;
    this.epoch = 0;
    this.audio = new Audio();
    this.playbackRate = 1;
    this.status = { state: "idle", percent: null };
    this.base = new URL(import.meta.env.BASE_URL, location.origin).href;
  }
  report(state, percent = null) {
    this.status = { state, percent };
    this.dispatchEvent(new Event("status"));
  }
  ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL("./tts-worker.js", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        this.report("preparing", data.percent);
        return;
      }
      const request = this.pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timer);
      this.pending.delete(data.id);
      if (data.type === "error") request.reject(Error(data.message));
      else request.resolve(data);
    };
    this.worker.onerror = () => this.failWorker();
  }
  failWorker(error = Error("Não foi possível preparar o áudio.")) {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    for (const job of this.jobs.values()) {
      if (job.requested) job.reject(error);
      else job.resolve(null);
    }
    this.jobs.clear();
    this.queue.length = 0;
    if (this.prepareJob) {
      this.prepareJob.reject(error);
      this.prepareJob = null;
    }
    this.report("error");
  }
  request(action, text) {
    this.ensureWorker();
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timer = setTimeout(() => this.failWorker(), 180000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, action, text, base: this.base });
    });
  }
  schedulePump() {
    if (this.pumpScheduled || this.pumping) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }
  async prepareWorker() {
    if (this.ready) return;
    this.report("preparing");
    await this.request("prepare");
    this.ready = true;
    this.report("ready");
  }
  createJob(text, requested) {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => {});
    const job = { text, requested, resolve, reject, promise, running: false };
    this.jobs.set(text, job);
    return job;
  }
  enqueue(text, requested = false) {
    const cached = this.cache.get(text);
    if (cached) return Promise.resolve(cached);
    let job = this.jobs.get(text);
    if (!job) job = this.createJob(text, requested);
    else if (requested) job.requested = true;
    if (requested && job.running) this.report("generating");
    if (requested && !job.running) {
      this.queue = this.queue.filter((queued) => queued !== job);
      this.queue.unshift(job);
    } else if (!job.running && !this.queue.includes(job)) {
      this.queue.push(job);
    }
    this.schedulePump();
    return job.promise;
  }
  setWindow(texts) {
    this.window = new Set(texts.filter((text) => typeof text === "string" && text));
    for (const job of [...this.queue]) {
      if (
        job !== this.prepareJob &&
        !job.requested &&
        !this.window.has(job.text)
      ) {
        this.queue = this.queue.filter((queued) => queued !== job);
        if (this.jobs.get(job.text) === job) this.jobs.delete(job.text);
        job.resolve(null);
      }
    }
    const priority = this.queue.filter(
      (job) => job === this.prepareJob || job.requested,
    );
    const ordered = [];
    for (const text of this.window) {
      if (this.cache.has(text)) continue;
      let job = this.jobs.get(text);
      if (!job) job = this.createJob(text, false);
      if (!job.running && !job.requested) ordered.push(job);
    }
    this.queue = [...priority, ...ordered];
    this.trimCache();
    this.schedulePump();
  }
  trimCache() {
    for (const text of this.cache.keys()) {
      if (
        !this.window.has(text) &&
        text !== this.requestedText &&
        text !== this.playingText
      )
        this.cache.delete(text);
    }
  }
  has(text) {
    return this.cache.has(text);
  }
  setPlaybackRate(rate) {
    this.playbackRate = rate;
    this.audio.playbackRate = rate;
  }
  async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        if (job === this.prepareJob) {
          try {
            await this.prepareWorker();
            job.resolve();
          } catch (error) {
            job.reject(error);
            this.failWorker(error);
          } finally {
            if (this.prepareJob === job) this.prepareJob = null;
          }
          continue;
        }
        if (job.running || this.jobs.get(job.text) !== job) continue;
        job.running = true;
        try {
          await this.prepareWorker();
          if (job.requested) this.report("generating");
          const { blob } = await this.request("speak", job.text);
          if (
            this.window.has(job.text) ||
            job.requested ||
            this.playingText === job.text
          )
            this.cache.set(job.text, blob);
          if (this.jobs.get(job.text) === job) this.jobs.delete(job.text);
          job.resolve(blob);
          this.trimCache();
          if (
            !this.queue.length &&
            !this.playingText &&
            !this.requestedText
          )
            this.report("ready");
        } catch (error) {
          job.reject(error);
          this.failWorker(error);
        }
      }
    } finally {
      this.pumping = false;
      if (this.queue.length) this.schedulePump();
    }
  }
  // Desbloqueia o mesmo elemento de áudio dentro de um toque do usuário, quando permitido.
  unlock() {
    if (this.unlocked || !navigator.userActivation?.isActive) return;
    this.unlocked = true;
    const bytes = new ArrayBuffer(44 + 882);
    const v = new DataView(bytes);
    const word = (offset, text) =>
      [...text].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
    word(0, "RIFF");
    v.setUint32(4, bytes.byteLength - 8, true);
    word(8, "WAVE");
    word(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 44100, true);
    v.setUint32(28, 88200, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    word(36, "data");
    v.setUint32(40, 882, true);
    this.url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    this.audio.src = this.url;
    this.audio.play().catch(() => {});
  }
  stop() {
    this.epoch++;
    const requested = this.requestedText;
    this.requestedText = null;
    const job = requested && this.jobs.get(requested);
    if (job?.requested) job.requested = false;
    this.playingText = null;
    this.audio.onended = null;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    if (requested) this.setWindow([...this.window]);
    this.trimCache();
    if (["playing", "tap"].includes(this.status.state)) this.report("ready");
  }
  async speak(text, onEnded) {
    this.stop();
    const epoch = this.epoch;
    this.requestedText = text;
    try {
      const blob = await this.enqueue(text, true);
      if (!blob || epoch !== this.epoch) return;
      this.requestedText = null;
      this.playingText = text;
      this.trimCache();
      this.url = URL.createObjectURL(blob);
      this.audio.src = this.url;
      this.audio.playbackRate = this.playbackRate;
      this.audio.onended = () => {
        if (epoch !== this.epoch) return;
        this.playingText = null;
        this.trimCache();
        this.report("ready");
        onEnded?.();
      };
      try {
        await this.audio.play();
        if (epoch === this.epoch) this.report("playing");
      } catch {
        if (epoch === this.epoch) this.report("tap");
      }
    } catch {
      if (epoch === this.epoch) this.report("error");
    }
  }
  async prepare() {
    if (this.ready) return;
    if (this.prepareJob) return this.prepareJob.promise;
    this.explicitPreparing = true;
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => {});
    const job = { resolve, reject, promise };
    this.prepareJob = job;
    this.queue.unshift(job);
    this.schedulePump();
    try {
      await promise;
    } finally {
      this.explicitPreparing = false;
    }
  }
}
