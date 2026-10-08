import { defineConfig } from "vite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
const root = fileURLToPath(new URL(".", import.meta.url));
const TTS_FOLDER = "tts/piper-1.0.0-ort-1.18.0";
function prepareFiles() {
  mkdirSync(join(root, "public", TTS_FOLDER), { recursive: true });
  // O data.js do usuário continua separado; este ZIP não substitui o conteúdo.
  const data = join(root, "data.js");
  if (existsSync(data)) copyFileSync(data, join(root, "public/data.js"));
  if (!existsSync(join(root, "public/data.js")))
    throw Error("Mantenha seu data.js anterior na raiz do projeto.");
  for (const file of ["ort-wasm.wasm", "ort-wasm-simd.wasm"])
    copyFileSync(
      join(root, "node_modules/onnxruntime-web/dist", file),
      join(root, "public", TTS_FOLDER, file),
    );
  for (const file of ["piper_phonemize.wasm", "piper_phonemize.data"])
    copyFileSync(
      join(root, "node_modules/@diffusionstudio/piper-wasm/build", file),
      join(root, "public", TTS_FOLDER, file),
    );
}
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesIn(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
}
// A biblioteca usa threads por padrão. Uma thread também funciona sem cabeçalhos especiais do GitHub Pages.
function piperCompatibility() {
  return {
    name: "piper-static-compatibility",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("@mintplex-labs/piper-tts-web/dist/piper-tts-web.js"))
        return;
      return code
        .replace(
          "ort.env.wasm.numThreads = navigator.hardwareConcurrency;",
          "ort.env.wasm.numThreads = 1;",
        )
        .replace(
          "https://huggingface.co/diffusionstudio/piper-voices/resolve/main",
          "https://huggingface.co/rhasspy/piper-voices/resolve/main",
        )
        .replace(
          "const module = await __privateGet(this, _createPiperPhonemize).call(this, {",
          "const module = await __privateGet(this, _createPiperPhonemize).call(this, { getPreloadedPackage: () => globalThis.__englishPiperData?.slice(0),",
        )
        .replace(
          "const res = await fetch(url);",
          'const res = await fetch(url); if (!res.ok) throw new Error("Voice download failed: " + res.status);',
        );
    },
  };
}
export default defineConfig(() => {
  prepareFiles();
  return {
    base: process.env.VITE_BASE_PATH || "/",
    build: { target: "es2022" },
    worker: { format: "es", plugins: () => [piperCompatibility()] },
    plugins: [
      piperCompatibility(),
      {
        name: "offline-snapshot",
        closeBundle() {
          const dist = join(root, "dist");
          const files = filesIn(dist)
            .map((file) => relative(dist, file).replaceAll("\\", "/"))
            .filter((file) => file !== "sw.js" && !file.startsWith("tts/"));
          const source = readFileSync(join(root, "sw.js"), "utf8").replace(
            "/* BUILD_FILES */ []",
            JSON.stringify(files),
          );
          writeFileSync(join(dist, "sw.js"), source);
        },
      },
    ],
  };
});
