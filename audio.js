/* Download automático, cache de áudio limitado e cancelamento ao trocar de cartão. */
export class PiperAudio extends EventTarget {
  constructor() {
    super();
    this.ready = false;
    this.pending = new Map();
    this.cache = new Map();
    this.id = 0;
    this.epoch = 0;
    this.audio = new Audio();
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
  failWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(Error("Não foi possível preparar o áudio."));
    }
    this.pending.clear();
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
  async prepare() {
    if (this.ready) return;
    if (this.preparing) return this.preparing;
    this.report("preparing");
    this.preparing = (async () => {
      try {
        await this.request("prepare");
        this.ready = true;
        this.report("ready");
      } catch (error) {
        this.failWorker();
        throw error;
      }
    })();
    try {
      await this.preparing;
    } finally {
      this.preparing = null;
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
    this.audio.onended = null;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    if (
      this.ready &&
      ["playing", "generating", "tap"].includes(this.status.state)
    )
      this.report("ready");
  }
  async speak(text, onEnded) {
    this.stop();
    const epoch = this.epoch;
    try {
      await this.prepare();
      if (epoch !== this.epoch) return;
      this.report("generating");
      let blob = this.cache.get(text);
      if (!blob) {
        ({ blob } = await this.request("speak", text));
        this.cache.set(text, blob);
        // As vozes ficam em OPFS; ondas geradas ficam apenas neste cache em memória.
        if (this.cache.size > 20)
          this.cache.delete(this.cache.keys().next().value);
      }
      if (epoch !== this.epoch) return;
      this.url = URL.createObjectURL(blob);
      this.audio.src = this.url;
      this.audio.onended = () => {
        if (epoch !== this.epoch) return;
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
      if (epoch === this.epoch) this.failWorker();
    }
  }
}
