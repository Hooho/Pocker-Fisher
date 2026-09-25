import { test } from "node:test";
import assert from "node:assert/strict";
import { blank, parseSave } from "../domain/storage/storage";
import { hero, newGame } from "../domain/game/engine";

test("match sessions stay separated between an active cash game and a suspended championship", () => {
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
  const save = {
    ...blank,
    activeMatch: { id: "cash-1", mode: "cash" as const },
    pausedTournament: {
      game,
      tournament,
      match: { id: "championship-1", mode: "championship" as const },
    },
    savedAt: new Date().toISOString(),
  };

  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(save))), save);
  const legacySave = {
    ...save,
    matchTimer: { matchId: "cash-1", mode: "cash" as const, elapsedMs: 12500 },
    pausedTournament: {
      ...save.pausedTournament,
      matchTimer: { matchId: "championship-1", mode: "championship" as const, elapsedMs: 98765 },
    },
  };
  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(legacySave))), save);
});
