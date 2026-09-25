import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blank,
  loadSave,
  parseSave,
  saveData,
  checkSaveState,
  areSaveContentsEqual,
  isSaveConflictError,
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

test("rapid save requests coalesce to the latest state", async () => {
  const previousStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  let writes = 0;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes += 1;
      values.set(key, value);
    },
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
    const latest = { ...blank, stats: { ...blank.stats, hands: 2 } };
    const [firstResult, latestResult] = await Promise.all([
      saveData(first),
      saveData(latest),
    ]);

    assert.equal(firstResult.revision, 1);
    assert.equal(latestResult.revision, 1);
    assert.equal(writes, 5);
    assert.equal(JSON.parse(values.get("river-save:history")!).data.stats.hands, 2);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
});

test("save freshness checks can distinguish a new revision with unchanged content", async () => {
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
    const saved = { ...blank, stats: { ...blank.stats, hands: 1 } };
    await saveData(saved);
    const stored = await checkSaveState();

    assert.equal(stored.revision, 1);
    assert.equal(areSaveContentsEqual(stored.save, { ...stored.save, savedAt: "later" }), true);
    assert.equal(areSaveContentsEqual(stored.save, { ...saved, stats: { ...saved.stats, hands: 2 } }), false);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
});

test("championship saves with optional undefined fields survive a reload", async () => {
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
    const game = newGame([hero, { ...hero, id: 0 }]);
    const tournament = {
      round: 0,
      field: [hero, { ...hero, id: 0 }],
      seed: 1,
      pace: 10,
      out: false,
      paused: false,
      autoSimulating: false,
      simulationComplete: false,
      complete: false,
      results: [],
      background: { remaining: [], qualified: [], done: true },
      pendingLocal: undefined,
      playoff: undefined,
      simulationCheckpoint: undefined,
    };
    await saveData({ ...blank, game, tournament, chipAnimation: undefined });

    const loaded = await loadSave();
    assert.equal(loaded.recoveryNotice, undefined);
    assert.equal(loaded.save.tournament?.round, 0);
    assert.equal(loaded.save.game?.players.length, 2);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
});

test("readable shard checksum mismatches preserve current data during repair", async () => {
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
    const game = newGame([hero, { ...hero, id: 0 }]);
    await saveData({ ...blank, game });
    const active = JSON.parse(values.get("river-save:active")!);
    const manifest = JSON.parse(values.get("river-save:manifest")!);
    active.checksum = "legacy-checksum";
    manifest.checksums.active = "legacy-checksum";
    values.set("river-save:active", JSON.stringify(active));
    values.set("river-save:manifest", JSON.stringify(manifest));

    const loaded = await loadSave();
    assert.equal(loaded.save.game?.players.length, 2);
    assert.match(loaded.recoveryNotice ?? "", /保留可读取数据/);

    const repairedActive = JSON.parse(values.get("river-save:active")!);
    const repairedManifest = JSON.parse(values.get("river-save:manifest")!);
    assert.equal(repairedActive.checksum, repairedManifest.checksums.active);
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
});

test("save conflicts expose both revisions for a second validation", async () => {
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
    const saved = { ...blank, stats: { ...blank.stats, hands: 1 } };
    await saveData(saved);
    for (const key of ["river-save:profile", "river-save:active", "river-save:history", "river-save:characters", "river-save:manifest"]) {
      const value = JSON.parse(values.get(key)!);
      value.revision = 2;
      values.set(key, JSON.stringify(value));
    }

    await assert.rejects(
      () => saveData({ ...saved, stats: { ...saved.stats, hands: 2 } }),
      (error: unknown) => {
        if (!isSaveConflictError(error)) return false;
        assert.equal(error.expectedRevision, 1);
        assert.equal(error.actualRevision, 2);
        assert.equal(areSaveContentsEqual(error.currentSave!, saved), true);
        return true;
      },
    );
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
    const manifest = JSON.parse(values.get("river-save:manifest")!);
    assert.equal(manifest.revision, 4);
    assert.equal(manifest.app.version, "dev");
    const snapshots = JSON.parse(values.get("river-save:snapshots")!);
    assert.equal(snapshots.snapshots[0].reason, "legacy-migration");
  } finally {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: previousStorage,
    });
  }
});

test("an application update archives the previous complete save first", async () => {
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
    await saveData({
      ...blank,
      stats: { ...blank.stats, hands: 3 },
    });
    const manifest = JSON.parse(values.get("river-save:manifest")!);
    values.set(
      "river-save:manifest",
      JSON.stringify({ ...manifest, app: { ...manifest.app, version: "0.9.0" } }),
    );

    const loaded = await loadSave();
    assert.equal(loaded.save.stats.hands, 3);
    const snapshots = JSON.parse(values.get("river-save:snapshots")!);
    assert.equal(snapshots.snapshots[0].reason, "app-update");
    assert.equal(snapshots.snapshots[0].fromAppVersion, "0.9.0");
    assert.equal(snapshots.snapshots[0].toAppVersion, "dev");
    assert.equal(JSON.parse(values.get("river-save:manifest")!).app.version, "dev");
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
