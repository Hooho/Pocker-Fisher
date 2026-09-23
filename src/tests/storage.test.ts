import { test } from "node:test";
import assert from "node:assert/strict";
import { blank, parseSave, summarizeSaveRecords } from "../domain/storage/storage";
import { newGame, hero } from "../domain/game/engine";
test("a tournament export can be imported unchanged", () => {
  const save = {
    ...blank,
    game: newGame([hero, { ...hero, id: 0 }]),
    tournament: {
      round: 0,
      field: [hero, { ...hero, id: 0 }],
      finalStandings: [hero, { ...hero, id: 0 }],
      background: { remaining: [], qualified: [], done: true },
      seed: Date.now(),
      pace: 10,
      out: false,
      paused: true,
      autoSimulating: false,
      simulationComplete: false,
      complete: false,
      results: [],
    },
    savedAt: new Date().toISOString(),
  };
  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(save))), save);
});
test("a suspended championship keeps its table and current simulation progress", () => {
  const game = newGame([hero, { ...hero, id: 7 }]);
  const tournament = {
    round: 0,
    field: [hero, { ...hero, id: 7 }, { ...hero, id: 8 }],
    background: { remaining: [{ ...hero, id: 8 }], qualified: [], done: false },
    seed: 123,
    pace: 10,
    out: false,
    paused: true,
    autoSimulating: false,
    simulationComplete: false,
    complete: false,
    results: [],
  };
  const save = { ...blank, pausedTournament: { game, tournament }, savedAt: new Date().toISOString() };
  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(save))), save);
});
test("duplicate cards and negative chips in imports are rejected", () => {
  const g = newGame([hero, { ...hero, id: 0 }]);
  g.players[0].cards[0] = g.players[1].cards[0];
  assert.throws(() => parseSave({ ...blank, game: g }));
  const g2 = newGame([hero, { ...hero, id: 0 }]);
  g2.players[0].chips = -1;
  assert.throws(() => parseSave({ ...blank, game: g2 }));
});
test("import overwrite detection ignores a blank save", () => {
  assert.equal(summarizeSaveRecords(blank).hasExistingData, false);
});
test("import overwrite detection finds progress and personalization", () => {
  const withProgress = {
    ...blank,
    stats: { ...blank.stats, hands: 12, tournaments: 1 },
  };
  assert.deepEqual(summarizeSaveRecords(withProgress), {
    hasExistingData: true,
    hasActiveGame: false,
    hands: 12,
    championships: 1,
    playerRecords: 0,
    hasPersonalization: false,
  });
  assert.equal(
    summarizeSaveRecords({
      ...blank,
      playerProfile: { ...blank.playerProfile, name: "阿河" },
    }).hasExistingData,
    true,
  );
});
