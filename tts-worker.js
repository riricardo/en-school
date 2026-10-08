/* Piper em uma thread separada: a interface continua responsiva durante a geração. */
import { TtsSession } from "@mintplex-labs/piper-tts-web";
const VOICE = "en_GB-alan-medium";
const nativeFetch = self.fetch.bind(self);
let session = null;
let preparing = null;
let chain = Promise.resolve();
const send = (id, type, fields = {}) =>
  self.postMessage({ id, type, ...fields });
async function prepare(id, base) {
  if (session) return;
  if (preparing) return preparing;
  preparing = (async () => {
    if (!navigator.storage?.getDirectory)
      throw Error("Este navegador não oferece armazenamento de voz.");
    send(id, "progress", { percent: null });
    const assetBase = new URL("tts/piper-1.0.0-ort-1.18.0/", base).href;
    const networkFetch = nativeFetch;
    const cache = await caches.open(
      "english-quest-" + encodeURIComponent(new URL(base).pathname) + "-v2-tts",
    );
    // Guarda binários mesmo se o primeiro Worker foi criado antes de o SW controlar a página.
    self.fetch = async (input, options) => {
      const url =
        typeof input === "string" ? input : input.url || String(input);
      if (!url.startsWith(assetBase)) return networkFetch(input, options);
      const hit = await cache.match(url);
      if (hit) return hit;
      const response = await networkFetch(input, options);
      if (!response.ok) throw Error("Falha ao baixar o motor de áudio.");
      await cache.put(url, response.clone());
      return response;
    };
    const phonemes = await self.fetch(
      new URL("piper_phonemize.data", assetBase).href,
    );
    self.__englishPiperData = await phonemes.arrayBuffer();
    const ready = await TtsSession.create({
      voiceId: VOICE,
      wasmPaths: {
        onnxWasm: new URL("tts/piper-1.0.0-ort-1.18.0/", base).href,
        piperWasm: new URL(
          "tts/piper-1.0.0-ort-1.18.0/piper_phonemize.wasm",
          base,
        ).href,
        piperData: new URL(
          "tts/piper-1.0.0-ort-1.18.0/piper_phonemize.data",
          base,
        ).href,
      },
      progress: (event) => {
        if (event.url.endsWith(".onnx"))
          send(id, "progress", {
            percent:
              event.total > 0
                ? Math.min(95, Math.floor((event.loaded / event.total) * 95))
                : null,
          });
      },
    });
    send(id, "progress", { percent: 97 });
    // Primeira geração prepara também o fonemizador. O som não é reproduzido.
    await ready.predict("Ready.");
    session = ready;
  })();
  try {
    await preparing;
  } finally {
    preparing = null;
  }
}
self.onmessage = (event) => {
  const { id, action, text, base } = event.data;
  // Uma geração por vez evita executar duas inferências simultâneas na mesma sessão.
  chain = chain
    .catch(() => {})
    .then(async () => {
      try {
        await prepare(id, base);
        if (action === "prepare") send(id, "ready");
        else if (
          action === "speak" &&
          typeof text === "string" &&
          text.trim()
        ) {
          const blob = await session.predict(text);
          send(id, "audio", { blob });
        } else throw Error("Pedido de áudio inválido.");
      } catch (error) {
        TtsSession._instance = null;
        session = null;
        send(id, "error", { message: error.message || "Falha no áudio." });
      }
    });
};
