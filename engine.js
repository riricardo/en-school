/* Sem DOM: cada forma/direção mantém sua sequência de 0 a 10. */
export const MAX = 10;
export const skills = ["forward", "reverse", "listening"];
export const forms = ["base", "present", "past"];
export const categories = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "other",
  "phrase",
  "paragraph",
];
export const key = (task) => JSON.stringify([task.id, task.form, task.skill]);
export const content = (card, form) =>
  form === "base" ? card : card.forms[form];

export function validateData(data) {
  if (!Array.isArray(data)) throw Error("Banco de conteúdo inválido.");
  const ids = new Set();
  for (const card of data) {
    if (
      !card ||
      typeof card.id !== "string" ||
      !card.id ||
      ids.has(card.id) ||
      !categories.includes(card.category) ||
      typeof card.english !== "string" ||
      !card.english.trim() ||
      typeof card.portuguese !== "string" ||
      !card.portuguese.trim()
    )
      throw Error("Cartão inválido.");
    ids.add(card.id);
    for (const form of ["present", "past"]) {
      const pair = card.forms?.[form];
      if (
        pair &&
        (typeof pair.english !== "string" ||
          !pair.english.trim() ||
          typeof pair.portuguese !== "string" ||
          !pair.portuguese.trim())
      )
        throw Error("Forma verbal inválida.");
    }
  }
  return data;
}
export function tasks(data, settings) {
  return data
    .filter(
      (card) =>
        settings.categories.includes(card.category) &&
        (!settings.situation ||
          (card.situations || []).includes(settings.situation)),
    )
    .flatMap((card) =>
      (card.category === "verb"
        ? forms.filter((form) => form === "base" || card.forms?.[form])
        : ["base"]
      ).flatMap((form) =>
        settings.directions.map((skill) => ({ id: card.id, form, skill })),
      ),
    );
}
export function proficiency(pool, stats) {
  const points = pool.reduce(
    (sum, task) =>
      sum + Math.min(MAX, Math.max(0, stats[key(task)]?.streak || 0)),
    0,
  );
  return pool.length ? (points / (pool.length * MAX)) * 100 : 0;
}
export function pick(pool, stats, amount, random = Math.random) {
  return pool
    .map((task) => {
      const stat = stats[key(task)];
      const weight = 1 + (stat?.errors || 0) * 2 + MAX - (stat?.streak || 0);
      return {
        task,
        priority: Math.pow(Math.max(0.000001, random()), 1 / weight),
      };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, amount)
    .map(({ task }) => ({ ...task }));
}
export function createRound(queue, repeatGap) {
  return {
    queue,
    repeatGap,
    done: 0,
    phase: "question",
    failed: false,
    heard: false,
  };
}
function record(stats, task, skill, known) {
  const stat = (stats[key({ ...task, skill })] ||= { streak: 0, errors: 0 });
  stat.streak = known ? Math.min(MAX, stat.streak + 1) : 0;
  if (!known) stat.errors++;
}
function finish(round) {
  const task = round.queue.shift();
  if (round.failed && !task.review) {
    const gap = Math.max(
      1,
      Math.min(2000, Math.round(Number(round.repeatGap) || 20)),
    );
    round.queue.splice(Math.min(gap, round.queue.length), 0, {
      ...task,
      review: true,
    });
  }
  round.done++;
  round.phase = "question";
  round.failed = false;
  round.heard = false;
}
export function markHeard(round) {
  if (round?.queue[0]?.skill === "listening" && round.phase === "question")
    round.heard = true;
}
// Registra o erro antes de mostrar a solução. Próxima apenas avança, sem pontuar de novo.
export function respond(round, stats, known) {
  const task = round?.queue[0];
  if (!task || !["question", "reading"].includes(round.phase)) return false;
  if (task.skill === "listening" && round.phase === "question") {
    if (!round.heard) return false;
    record(stats, task, "listening", known);
    if (known) {
      record(stats, task, "forward", true);
      finish(round);
    } else {
      round.failed = true;
      round.phase = "reading";
    }
  } else {
    const skill = round.phase === "reading" ? "forward" : task.skill;
    record(stats, task, skill, known);
    if (known) finish(round);
    else {
      round.failed = true;
      round.phase = "solution";
    }
  }
  return true;
}
export function next(round) {
  if (round?.queue.length && round.phase === "solution") {
    finish(round);
    return true;
  }
  return false;
}
