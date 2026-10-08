import "./style.css";
import * as E from "./engine.js";
import * as C from "./catalog.js";
import { PiperAudio } from "./audio.js";

const $ = (id) => document.getElementById(id);
const KEY = "english-quest-v2";
const OLD_KEY = "english-quest-v1";
const labels = {
  forward: "EN → PT",
  reverse: "PT → EN",
  listening: "Listening",
};
const defaults = () => ({
  version: 2,
  settings: {
    categories: [...E.categories],
    directions: ["forward", "reverse"],
    situation: "",
    amount: 100,
    repeatGap: 20,
    autoAudio: false,
  },
  stats: {},
  round: null,
  legacyV1: null,
});
const clamp = (value, min, max, fallback) =>
  Number.isFinite(Number(value))
    ? Math.max(min, Math.min(max, Math.round(Number(value))))
    : fallback;
let state = defaults();
let storageHealthy = true;
let data = [];
let lastSignature = "";
const audio = new PiperAudio();

function normalizeSettings(settings = {}) {
  const base = defaults().settings;
  return {
    categories: Array.isArray(settings.categories)
      ? [
          ...new Set(
            settings.categories.filter((x) => E.categories.includes(x)),
          ),
        ]
      : base.categories,
    directions: Array.isArray(settings.directions)
      ? [...new Set(settings.directions.filter((x) => E.skills.includes(x)))]
      : base.directions,
    situation: typeof settings.situation === "string" ? settings.situation : "",
    amount: Math.max(
      100,
      Math.min(
        2000,
        Math.round(clamp(settings.amount, 100, 2000, 100) / 100) * 100,
      ),
    ),
    repeatGap: clamp(settings.repeatGap, 1, 2000, 20),
    autoAudio: settings.autoAudio === true,
  };
}
function validTask(task) {
  return (
    task &&
    typeof task.id === "string" &&
    E.forms.includes(task.form) &&
    E.skills.includes(task.skill)
  );
}
function validateState(saved) {
  if (
    !saved ||
    saved.version !== 2 ||
    !saved.stats ||
    typeof saved.stats !== "object" ||
    Array.isArray(saved.stats)
  )
    throw Error("Progresso inválido.");
  const result = {
    ...defaults(),
    ...saved,
    settings: normalizeSettings(saved.settings),
  };
  for (const [key, stat] of Object.entries(result.stats)) {
    const parts = JSON.parse(key);
    if (
      !Array.isArray(parts) ||
      !validTask({ id: parts[0], form: parts[1], skill: parts[2] }) ||
      !stat ||
      !Number.isInteger(stat.streak) ||
      stat.streak < 0 ||
      stat.streak > 10 ||
      !Number.isInteger(stat.errors) ||
      stat.errors < 0
    )
      throw Error("Sequência inválida.");
  }
  if (result.round) {
    const r = result.round;
    if (
      !Array.isArray(r.queue) ||
      r.queue.some((task) => !validTask(task)) ||
      !["question", "reading", "solution"].includes(r.phase) ||
      !Number.isInteger(r.done) ||
      r.done < 0 ||
      typeof r.failed !== "boolean" ||
      typeof r.heard !== "boolean"
    )
      throw Error("Rodada inválida.");
    if (r.phase === "reading" && r.queue[0]?.skill !== "listening")
      throw Error("Etapa inválida.");
    r.repeatGap = result.settings.repeatGap;
  }
  return result;
}
try {
  // Carrega o conteúdo externo sem incluí-lo no bundle nem no ZIP de atualização.
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = import.meta.env.BASE_URL + "data.js";
    script.onload = resolve;
    script.onerror = () => reject(Error("Conteúdo indisponível."));
    document.head.append(script);
  });
  data = E.validateData(window.STUDY_DATA);
  const current = localStorage.getItem(KEY);
  if (current) state = validateState(JSON.parse(current));
  else {
    const oldText = localStorage.getItem(OLD_KEY);
    if (oldText) {
      const old = JSON.parse(oldText);
      if (old?.version !== 1) throw Error("Histórico antigo inválido.");
      // Níveis antigos não eram acertos consecutivos. Arquiva o estado completo sem inventar sequências.
      state.settings = normalizeSettings(old.settings);
      state.legacyV1 = old;
    }
  }
} catch {
  storageHealthy = false;
  $("storageWarning").textContent =
    "Não foi possível ler os dados. O progresso salvo foi mantido.";
  $("storageWarning").hidden = false;
}
const byId = new Map(data.map((card) => [card.id, card]));
function save() {
  if (!storageHealthy) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    $("storageWarning").hidden = false;
  }
}
function pool(settings = state.settings) {
  return E.tasks(data, settings);
}
function scores() {
  $("scores").replaceChildren(
    ...E.skills.map((skill) => {
      const p = E.proficiency(
        pool({
          ...state.settings,
          categories: [...E.categories],
          situation: "",
          directions: [skill],
        }),
        state.stats,
      );
      const card = document.createElement("div");
      card.className = "skill-progress";
      const header = document.createElement("header");
      const label = document.createElement("span");
      label.textContent = labels[skill];
      const value = document.createElement("strong");
      value.textContent =
        (Math.floor(p * 10) / 10).toLocaleString("pt-BR") + "%";
      header.append(label, value);
      const track = document.createElement("div");
      track.className = "track";
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", labels[skill]);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "100");
      track.setAttribute("aria-valuenow", String(p));
      const fill = document.createElement("div");
      fill.style.width = p + "%";
      track.append(fill);
      card.append(header, track);
      return card;
    }),
  );
}
function currentPair() {
  const task = state.round?.queue[0];
  const card = byId.get(task?.id);
  return card && (task.form === "base" || card.forms?.[task.form])
    ? { task, card, pair: E.content(card, task.form) }
    : null;
}
function canPlay() {
  const c = currentPair();
  if (!c) return false;
  return c.task.skill !== "reverse" || state.round.phase === "solution";
}
function play() {
  const c = currentPair();
  if (!c || !canPlay() || $("settings").open) return;
  const signature =
    state.round.done + ":" + E.key(c.task) + ":" + state.round.phase;
  audio.speak(c.pair.english, () => {
    if (
      !state.round?.queue[0] ||
      signature !==
        state.round.done +
          ":" +
          E.key(state.round.queue[0]) +
          ":" +
          state.round.phase
    )
      return;
    E.markHeard(state.round);
    save();
    updateAnswers();
  });
}
function updateAnswers() {
  const task = state.round?.queue[0];
  const waiting =
    task?.skill === "listening" &&
    state.round.phase === "question" &&
    !state.round.heard;
  $("yes").disabled = !!waiting || !storageHealthy;
  $("no").disabled = !!waiting || !storageHealthy;
}
function render() {
  scores();
  settingsValues();
  const c = currentPair(),
    r = state.round;
  $("answers").hidden = !c || r.phase === "solution";
  $("next").hidden = !c || r.phase !== "solution";
  $("next").disabled = !storageHealthy;
  $("completed").hidden = !r || !!r.queue.length;
  $("empty").hidden = !!c || (!!r && !r.queue.length);
  $("prompt").hidden =
    !c || (c.task.skill === "listening" && r.phase === "question");
  $("solution").hidden = !c || r.phase !== "solution";
  $("playAudio").hidden = !canPlay();
  $("roundSummary").textContent = c
    ? `${r.queue.length} desafios restantes`
    : "";
  if (!c) {
    audio.stop();
    lastSignature = "";
    $("prompt").textContent = "";
    updateAudioStatus();
    return;
  }
  const { task, card, pair } = c;
  $("prompt").textContent =
    task.skill === "reverse" ? pair.portuguese : pair.english;
  $("prompt").classList.toggle("paragraph", card.category === "paragraph");
  $("solution").textContent =
    task.skill === "reverse" ? pair.english : pair.portuguese;
  updateAnswers();
  const signature = r.done + ":" + E.key(task) + ":" + r.phase;
  if (signature !== lastSignature) {
    lastSignature = signature;
    audio.stop();
    if (
      !$("settings").open &&
      canPlay() &&
      ((task.skill === "listening" && r.phase === "question") ||
        state.settings.autoAudio)
    )
      play();
  }
  updateAudioStatus();
}
function start() {
  if (!storageHealthy) return;
  audio.unlock();
  const queue = E.pick(pool(), state.stats, state.settings.amount);
  state.round = queue.length
    ? E.createRound(queue, state.settings.repeatGap)
    : null;
  save();
  closeSettings();
  lastSignature = "";
  render();
}
function respond(known) {
  if (!storageHealthy) return;
  audio.unlock();
  if (E.respond(state.round, state.stats, known)) {
    save();
    render();
  }
}
function checkboxes(node, entries, selected, change) {
  node.replaceChildren(
    ...entries.map(([value, label]) => {
      const row = document.createElement("label");
      row.className = "toggle";
      row.append(document.createTextNode(label));
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.checked = selected.includes(value);
      input.onchange = change;
      row.append(input);
      return row;
    }),
  );
}
function settingsValues() {
  $("amount").textContent = state.settings.amount;
  $("less").disabled = state.settings.amount <= 100;
  $("more").disabled = state.settings.amount >= 2000;
  $("restart").disabled = !pool().length || !storageHealthy;
  $("newRound").disabled = !pool().length || !storageHealthy;
}
function readChecks(node) {
  return [...node.querySelectorAll("input:checked")].map(
    (input) => input.value,
  );
}
function updateSelection() {
  state.settings.categories = readChecks($("categoryChecks"));
  state.settings.directions = readChecks($("directionChecks"));
  save();
  settingsValues();
  if (state.settings.directions.includes("listening")) prepareAudio();
}
function openSettings() {
  audio.stop();
  lastSignature = "";
  checkboxes(
    $("directionChecks"),
    E.skills.map((skill) => [skill, labels[skill]]),
    state.settings.directions,
    updateSelection,
  );
  checkboxes(
    $("categoryChecks"),
    C.categories,
    state.settings.categories,
    updateSelection,
  );
  $("situation").replaceChildren(
    new Option("Todas", ""),
    ...C.situations.map(([id, name]) => new Option(name, id)),
  );
  $("situation").value = state.settings.situation;
  $("repeatGap").value = state.settings.repeatGap;
  $("autoAudio").checked = state.settings.autoAudio;
  settingsValues();
  $("lesson").hidden = true;
  document.body.classList.add("config-open");
  $("settingsButton").setAttribute("aria-expanded", "true");
  $("settings").showModal();
  updateAudioStatus();
}
function restoreLesson() {
  $("lesson").hidden = false;
  document.body.classList.remove("config-open");
  $("settingsButton").setAttribute("aria-expanded", "false");
  render();
}
function closeSettings() {
  if ($("settings").open) $("settings").close();
}
async function prepareAudio() {
  audio.unlock();
  try {
    await audio.prepare();
  } catch {}
}
function updateAudioStatus() {
  const { state: status, percent } = audio.status;
  let message = "";
  if (status === "preparing")
    message = "Preparando áudio…" + (percent === null ? "" : ` ${percent}%`);
  else if (status === "generating") message = "Preparando áudio…";
  else if (status === "error") message = "Não foi possível preparar o áudio.";
  else if (status === "tap") message = "Toque para ouvir.";
  $("audioText").textContent = message;
  $("audioMessage").hidden = !message || !canPlay();
  $("retryAudio").hidden = status !== "error";
  $("settingsAudio").textContent = message;
  $("settingsAudio").hidden = !message;
  $("settingsRetry").hidden = status !== "error";
  $("playAudio").classList.toggle("playing", status === "playing");
  $("playAudio").disabled = status === "preparing" || status === "generating";
  updateAnswers();
}
audio.addEventListener("status", updateAudioStatus);
$("settingsButton").onclick = openSettings;
$("closeSettings").onclick = closeSettings;
$("settings").addEventListener("close", restoreLesson);
$("settings").addEventListener("cancel", (event) => {
  event.preventDefault();
  closeSettings();
});
$("yes").onclick = () => respond(true);
$("no").onclick = () => respond(false);
$("next").onclick = () => {
  audio.unlock();
  if (E.next(state.round)) {
    save();
    render();
  }
};
$("restart").onclick = start;
$("newRound").onclick = start;
$("playAudio").onclick = () => {
  audio.unlock();
  play();
};
$("retryAudio").onclick = () => {
  audio.unlock();
  play();
};
$("settingsRetry").onclick = prepareAudio;
$("autoAudio").onchange = () => {
  state.settings.autoAudio = $("autoAudio").checked;
  save();
  if (state.settings.autoAudio) prepareAudio();
};
$("situation").onchange = () => {
  state.settings.situation = $("situation").value;
  save();
  settingsValues();
};
$("repeatGap").onchange = () => {
  state.settings.repeatGap = clamp($("repeatGap").value, 1, 2000, 20);
  if (state.round) state.round.repeatGap = state.settings.repeatGap;
  $("repeatGap").value = state.settings.repeatGap;
  save();
};
for (const [id, step] of [
  ["less", -100],
  ["more", 100],
])
  $(id).onclick = () => {
    state.settings.amount = Math.max(
      100,
      Math.min(2000, state.settings.amount + step),
    );
    save();
    settingsValues();
  };
$("resetProgress").onclick = () => {
  if (
    !confirm(
      "Zerar o progresso do inglês? As preferências e o japonês serão mantidos.",
    )
  )
    return;
  const cleared = { ...defaults(), settings: state.settings };
  try {
    localStorage.setItem(KEY, JSON.stringify(cleared));
    localStorage.removeItem(OLD_KEY);
  } catch {
    $("storageWarning").hidden = false;
    return;
  }
  state = cleared;
  storageHealthy = true;
  $("storageWarning").hidden = true;
  start();
};
// Retoma a solução/segunda etapa sem registrar o mesmo erro novamente.
if (state.round) render();
else if (storageHealthy && data.length) start();
else render();
if (storageHealthy) save();
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  let reloading = false;
  const controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controlled && !reloading) {
      reloading = true;
      save();
      location.reload();
    }
  });
  navigator.serviceWorker
    .register(import.meta.env.BASE_URL + "sw.js", { updateViaCache: "none" })
    .then((reg) => {
      reg.update().catch(() => {});
      window.addEventListener("online", () => reg.update().catch(() => {}));
    })
    .catch(() => {});
}
