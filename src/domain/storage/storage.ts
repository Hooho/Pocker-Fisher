import { z } from "zod";
import type { Game, Character } from "../game/engine";
import type { ChampionshipSimulationCheckpoint } from "../tournament/tournament";

const SAVE_STORAGE_KEY = "river-save";
const SAVE_LOCK_NAME = "river-save-write";
const SAVE_CHANNEL_NAME = "river-save-sync";

type StoredSave = {
  revision: number;
  save: Save;
};

type SaveChangeMessage = {
  type: "save-changed";
  revision: number;
};

let localRevision = 0;
let saveChannel: BroadcastChannel | null = null;

export class SaveConflictError extends Error {
  constructor() {
    super("本地存档已被另一个标签页更新");
    this.name = "SaveConflictError";
  }
}

export function isSaveConflictError(error: unknown): error is SaveConflictError {
  return error instanceof SaveConflictError;
}
const money = z.number().int().min(0).max(1e9);
const card = z.number().int().min(0).max(51);
const playerProfileSchema = z.object({
  name: z.string().min(1).max(24).default("本地玩家"),
  avatar: z.string().max(500_000).nullable().default(null),
}).default({ name: "本地玩家", avatar: null });
export type PlayerProfile = z.infer<typeof playerProfileSchema>;
export const characterSchema = z.object({
  id: z.number().int().min(-1).max(100000),
  name: z.string().min(1).max(40),
  style: z.string().max(40),
  level: z.number().int().min(1).max(5),
  aggression: z.number().min(0).max(1),
  bluff: z.number().min(0).max(0.6),
  bio: z.string().max(1000),
});
const gameSchema = z
  .object({
    players: z
      .array(
        z.object({
          profile: characterSchema,
          chips: money,
          cards: z.array(card).max(2),
          bet: money,
          total: money,
          folded: z.boolean(),
          acted: z.boolean(),
          last: z.string().max(100),
          start: money,
          raiseAt: z.number().min(-1),
        }),
      )
      .min(2)
      .max(8),
    deck: z.array(card).max(52),
    board: z.array(card).max(5),
    dealer: z.number().int().min(0).max(7),
    turn: z.number().int().min(0).max(7),
    street: z.number().int().min(0).max(3),
    current: money,
    minRaise: money,
    bb: money.positive(),
    hand: money,
    done: z.boolean(),
    log: z.array(z.string().max(2000)).max(60),
    result: z.string().max(2000),
    winners: z.array(z.number().int().min(0).max(7)).max(8),
  })
  .superRefine((g, ctx) => {
    if (g.turn >= g.players.length || g.dealer >= g.players.length)
      ctx.addIssue({ code: "custom", message: "座位无效" });
    const cards = [...g.deck, ...g.board, ...g.players.flatMap((p) => p.cards)];
    const expectedBoard = [0, 3, 4, 5][g.street];
    if (
      g.board.length !== expectedBoard ||
      cards.length !== 52 - g.street ||
      g.players.some((p) => p.bet > p.total || p.total > p.start)
    )
      ctx.addIssue({ code: "custom", message: "牌局状态不完整" });
    const before = g.players.reduce((sum, p) => sum + p.start, 0);
    const after = g.players.reduce(
      (sum, p) => sum + p.chips + (g.done ? 0 : p.total),
      0,
    );
    if (before !== after)
      ctx.addIssue({ code: "custom", message: "筹码总量不一致" });
    if (new Set(cards).size !== cards.length)
      ctx.addIssue({ code: "custom", message: "重复牌张" });
    if (
      g.players.some((p) => p.bet > p.total) ||
      g.current < Math.max(...g.players.map((p) => p.bet))
    )
      ctx.addIssue({ code: "custom", message: "下注数据无效" });
  });
export type Tournament = {
  playoff?: { original: Game; locked: Character[]; slots: number };
  round: number;
  field: Character[];
  stacks?: Record<string, number>;
  resetStacksEachRound?: boolean;
  entrants?: number;
  finalists?: Character[];
  finalStandings?: Character[];
  qualificationOut?: Character[];
  topTwoOuts?: Character[];
  finalEliminated?: Character[];
  seed: number;
  pace: number;
  out: boolean;
  paused?: boolean;
  autoSimulating?: boolean;
  simulationComplete?: boolean;
  simulationCheckpoint?: ChampionshipSimulationCheckpoint;
  background?: {
    remaining: Character[];
    qualified: Character[];
    done: boolean;
  };
  pendingLocal?: Character[];
  complete: boolean;
  results: string[];
};
export type SuspendedTournament = { game: Game; tournament: Tournament };
export type ChampionshipStanding = {
  place: number;
  player: Character;
  points: number;
};
export type ChampionshipRecord = {
  id: string;
  playedAt: string;
  mode: "played" | "simulated";
  entrants: number;
  standings: ChampionshipStanding[];
};
export type Settings = {
  difficulty: number;
  speed: number;
  mode: "local" | "key" | "all";
  debugFast: boolean;
  endpoint: string;
  model: string;
  sound: boolean;
  soundConfigured: boolean;
  pace: number;
};
export const defaults: Settings = {
  difficulty: 2,
  speed: 1000,
  mode: "local",
  debugFast: false,
  endpoint: "",
  model: "",
  sound: true,
  soundConfigured: false,
  pace: 10,
};
const tournamentSchema = z.object({
      round: z.number().int().min(0).max(8),
      entrants: z.number().int().min(2).max(256).optional(),
      finalists: z.array(characterSchema).max(8).optional(),
      finalStandings: z.array(characterSchema).max(8).optional(),
      qualificationOut: z.array(characterSchema).max(8).optional(),
      topTwoOuts: z.array(characterSchema).max(2).optional(),
      finalEliminated: z.array(characterSchema).max(8).optional(),
      playoff: z
        .object({
          original: gameSchema,
          locked: z.array(characterSchema).max(8),
          slots: z.number().int().min(1).max(7),
        })
        .optional(),
      field: z.array(characterSchema).max(256),
      stacks: z.record(money).optional(),
      resetStacksEachRound: z.boolean().optional(),
      seed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      pace: z.number().int().min(5).max(30).default(10),
      out: z.boolean(),
      paused: z.boolean().optional(),
      autoSimulating: z.boolean().optional(),
      simulationComplete: z.boolean().optional(),
      simulationCheckpoint: z
        .object({
          round: z.number().int().min(0).max(8),
          field: z.array(characterSchema).max(256),
          advancing: z.array(characterSchema).max(256),
          nextTableIndex: z.number().int().min(0).max(32),
          performance: z.record(z.object({
            handsWon: money,
            highestChips: money,
            advances: money,
            bestPlace: z.number().int().min(0).max(256),
          })).optional(),
        })
        .optional(),
      background: z.object({
        remaining: z.array(characterSchema).max(256),
        qualified: z.array(characterSchema).max(256),
        done: z.boolean(),
      }).optional(),
      pendingLocal: z.array(characterSchema).max(8).optional(),
      complete: z.boolean(),
      results: z.array(z.string().max(500)).max(20),
    });
const schema = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  playerProfile: playerProfileSchema,
  game: gameSchema.nullable(),
  tournament: tournamentSchema.nullable(),
  pausedTournament: z.object({ game: gameSchema, tournament: tournamentSchema }).optional(),
  tournamentRecords: z.array(z.object({
    id: z.string().max(100),
    playedAt: z.string().max(40),
    mode: z.enum(["played", "simulated"]),
    entrants: z.number().int().min(2).max(256),
    standings: z.array(z.object({
      place: z.number().int().min(1).max(256),
      player: characterSchema,
      points: z.number().int().min(0).max(20),
    })).max(10),
  })).max(1000).default([]),
  overrides: z.record(characterSchema),
  previous: z.record(characterSchema),
  memories: z.record(z.array(z.string().max(2000)).max(60)).default({}),
  playerStats: z.record(z.object({
    matches: money,
    advances: money,
    handsWon: money,
    handsPlayed: money.default(0),
    championshipsEntered: money.default(0),
    tournamentHandsWon: money.default(0),
    tournamentHandsPlayed: money.default(0),
    pointsTenths: money,
    highestChips: money,
    bestPlace: z.number().int().min(0).max(256),
  })).default({}),
  settings: z.object({
    difficulty: z.number().int().min(1).max(5),
    speed: z.number().min(100).max(5000),
    mode: z.enum(["local", "key", "all"]),
    debugFast: z.boolean().default(false),
    endpoint: z.string().max(1000),
    model: z.string().max(200),
    sound: z.boolean(),
    soundConfigured:z.boolean().default(false),
    pace: z.number().int().min(5).max(30),
  }),
  stats: z.object({
    hands: money,
    wins: money,
    tournaments: money,
    titles: money,
  }),
});
export type Save = {
  version: 1;
  savedAt: string;
  playerProfile: PlayerProfile;
  game: Game | null;
  tournament: Tournament | null;
  pausedTournament?: SuspendedTournament;
  tournamentRecords: ChampionshipRecord[];
  overrides: Record<string, Character>;
  previous: Record<string, Character>;
  memories: Record<string, string[]>;
  playerStats: Record<string, PlayerCareerStats>;
  settings: Settings;
  stats: { hands: number; wins: number; tournaments: number; titles: number };
};
export type PlayerCareerStats = {
  matches: number;
  advances: number;
  handsWon: number;
  handsPlayed: number;
  // Entries/hands scoped to real championship play only (not cash-table sessions),
  // so a player's championship win rate isn't diluted by unrelated cash grinding.
  championshipsEntered: number;
  tournamentHandsWon: number;
  tournamentHandsPlayed: number;
  pointsTenths: number;
  highestChips: number;
  bestPlace: number;
};
export const blank: Save = {
  version: 1,
  savedAt: "",
  playerProfile: { name: "本地玩家", avatar: null },
  game: null,
  tournament: null,
  tournamentRecords: [],
  overrides: {},
  previous: {},
  memories: {},
  playerStats: {},
  settings: defaults,
  stats: { hands: 0, wins: 0, tournaments: 0, titles: 0 },
};
export type SaveRecordSummary = {
  hasExistingData: boolean;
  hasActiveGame: boolean;
  hands: number;
  championships: number;
  playerRecords: number;
  hasPersonalization: boolean;
};
export function summarizeSaveRecords(save: Save): SaveRecordSummary {
  const hasPersonalization =
    save.playerProfile.name !== blank.playerProfile.name ||
    save.playerProfile.avatar !== null ||
    Object.keys(save.overrides).length > 0 ||
    Object.keys(save.previous).length > 0 ||
    Object.keys(save.memories).length > 0 ||
    Object.entries(defaults).some(
      ([key, value]) => save.settings[key as keyof Settings] !== value,
    );
  const hasActiveGame = Boolean(
    save.game || save.tournament || save.pausedTournament,
  );
  const playerRecords = Object.keys(save.playerStats).length;
  const championships = Math.max(
    save.stats.tournaments,
    save.tournamentRecords.length,
  );
  const hasExistingData = Boolean(
    hasActiveGame ||
      save.tournamentRecords.length ||
      playerRecords ||
      save.stats.hands ||
      save.stats.wins ||
      save.stats.tournaments ||
      save.stats.titles ||
      hasPersonalization
  );
  return {
    hasExistingData,
    hasActiveGame,
    hands: save.stats.hands,
    championships,
    playerRecords,
    hasPersonalization,
  };
}

function repairLegacyDebugGame(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const save = value as Record<string, unknown>;
  const repairGame = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
    const game = candidate as Record<string, unknown>;
    const players = Array.isArray(game.players) ? game.players : [];
    const board = Array.isArray(game.board) ? game.board : [];
    const deck = Array.isArray(game.deck) ? game.deck : [];
    if (game.done !== true || game.street !== 3 || board.length !== 5 || !deck.length) return candidate;
    const holeCards = players.reduce((count, player) => {
      if (!player || typeof player !== "object") return count;
      const cards = (player as Record<string, unknown>).cards;
      return count + (Array.isArray(cards) ? cards.length : 0);
    }, 0);
    const expectedDeckSize = 52 - 3 - board.length - holeCards;
    if (expectedDeckSize < 0 || deck.length <= expectedDeckSize) return candidate;
    return { ...game, deck: deck.slice(0, expectedDeckSize) };
  };
  const repaired: Record<string, unknown> = { ...save, game: repairGame(save.game) };
  if ("pausedTournament" in save) {
    repaired.pausedTournament =
      save.pausedTournament && typeof save.pausedTournament === "object"
        ? {
          ...(save.pausedTournament as Record<string, unknown>),
          game: repairGame((save.pausedTournament as Record<string, unknown>).game),
        }
        : save.pausedTournament;
  }
  return repaired;
}
export function parseSave(value: unknown): Save {
  const normalized = repairLegacyDebugGame(value);
  const parsed = schema.safeParse(normalized);
  let data: Save;
  if (parsed.success) {
    data = parsed.data;
  } else if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    const unsafeActiveState = parsed.error.issues.some(
      (issue) =>
        issue.message === "重复牌张" ||
        issue.path.some((part) => ["chips", "bet", "total", "start"].includes(String(part))),
    );
    if (unsafeActiveState) throw parsed.error;
    const recoverable: Record<string, unknown> = {
      ...(normalized as Record<string, unknown>),
      game: null,
      tournament: null,
    };
    delete recoverable.pausedTournament;
    const fallback = schema.safeParse(recoverable);
    if (!fallback.success) throw parsed.error;
    data = fallback.data;
  } else {
    throw parsed.error;
  }
  if (!data.playerStats["-1"] && data.stats.wins > 0) {
    data.playerStats["-1"] = {
      matches: 0,
      advances: 0,
      handsWon: data.stats.wins,
      // Historical saves only tracked total hands on `stats.hands`, not per-player —
      // backfill with that as a reasonable one-time approximation for the hero.
      handsPlayed: Math.max(data.stats.hands, data.stats.wins),
      championshipsEntered: 0,
      // No historical record distinguishes championship hands from cash hands, so
      // approximate with the same totals — the general backfill below covers this
      // same case for every player, this just seeds it before that loop runs.
      tournamentHandsWon: data.stats.wins,
      tournamentHandsPlayed: Math.max(data.stats.hands, data.stats.wins),
      pointsTenths: data.stats.wins,
      highestChips: 0,
      bestPlace: 0,
    };
  }
  // Every championship the hero ever finished (played through or auto-simulated)
  // produced exactly one tournamentRecord, so on a save from before this field
  // existed, that count is a solid floor for how many they've actually entered —
  // without it every legacy save would show "0 entered" despite real history.
  if (data.playerStats["-1"] && data.playerStats["-1"].championshipsEntered === 0) {
    data.playerStats["-1"].championshipsEntered = Math.max(
      data.playerStats["-1"].championshipsEntered,
      data.tournamentRecords.length,
    );
  }
  // One-time backfill for saves from before championship-scoped hand tracking
  // existed: every player's overall hand totals already reflected real history
  // (cash hands mixed in with tournament hands, uncounted separately), so use
  // that as the starting point rather than a bare 0 that looks like a bug on a
  // veteran's profile. The two counters only diverge from here on, since only
  // real championship hands get added to the tournament-scoped ones going forward.
  for (const stats of Object.values(data.playerStats)) {
    if (stats.tournamentHandsPlayed === 0 && stats.handsPlayed > 0) {
      stats.tournamentHandsWon = stats.handsWon;
      stats.tournamentHandsPlayed = stats.handsPlayed;
    }
  }
  const raw=value as {settings?:{soundConfigured?:boolean}};
  if(raw.settings?.soundConfigured!==true)data.settings.sound=true;
  return data;
}
const storedSaveSchema = z.object({
  revision: z.number().int().nonnegative(),
  save: z.unknown(),
});

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(",")}}`;
}

function saveFingerprint(save: Save) {
  const { savedAt: _savedAt, ...content } = save;
  return stableSerialize(content);
}

function readStoredSave(): StoredSave {
  const raw = localStorage.getItem(SAVE_STORAGE_KEY);
  if (!raw) return { revision: 0, save: blank };

  const parsed: unknown = JSON.parse(raw);
  const envelope = storedSaveSchema.safeParse(parsed);
  if (envelope.success) {
    return {
      revision: envelope.data.revision,
      save: parseSave(envelope.data.save),
    };
  }

  // Accept a plain Save once so data written by an earlier localStorage build
  // can be upgraded without forcing the user to import a backup.
  return { revision: 0, save: parseSave(parsed) };
}

function getSaveChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!saveChannel) saveChannel = new BroadcastChannel(SAVE_CHANNEL_NAME);
  return saveChannel;
}

function notifySaveChanged(revision: number) {
  getSaveChannel()?.postMessage({
    type: "save-changed",
    revision,
  } satisfies SaveChangeMessage);
}

async function withSaveLock<T>(task: () => T | Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(SAVE_LOCK_NAME, task);
  }
  return task();
}

export function getSaveRevision() {
  return localRevision;
}

export const loadSave = async () => {
  const stored = readStoredSave();
  localRevision = stored.revision;
  return stored.save;
};

export const saveData = async (data: Save) => {
  return withSaveLock(() => {
    const current = readStoredSave();
    if (current.revision !== localRevision) {
      throw new SaveConflictError();
    }

    if (saveFingerprint(current.save) === saveFingerprint(data)) {
      return current.revision;
    }

    const revision = current.revision + 1;
    const save = { ...data, savedAt: new Date().toISOString() };
    localStorage.setItem(
      SAVE_STORAGE_KEY,
      JSON.stringify({ revision, save }),
    );
    localRevision = revision;
    notifySaveChanged(revision);
    return revision;
  });
};

export function subscribeToSaveChanges(listener: (revision: number) => void) {
  if (typeof window === "undefined") return () => undefined;

  const channel = getSaveChannel();
  const onMessage = (event: MessageEvent<SaveChangeMessage>) => {
    if (event.data?.type === "save-changed") {
      listener(event.data.revision);
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SAVE_STORAGE_KEY || !event.newValue) return;
    try {
      const envelope = storedSaveSchema.safeParse(JSON.parse(event.newValue));
      if (envelope.success) listener(envelope.data.revision);
    } catch {
      // The next focus check will surface a malformed or unavailable save.
    }
  };

  channel?.addEventListener("message", onMessage);
  window.addEventListener("storage", onStorage);

  return () => {
    channel?.removeEventListener("message", onMessage);
    window.removeEventListener("storage", onStorage);
  };
}

export function checkSaveRevision() {
  return readStoredSave().revision;
}

export function downloadSave(data: Save) {
  const blob = new Blob(
    [JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `river-club-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
