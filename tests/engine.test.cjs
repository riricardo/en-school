const test = require("node:test");
const assert = require("node:assert/strict");
const engine = import("../engine.js");
const task = { id: "item-1", form: "past", skill: "forward" };
test("Sequências por item, forma e direção; dez acertos e reset individual", async () => {
  const E = await engine,
    stats = {};
  for (let i = 0; i < 12; i++)
    E.respond(E.createRound([{ ...task }], 20), stats, true);
  assert.equal(stats[E.key(task)].streak, 10);
  const opposite = { ...task, skill: "reverse" };
  E.respond(E.createRound([opposite], 20), stats, true);
  const base = { ...task, form: "base" };
  E.respond(E.createRound([base], 20), stats, true);
  const round = E.createRound([task], 20);
  E.respond(round, stats, false);
  assert.equal(stats[E.key(task)].streak, 0);
  assert.equal(stats[E.key(opposite)].streak, 1);
  assert.equal(stats[E.key(base)].streak, 1);
  assert.equal(round.phase, "solution");
  assert.equal(E.respond(round, stats, false), false);
  assert.equal(stats[E.key(task)].errors, 1);
  const restored = JSON.parse(JSON.stringify(round));
  E.next(restored);
  assert.equal(restored.queue[0].review, true);
  E.respond(restored, stats, false);
  E.next(restored);
  assert.equal(restored.queue.length, 0);
});
test("Listening só pontua após ouvir e também credita EN→PT", async () => {
  const E = await engine,
    stats = {},
    t = { ...task, skill: "listening" },
    r = E.createRound([t], 20);
  assert.equal(E.respond(r, stats, true), false);
  assert.deepEqual(stats, {});
  E.markHeard(r);
  E.respond(r, stats, true);
  assert.equal(stats[E.key(t)].streak, 1);
  assert.equal(stats[E.key(task)].streak, 1);
  assert.equal(r.queue.length, 0);
});
test("Erro listening mostra leitura; leitura correta não restaura listening", async () => {
  const E = await engine,
    t = { ...task, skill: "listening" },
    stats = {
      [E.key(t)]: { streak: 8, errors: 0 },
      [E.key(task)]: { streak: 5, errors: 0 },
    };
  const r = E.createRound([t], 20);
  E.markHeard(r);
  E.respond(r, stats, false);
  assert.equal(r.phase, "reading");
  assert.equal(stats[E.key(t)].streak, 0);
  assert.equal(stats[E.key(task)].streak, 5);
  const restored = JSON.parse(JSON.stringify(r));
  E.respond(restored, stats, true);
  assert.equal(stats[E.key(task)].streak, 6);
  assert.equal(stats[E.key(t)].streak, 0);
  assert.equal(restored.queue[0].review, true);
});
test("Erro na segunda etapa zera EN→PT; Próxima não registra novo erro", async () => {
  const E = await engine,
    t = { ...task, skill: "listening" },
    stats = { [E.key(task)]: { streak: 9, errors: 0 } };
  const r = E.createRound([t], 20);
  E.markHeard(r);
  E.respond(r, stats, false);
  E.respond(r, stats, false);
  assert.equal(r.phase, "solution");
  assert.equal(stats[E.key(task)].streak, 0);
  assert.equal(stats[E.key(task)].errors, 1);
  E.next(r);
  assert.equal(stats[E.key(task)].errors, 1);
});
test("Revisão após N cartões e limite de uma revisão", async () => {
  const E = await engine,
    stats = {},
    tail = Array.from({ length: 30 }, (_, i) => ({ ...task, id: "x" + i })),
    r = E.createRound([task, ...tail], 20);
  E.respond(r, stats, false);
  E.next(r);
  assert.equal(r.queue[20].id, task.id);
  assert.equal(r.queue[20].review, true);
  const short = E.createRound([task, tail[0]], 20);
  E.respond(short, {}, false);
  E.next(short);
  assert.equal(short.queue.at(-1).review, true);
});
test("Proficiência e formas básicas; não gera particípio/-ing ou missões", async () => {
  const E = await engine,
    cards = [
      {
        id: "x",
        category: "verb",
        english: "EN",
        portuguese: "PT",
        forms: {
          present: { english: "EN-PRESENT", portuguese: "PT-PRESENT" },
          past: { english: "EN-PAST", portuguese: "PT-PAST" },
          ing: { english: "EN-ING", portuguese: "PT-ING" },
        },
      },
    ];
  const pool = E.tasks(cards, {
    categories: E.categories,
    directions: E.skills,
    situation: "",
  });
  assert.equal(pool.length, 9);
  const stats = Object.fromEntries(
    pool.map((t) => [E.key(t), { streak: 10, errors: 0 }]),
  );
  assert.equal(E.proficiency(pool, stats), 100);
  stats[E.key(pool[0])].streak = 9;
  assert.ok(E.proficiency(pool, stats) < 100);
  assert.equal(E.pick(pool, stats, 4, () => 0.5).length, 4);
});
