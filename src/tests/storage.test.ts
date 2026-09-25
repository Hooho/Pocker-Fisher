import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  loadSave,
  parseSave,
  saveData,
  isSaveValidationError,
  summarizeSaveRecords,
} from "../domain/storage/storage";
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
test("an active hand can be saved and imported unchanged", () => {
  const game = newGame(
    [hero, { ...hero, id: 0 }, { ...hero, id: 1 }],
    100,
  );
  const save = { ...blank, game, savedAt: new Date().toISOString() };
  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(save))), save);

  const board = [10, 11, 12, 0, 1];
  const players = game.players.map((player, index) => ({
    ...player,
    chips: 10000,
    cards: index === 0 ? [8, 9] : [2 + index * 2, 3 + index * 2],
    bet: 0,
    total: 0,
    folded: false,
    acted: false,
    start: 10000,
  }));
  const reserved = new Set([...board, ...players.flatMap((player) => player.cards)]);
  const legacyDeck = Array.from({ length: 52 }, (_, card) => card)
    .filter((card) => !reserved.has(card))
    .slice(0, 38);
  const legacyGame = {
    ...game,
    players,
    board,
    deck: legacyDeck,
    street: 3,
    done: true,
    result: "牌局结束",
    winners: [0],
  };
  const legacySave = { ...blank, game: legacyGame, savedAt: save.savedAt };
  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(legacySave))), legacySave);
  const legacyPaddedSave = {
    ...legacySave,
    game: { ...legacyGame, deck: [...legacyDeck, 40, 41, 42] },
  };
  assert.deepEqual(parseSave(JSON.parse(JSON.stringify(legacyPaddedSave))), legacySave);
});
test("an unrecoverable active game does not block the rest of a save", () => {
  const game = newGame([hero, { ...hero, id: 0 }]);
  const corrupted = {
    ...blank,
    game: { ...game, deck: [] },
    stats: { ...blank.stats, hands: 3 },
  };
  const recovered = parseSave(JSON.parse(JSON.stringify(corrupted)));
  assert.equal(recovered.game, null);
  assert.equal(recovered.tournament, null);
  assert.equal(recovered.stats.hands, 3);
});
test("legacy AI memories are discarded during import", () => {
  const parsed = parseSave({
    ...blank,
    memories: { "0": ["旧版交手记录"] },
  });
  assert.equal("memories" in parsed, false);
});
test("a suspended championship keeps its table and current simulation progress", () => {
  const game = newGame([hero, { ...hero, id: 7 }]);
  const tournament = {
    round: 0,
    field: [hero, { ...hero, id: 7 }, { ...hero, id: 8 }],
    resetStacksEachRound: true,
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

test("invalid saves are rejected before any storage write", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } satisfies Storage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

  try {
    await assert.rejects(
      () => saveData({ ...blank, stats: { ...blank.stats, hands: -1 } }),
      (error: unknown) => isSaveValidationError(error),
    );
    assert.equal(values.size, 0);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
});

test("legacy river-save data is migrated to the sharded format", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } satisfies Storage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

  try {
    const legacySave = {
      ...blank,
      savedAt: new Date().toISOString(),
      stats: { ...blank.stats, hands: 7 },
    };
    values.set("river-save", JSON.stringify({ revision: 4, save: legacySave }));

    const loaded = await loadSave();
    assert.equal(loaded.save.stats.hands, 7);
    assert.equal(JSON.parse(values.get("river-save:manifest")!).revision, 4);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
});

test("a damaged current shard falls back to a whole older snapshot", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } satisfies Storage;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

  try {
    await loadSave();
    const first = { ...blank, stats: { ...blank.stats, hands: 1 } };
    await saveData(first);
    await saveData({ ...first, stats: { ...first.stats, hands: 2 } });
    assert.ok(values.has("river-save:snapshots"));

    values.set("river-save:active", "{损坏的 JSON");
    const recovered = await loadSave();
    assert.equal(recovered.save.stats.hands, 1);
    assert.match(recovered.recoveryNotice ?? "", /回退到(?:旧版本|历史版本)/);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
});

test("sharded browser storage keeps other data when the active shard is damaged", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  } satisfies Storage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });

  try {
    await loadSave();
    const saved = await saveData({
      ...blank,
      savedAt: new Date().toISOString(),
      stats: { ...blank.stats, hands: 12 },
      settings: { ...blank.settings, difficulty: 4 },
      overrides: { "0": { ...hero, name: "自定义角色" } },
      game: newGame([hero, { ...hero, id: 0 }]),
    });
    assert.equal(saved.revision, 1);

    const manifestKey = "river-save:manifest";
    const manifest = JSON.parse(values.get(manifestKey)!);
    assert.deepEqual(Object.keys(manifest.checksums).sort(), [
      "active",
      "characters",
      "history",
      "profile",
    ]);
    for (const shard of Object.keys(manifest.checksums)) {
      assert.ok(values.has(`river-save:${shard}`));
    }

    values.set("river-save:active", "{损坏的 JSON");
    const recovered = (await loadSave()).save;
    assert.equal(recovered.game, null);
    assert.equal(recovered.stats.hands, 12);
    assert.equal(recovered.settings.difficulty, 4);
    assert.equal(recovered.overrides["0"].name, "自定义角色");
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
});
