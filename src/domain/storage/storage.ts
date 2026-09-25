import { z } from "zod";
import type { Game, Character } from "../game/engine";
import type { ChampionshipSimulationCheckpoint } from "../tournament/tournament";
import { appMetadata } from "../../app/appMetadata";

const SAVE_STORAGE_KEY = "river-save";
const SHARDED_STORAGE_PREFIX = "river-save";
const SNAPSHOT_STORAGE_KEY = `${SHARDED_STORAGE_PREFIX}:snapshots`;
const SAVE_LOCK_NAME = "river-save-write";
const SAVE_CHANNEL_NAME = "river-save-sync";
const GAME_LOG_LIMIT = 15;
const SNAPSHOT_LIMIT = 5;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

const SAVE_SHARDS = ["profile", "active", "history", "characters"] as const;
type SaveShardName = (typeof SAVE_SHARDS)[number];

type PersistedShard = {
  version: 1;
  revision: number;
  checksum: string;
  data: unknown;
};

type SaveManifest = {
  version: 1;
  app: {
    version: string;
    updatedAt: string;
  };
  revision: number;
  savedAt: string;
  checksums: Record<SaveShardName, string>;
};

type ShardedStoragePayload = {
  version: 1;
  manifest: unknown;
  shards: Partial<Record<SaveShardName, unknown>>;
  snapshots?: unknown;
};

export type StoredSave = {
  revision: number;
  save: Save;
  snapshots?: SaveSnapshot[];
  appVersion?: string;
};

type SaveChangeMessage = {
  type: "save-changed";
  revision: number;
};

type VsCodeStorageRequest = {
  type: "riverClub.storage";
  requestId: string;
  operation: "load" | "revision" | "save";
  expectedRevision?: number;
  save?: Save;
  snapshotArchive?: unknown;
  appVersion?: string;
  appUpdatedAt?: string;
};

type VsCodeStorageResponse =
  | {
      type: "riverClub.storageResponse";
      requestId: string;
      ok: true;
      value: unknown;
    }
  | {
      type: "riverClub.storageResponse";
      requestId: string;
      ok: false;
      error: string;
      code?: "conflict";
    };

type VsCodeSaveChangedMessage = {
  type: "riverClub.saveChanged";
  revision: number;
};

type VsCodeApi = {
  postMessage(message: VsCodeStorageRequest): void;
};

type PendingStorageRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let localRevision = 0;
let knownRevision = 0;
let saveChannel: BroadcastChannel | null = null;
let vscodeApi: VsCodeApi | null | undefined;
let vscodeRequestSequence = 0;
let vscodeBridgeReady = false;
const pendingStorageRequests = new Map<string, PendingStorageRequest>();
const saveListeners = new Set<(revision: number) => void>();

export class SaveConflictError extends Error {
  constructor() {
    super("本地存档已被另一个标签页更新");
    this.name = "SaveConflictError";
  }
}

export class SaveValidationError extends Error {
  constructor(public readonly issues: string[]) {
    const summary = issues.slice(0, 3).join("；");
    const suffix = issues.length > 3 ? `；另有 ${issues.length - 3} 项问题` : "";
    super(`存档校验失败，未保存：${summary}${suffix}`);
    this.name = "SaveValidationError";
  }
}

export function isSaveConflictError(error: unknown): error is SaveConflictError {
  return error instanceof SaveConflictError;
}

export function isSaveValidationError(error: unknown): error is SaveValidationError {
  return error instanceof SaveValidationError;
}

function emitSaveChanged(revision: number) {
  for (const listener of saveListeners) listener(revision);
}

function isVsCodeStorageResponse(value: unknown): value is VsCodeStorageResponse {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "riverClub.storageResponse" &&
    typeof message.requestId === "string" &&
    typeof message.ok === "boolean"
  );
}

function isVsCodeSaveChangedMessage(value: unknown): value is VsCodeSaveChangedMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    message.type === "riverClub.saveChanged" &&
    typeof message.revision === "number"
  );
}

function onVsCodeMessage(event: MessageEvent<unknown>) {
  if (isVsCodeStorageResponse(event.data)) {
    const pending = pendingStorageRequests.get(event.data.requestId);
    if (!pending) return;
    pendingStorageRequests.delete(event.data.requestId);
    if (event.data.ok) {
      pending.resolve(event.data.value);
    } else if (event.data.code === "conflict") {
      pending.reject(new SaveConflictError());
    } else {
      pending.reject(new Error(event.data.error));
    }
    return;
  }

  if (isVsCodeSaveChangedMessage(event.data)) {
    knownRevision = event.data.revision;
    emitSaveChanged(event.data.revision);
  }
}

function getVsCodeApi(): VsCodeApi | null {
  if (vscodeApi !== undefined) return vscodeApi;
  if (typeof window === "undefined" || !window.acquireVsCodeApi) {
    vscodeApi = null;
    return null;
  }

  vscodeApi = window.acquireVsCodeApi();
  if (!vscodeBridgeReady) {
    window.addEventListener("message", onVsCodeMessage);
    vscodeBridgeReady = true;
  }
  return vscodeApi;
}

function requestVsCodeStorage<T>(
  request: Omit<VsCodeStorageRequest, "type" | "requestId">,
): Promise<T> {
  const api = getVsCodeApi();
  if (!api) throw new Error("VS Code Webview 存储桥接不可用");

  const requestId = `storage-${Date.now()}-${vscodeRequestSequence++}`;
  return new Promise<T>((resolve, reject) => {
    pendingStorageRequests.set(requestId, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    try {
      api.postMessage({ type: "riverClub.storage", requestId, ...request });
    } catch (error) {
      pendingStorageRequests.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
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
    log: z.array(z.string().max(2000)).max(GAME_LOG_LIMIT),
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
export type MatchMode = "cash" | "championship";
export type MatchSession = {
  id: string;
  mode: MatchMode;
  entrants?: number;
  difficulty?: number;
};
export type SuspendedTournament = {
  game: Game;
  tournament: Tournament;
  match?: MatchSession;
};
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
const matchSessionSchema = z.object({
  id: z.string().min(1).max(100),
  mode: z.enum(["cash", "championship"]),
  entrants: z.number().int().min(2).max(256).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
});
const chipAnimationSchema = z.object({
  hand: money,
  settledTotals: z.record(money),
});
const settingsSchema = z.object({
  difficulty: z.number().int().min(1).max(5),
  speed: z.number().min(100).max(5000),
  mode: z.enum(["local", "key", "all"]),
  endpoint: z.string().max(1000),
  model: z.string().max(200),
  sound: z.boolean(),
  soundConfigured: z.boolean().default(false),
  pace: z.number().int().min(5).max(30),
});
const statsSchema = z.object({
  hands: money,
  wins: money,
  tournaments: money,
  titles: money,
});
const playerStatsSchema = z.object({
  matches: money,
  advances: money,
  handsWon: money,
  handsPlayed: money.default(0),
  cashMatchesWon: money.default(0),
  championshipsEntered: money.default(0),
  tournamentHandsWon: money.default(0),
  tournamentHandsPlayed: money.default(0),
  pointsTenths: money,
  highestChips: money,
  bestPlace: z.number().int().min(0).max(256),
});
const tournamentRecordSchema = z.object({
  id: z.string().max(100),
  playedAt: z.string().max(40),
  mode: z.enum(["played", "simulated"]),
  entrants: z.number().int().min(2).max(256),
  standings: z.array(z.object({
    place: z.number().int().min(1).max(256),
    player: characterSchema,
    points: z.number().int().min(0).max(24),
  })).max(10),
});

const profileShardSchema = z.object({
  playerProfile: playerProfileSchema,
  settings: settingsSchema,
});
const activeShardSchema = z.object({
  game: gameSchema.nullable(),
  tournament: tournamentSchema.nullable(),
  activeMatch: matchSessionSchema.optional(),
  pausedTournament: z.object({
    game: gameSchema,
    tournament: tournamentSchema,
    match: matchSessionSchema.optional(),
  }).optional(),
  chipAnimation: chipAnimationSchema.optional(),
});
const historyShardSchema = z.object({
  tournamentRecords: z.array(tournamentRecordSchema).max(1000).default([]),
  playerStats: z.record(playerStatsSchema).default({}),
  stats: statsSchema,
});
const charactersShardSchema = z.object({
  overrides: z.record(characterSchema),
  previous: z.record(characterSchema),
});
const schema = z.object({
  version: z.literal(1),
  savedAt: z.string(),
  playerProfile: profileShardSchema.shape.playerProfile,
  game: activeShardSchema.shape.game,
  tournament: activeShardSchema.shape.tournament,
  activeMatch: activeShardSchema.shape.activeMatch,
  pausedTournament: activeShardSchema.shape.pausedTournament,
  chipAnimation: activeShardSchema.shape.chipAnimation,
  tournamentRecords: historyShardSchema.shape.tournamentRecords,
  overrides: charactersShardSchema.shape.overrides,
  previous: charactersShardSchema.shape.previous,
  playerStats: historyShardSchema.shape.playerStats,
  settings: profileShardSchema.shape.settings,
  stats: historyShardSchema.shape.stats,
});
export type Save = {
  version: 1;
  savedAt: string;
  playerProfile: PlayerProfile;
  game: Game | null;
  tournament: Tournament | null;
  activeMatch?: MatchSession;
  pausedTournament?: SuspendedTournament;
  chipAnimation?: {
    hand: number;
    settledTotals: Record<string, number>;
  };
  tournamentRecords: ChampionshipRecord[];
  overrides: Record<string, Character>;
  previous: Record<string, Character>;
  playerStats: Record<string, PlayerCareerStats>;
  settings: Settings;
  stats: { hands: number; wins: number; tournaments: number; titles: number };
};
export type SaveSnapshot = {
  reason: "interval" | "app-update" | "legacy-migration";
  appVersion?: string;
  fromAppVersion?: string;
  toAppVersion?: string;
  revision: number;
  savedAt: string;
  checksum: string;
  save: Save;
};
export type SaveLoadResult = {
  save: Save;
  recoveryNotice?: string;
};

function formatValidationIssue(issue: z.ZodIssue): string {
  const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

export function validateSaveForStorage(value: unknown): Save {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new SaveValidationError(result.error.issues.map(formatValidationIssue));
  }
  return result.data;
}

export type PlayerCareerStats = {
  matches: number;
  advances: number;
  handsWon: number;
  handsPlayed: number;
  cashMatchesWon: number;
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
  playerStats: {},
  settings: defaults,
  stats: { hands: 0, wins: 0, tournaments: 0, titles: 0 },
};

type SaveShardData = {
  profile: {
    playerProfile: PlayerProfile;
    settings: Settings;
  };
  active: {
    game: Game | null;
    tournament: Tournament | null;
    activeMatch?: MatchSession;
    pausedTournament?: SuspendedTournament;
    chipAnimation?: {
      hand: number;
      settledTotals: Record<string, number>;
    };
  };
  history: {
    tournamentRecords: ChampionshipRecord[];
    playerStats: Record<string, PlayerCareerStats>;
    stats: Save["stats"];
  };
  characters: {
    overrides: Record<string, Character>;
    previous: Record<string, Character>;
  };
};

const saveShardSchemas = {
  profile: profileShardSchema,
  active: activeShardSchema,
  history: historyShardSchema,
  characters: charactersShardSchema,
} as const;

function splitSave(save: Save): SaveShardData {
  return {
    profile: {
      playerProfile: save.playerProfile,
      settings: save.settings,
    },
    active: {
      game: save.game,
      tournament: save.tournament,
      ...(save.activeMatch ? { activeMatch: save.activeMatch } : {}),
      ...(save.pausedTournament ? { pausedTournament: save.pausedTournament } : {}),
      ...(save.chipAnimation ? { chipAnimation: save.chipAnimation } : {}),
    },
    history: {
      tournamentRecords: save.tournamentRecords,
      playerStats: save.playerStats,
      stats: save.stats,
    },
    characters: {
      overrides: save.overrides,
      previous: save.previous,
    },
  };
}

function mergeSaveShards(
  manifest: Pick<SaveManifest, "savedAt">,
  shards: Partial<SaveShardData>,
): Save {
  return parseSave({
    ...blank,
    savedAt: manifest.savedAt,
    ...(shards.profile ?? {}),
    ...(shards.active ?? {}),
    ...(shards.history ?? {}),
    ...(shards.characters ?? {}),
  });
}

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
    const shortened = Array.isArray(game.log) && game.log.length > GAME_LOG_LIMIT
      ? { ...game, log: game.log.slice(0, GAME_LOG_LIMIT) }
      : candidate;
    const players = Array.isArray(game.players) ? game.players : [];
    const board = Array.isArray(game.board) ? game.board : [];
    const deck = Array.isArray(game.deck) ? game.deck : [];
    if (game.done !== true || game.street !== 3 || board.length !== 5 || !deck.length) return shortened;
    const holeCards = players.reduce((count, player) => {
      if (!player || typeof player !== "object") return count;
      const cards = (player as Record<string, unknown>).cards;
      return count + (Array.isArray(cards) ? cards.length : 0);
    }, 0);
    const expectedDeckSize = 52 - 3 - board.length - holeCards;
    if (expectedDeckSize < 0 || deck.length <= expectedDeckSize) return shortened;
    return { ...(shortened as Record<string, unknown>), deck: deck.slice(0, expectedDeckSize) };
  };
  const repairTournament = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return candidate;
    const tournament = candidate as Record<string, unknown>;
    const playoff = tournament.playoff;
    if (!playoff || typeof playoff !== "object" || Array.isArray(playoff)) return candidate;
    const playoffRecord = playoff as Record<string, unknown>;
    return { ...tournament, playoff: { ...playoffRecord, original: repairGame(playoffRecord.original) } };
  };
  const repaired: Record<string, unknown> = { ...save, game: repairGame(save.game) };
  repaired.tournament = repairTournament(save.tournament);
  if ("pausedTournament" in save) {
    repaired.pausedTournament =
      save.pausedTournament && typeof save.pausedTournament === "object"
        ? {
          ...(save.pausedTournament as Record<string, unknown>),
          game: repairGame((save.pausedTournament as Record<string, unknown>).game),
          tournament: repairTournament((save.pausedTournament as Record<string, unknown>).tournament),
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
      cashMatchesWon: 0,
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
  const raw = value as { settings?: { soundConfigured?: boolean } };
  if (raw.settings?.soundConfigured !== true) data.settings.sound = true;
  return data;
}
const storedSaveSchema = z.object({
  revision: z.number().int().nonnegative(),
  save: z.unknown(),
});
const persistedShardSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().nonnegative(),
  checksum: z.string().min(1),
  data: z.unknown(),
});
const appManifestSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.string().optional(),
}).default({ version: "legacy" });
const saveManifestSchema = z.object({
  version: z.literal(1),
  app: appManifestSchema,
  revision: z.number().int().nonnegative(),
  savedAt: z.string(),
  checksums: z.object({
    profile: z.string().min(1),
    active: z.string().min(1),
    history: z.string().min(1),
    characters: z.string().min(1),
  }),
});
const shardedStorageSchema = z.object({
  version: z.literal(1),
  manifest: z.unknown(),
  shards: z.record(z.unknown()),
  snapshots: z.unknown().optional(),
});
const snapshotArchiveSchema = z.object({
  version: z.literal(1),
  snapshots: z.array(z.object({
    reason: z.enum(["interval", "app-update", "legacy-migration"]).default("interval"),
    appVersion: z.string().optional(),
    fromAppVersion: z.string().optional(),
    toAppVersion: z.string().optional(),
    revision: z.number().int().nonnegative(),
    savedAt: z.string(),
    checksum: z.string().min(1),
    save: z.unknown(),
  })).max(SNAPSHOT_LIMIT),
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

function checksumValue(value: unknown): string {
  let hash = 2166136261;
  for (const character of stableSerialize(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseSnapshotArchive(value: unknown): SaveSnapshot[] {
  const result = snapshotArchiveSchema.safeParse(value);
  if (!result.success) return [];

  return result.data.snapshots
    .flatMap((snapshot) => {
      if (checksumValue(snapshot.save) !== snapshot.checksum) return [];
      try {
        return [{ ...snapshot, save: parseSave(snapshot.save) }];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.revision - left.revision);
}

function serializeSnapshotArchive(snapshots: SaveSnapshot[]) {
  return {
    version: 1 as const,
    snapshots: snapshots.slice(0, SNAPSHOT_LIMIT),
  };
}

function createSaveSnapshot(
  current: StoredSave,
  reason: SaveSnapshot["reason"],
  versionChange?: { from: string; to: string },
): SaveSnapshot {
  return {
    reason,
    appVersion: current.appVersion ?? "legacy",
    ...(versionChange
      ? {
        fromAppVersion: versionChange.from,
        toAppVersion: versionChange.to,
      }
      : {}),
    revision: current.revision,
    savedAt: current.save.savedAt,
    checksum: checksumValue(current.save),
    save: current.save,
  };
}

function appendSnapshotArchive(
  snapshots: SaveSnapshot[],
  snapshot: SaveSnapshot,
): SaveSnapshot[] {
  return [snapshot, ...snapshots.filter((candidate) => candidate.revision !== snapshot.revision)]
    .sort((left, right) => right.revision - left.revision)
    .slice(0, SNAPSHOT_LIMIT);
}

function updateSnapshotArchive(current: StoredSave): SaveSnapshot[] {
  const snapshots = current.snapshots ?? [];
  if (current.revision <= 0 || current.save.savedAt === "") return snapshots;

  const currentTime = Date.parse(current.save.savedAt) || 0;
  const latest = snapshots[0];
  const latestTime = latest ? Date.parse(latest.savedAt) || 0 : 0;
  if (latest && currentTime - latestTime < SNAPSHOT_INTERVAL_MS) return snapshots;

  return appendSnapshotArchive(
    snapshots,
    createSaveSnapshot(current, "interval"),
  );
}

function saveFingerprint(save: Save) {
  const { savedAt: _savedAt, ...content } = save;
  return stableSerialize(content);
}

function browserManifestKey() {
  return `${SHARDED_STORAGE_PREFIX}:manifest`;
}

function browserShardKey(shard: SaveShardName) {
  return `${SHARDED_STORAGE_PREFIX}:${shard}`;
}

function readBrowserSnapshotArchive(): SaveSnapshot[] {
  const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
  if (!raw) return [];
  try {
    return parseSnapshotArchive(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeBrowserSnapshotArchive(snapshots: SaveSnapshot[]) {
  if (!snapshots.length) return;
  localStorage.setItem(
    SNAPSHOT_STORAGE_KEY,
    JSON.stringify(serializeSnapshotArchive(snapshots)),
  );
}

function createShardedPayload(stored: StoredSave): ShardedStoragePayload {
  const data = splitSave(stored.save);
  const shards = {} as Record<SaveShardName, PersistedShard>;
  const checksums = {} as Record<SaveShardName, string>;

  for (const shardName of SAVE_SHARDS) {
    const shardData = data[shardName];
    const checksum = checksumValue(shardData);
    checksums[shardName] = checksum;
    shards[shardName] = {
      version: 1,
      revision: stored.revision,
      checksum,
      data: shardData,
    };
  }

  return {
    version: 1,
    manifest: {
      version: 1,
      app: {
        version: appMetadata.version,
        updatedAt: appMetadata.updatedAt,
      },
      revision: stored.revision,
      savedAt: stored.save.savedAt,
      checksums,
    } satisfies SaveManifest,
    shards,
  };
}

type ReadStoredSave = StoredSave & {
  source: "empty" | "legacy" | "sharded";
  recoveryNotice?: string;
};

function readCurrentShardedStoragePayload(payload: unknown): ReadStoredSave | null {
  const parsedPayload = shardedStorageSchema.safeParse(payload);
  if (!parsedPayload.success) return null;

  const snapshots = parseSnapshotArchive(parsedPayload.data.snapshots);
  const manifestResult = saveManifestSchema.safeParse(parsedPayload.data.manifest);
  if (!manifestResult.success) {
    const snapshot = snapshots[0];
    return snapshot
      ? {
        revision: snapshot.revision,
        save: snapshot.save,
        source: "sharded",
        snapshots,
        recoveryNotice: `当前存档索引损坏，已自动回退到旧版本（版本 ${snapshot.revision}）。`,
      }
      : null;
  }

  const manifest = manifestResult.data;
  const shards: Partial<Record<SaveShardName, unknown>> = {};
  let complete = true;
  for (const shardName of SAVE_SHARDS) {
    const shardResult = persistedShardSchema.safeParse(parsedPayload.data.shards[shardName]);
    if (!shardResult.success) {
      complete = false;
      continue;
    }
    if (
      shardResult.data.revision !== manifest.revision ||
      shardResult.data.checksum !== manifest.checksums[shardName] ||
      checksumValue(shardResult.data.data) !== shardResult.data.checksum
    ) {
      complete = false;
      continue;
    }

    const dataResult = saveShardSchemas[shardName].safeParse(shardResult.data.data);
    if (dataResult.success) {
      shards[shardName] = dataResult.data;
    } else {
      complete = false;
    }
  }

  const stored: ReadStoredSave = {
    revision: manifest.revision,
    save: mergeSaveShards(manifest, shards as Partial<SaveShardData>),
    source: "sharded",
    snapshots,
    appVersion: manifest.app.version,
  };
  if (complete) return stored;

  const snapshot = snapshots.find((candidate) => candidate.revision < manifest.revision);
  if (snapshot) {
    return {
      revision: snapshot.revision,
      save: snapshot.save,
      source: "sharded",
      snapshots,
      appVersion: manifest.app.version,
      recoveryNotice: `当前存档（版本 ${manifest.revision}）损坏，已自动回退到历史版本（版本 ${snapshot.revision}）。`,
    };
  }

  return {
    ...stored,
    recoveryNotice: `当前存档（版本 ${manifest.revision}）部分损坏，未找到完整旧版本，已保留未损坏的数据。`,
  };
}

function readShardedStoragePayload(payload: unknown): ReadStoredSave | null {
  return readCurrentShardedStoragePayload(payload);
}

function readBrowserShardedSave(): ReadStoredSave | null {
  const manifestRaw = localStorage.getItem(browserManifestKey());
  if (manifestRaw) {
    const shards: Partial<Record<SaveShardName, unknown>> = {};
    for (const shardName of SAVE_SHARDS) {
      const shardRaw = localStorage.getItem(browserShardKey(shardName));
      if (!shardRaw) continue;
      try {
        shards[shardName] = JSON.parse(shardRaw);
      } catch {
        // Leave only this shard unavailable; the other shards remain recoverable.
      }
    }
    try {
      const current = readShardedStoragePayload({
        version: 1,
        manifest: JSON.parse(manifestRaw),
        shards,
        snapshots: {
          version: 1,
          snapshots: readBrowserSnapshotArchive(),
        },
      });
      if (current) return current;
    } catch {
      // A malformed current manifest can still fall back to the legacy river-save value.
    }
  }
  return null;
}

function writeBrowserStoredSave(stored: StoredSave) {
  const next = createShardedPayload(stored);

  for (const shardName of SAVE_SHARDS) {
    localStorage.setItem(
      browserShardKey(shardName),
      JSON.stringify(next.shards[shardName]),
    );
  }
  localStorage.setItem(browserManifestKey(), JSON.stringify(next.manifest));
}

function readBrowserStoredSave(): ReadStoredSave {
  const sharded = readBrowserShardedSave();
  if (sharded) return sharded;

  const raw = localStorage.getItem(SAVE_STORAGE_KEY);
  if (!raw) return { revision: 0, save: blank, source: "empty", snapshots: readBrowserSnapshotArchive() };

  const parsed: unknown = JSON.parse(raw);
  const envelope = storedSaveSchema.safeParse(parsed);
  if (envelope.success) {
    return {
      revision: envelope.data.revision,
      save: parseSave(envelope.data.save),
      source: "legacy",
      snapshots: readBrowserSnapshotArchive(),
    };
  }

  // Accept a plain Save once so data written by an earlier localStorage build
  // can be upgraded without forcing the user to import a backup.
  return { revision: 0, save: parseSave(parsed), source: "legacy", snapshots: readBrowserSnapshotArchive() };
}

async function readVsCodeStoredSave(): Promise<ReadStoredSave> {
  const stored = await requestVsCodeStorage<unknown>({ operation: "load" });
  const sharded = readShardedStoragePayload(stored);
  if (sharded) return sharded;

  const envelope = storedSaveSchema.safeParse(stored);
  if (!envelope.success || envelope.data.save === null) {
    return {
      revision: envelope.success ? envelope.data.revision : 0,
      save: blank,
      source: "empty",
    };
  }
  return {
    revision: envelope.data.revision,
    save: parseSave(envelope.data.save),
    source: "legacy",
  };
}

function isStoredSaveNewer(candidate: StoredSave, current: StoredSave) {
  if (candidate.revision <= 0 || candidate.save.savedAt === "") return false;
  if (current.revision <= 0 || current.save.savedAt === "") return true;

  const candidateTime = Date.parse(candidate.save.savedAt) || 0;
  const currentTime = Date.parse(current.save.savedAt) || 0;
  return candidateTime > currentTime || (candidateTime === currentTime && candidate.revision > current.revision);
}

function getSaveChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!saveChannel) saveChannel = new BroadcastChannel(SAVE_CHANNEL_NAME);
  return saveChannel;
}

function notifySaveChanged(revision: number) {
  knownRevision = revision;
  emitSaveChanged(revision);
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

async function writeVsCodeSave(stored: StoredSave) {
  const result = await requestVsCodeStorage<{ revision: number }>({
    operation: "save",
    expectedRevision: stored.revision,
    save: stored.save,
    snapshotArchive: serializeSnapshotArchive(stored.snapshots ?? []),
    appVersion: appMetadata.version,
    appUpdatedAt: appMetadata.updatedAt,
  });
  if (!Number.isInteger(result.revision) || result.revision !== stored.revision) {
    throw new Error("VS Code 返回了无效的存档版本");
  }
  return result.revision;
}

let vscodeBackupTimer: number | null = null;
let pendingVscodeBackup: StoredSave | null = null;

function scheduleVscodeBackup(stored: StoredSave) {
  if (!getVsCodeApi()) return;
  pendingVscodeBackup = stored;
  if (vscodeBackupTimer !== null) window.clearTimeout(vscodeBackupTimer);
  vscodeBackupTimer = window.setTimeout(() => {
    const next = pendingVscodeBackup;
    pendingVscodeBackup = null;
    vscodeBackupTimer = null;
    if (!next) return;
    void writeVsCodeSave(next).catch((error) => {
      console.error("[摸鱼德州] 自动备份存档失败", error);
    });
  }, 750);
}

function hasLegacySaveData(stored: ReadStoredSave) {
  return stored.source === "legacy" && (
    stored.revision > 0 ||
    stored.save.savedAt !== "" ||
    summarizeSaveRecords(stored.save).hasExistingData
  );
}

export const loadSave = async (): Promise<SaveLoadResult> => {
  const browserSave = readBrowserStoredSave();
  let stored = browserSave;
  let needsBrowserSync = false;
  if (getVsCodeApi()) {
    try {
      const vscodeSave = await readVsCodeStoredSave();
      if (isStoredSaveNewer(vscodeSave, browserSave)) {
        stored = vscodeSave;
        needsBrowserSync = true;
      }
    } catch {
      // The localStorage save remains the primary recovery path when the
      // optional VS Code JSON backup is unavailable.
    }
  }

  const appVersionChanged = stored.source === "sharded" &&
    stored.appVersion !== undefined &&
    stored.appVersion !== appMetadata.version;
  const shouldArchiveBeforeMigration = !stored.recoveryNotice && (
    appVersionChanged || hasLegacySaveData(stored)
  );
  if (shouldArchiveBeforeMigration) {
    const reason: SaveSnapshot["reason"] = hasLegacySaveData(stored)
      ? "legacy-migration"
      : "app-update";
    const fromVersion = stored.appVersion ?? "legacy";
    const snapshots = appendSnapshotArchive(
      stored.snapshots ?? [],
      createSaveSnapshot(stored, reason, {
        from: fromVersion,
        to: appMetadata.version,
      }),
    );
    writeBrowserSnapshotArchive(snapshots);
    stored = { ...stored, snapshots };
    needsBrowserSync = true;
  }

  if (!stored.recoveryNotice && (stored.source === "legacy" || needsBrowserSync)) {
    writeBrowserStoredSave(stored);
    stored = {
      ...stored,
      source: "sharded",
      appVersion: appMetadata.version,
    };
  }

  if (stored.recoveryNotice) {
    writeBrowserSnapshotArchive(stored.snapshots ?? []);
    const repairedSave = validateSaveForStorage({
      ...stored.save,
      savedAt: new Date().toISOString(),
    });
    const repairedStored: ReadStoredSave = {
      ...stored,
      revision: stored.revision + 1,
      save: repairedSave,
      source: "sharded",
      appVersion: appMetadata.version,
    };
    writeBrowserStoredSave(repairedStored);
    stored = repairedStored;
  }
  localRevision = stored.revision;
  knownRevision = stored.revision;
  scheduleVscodeBackup(stored);
  return { save: stored.save, recoveryNotice: stored.recoveryNotice };
};

export const saveData = async (data: Save) => {
  const validated = validateSaveForStorage(data);
  const stored = await withSaveLock(() => {
    const current = readBrowserStoredSave();
    if (current.revision !== localRevision) {
      throw new SaveConflictError();
    }

    if (saveFingerprint(current.save) === saveFingerprint(validated)) {
      return current;
    }

    const revision = current.revision + 1;
    const save = { ...validated, savedAt: new Date().toISOString() };
    const snapshots = updateSnapshotArchive(current);
    writeBrowserSnapshotArchive(snapshots);
    writeBrowserStoredSave({ revision, save, snapshots });
    localRevision = revision;
    notifySaveChanged(revision);
    return { revision, save, snapshots };
  });
  scheduleVscodeBackup(stored);
  return stored;
};

export function subscribeToSaveChanges(listener: (revision: number) => void) {
  if (typeof window === "undefined") return () => undefined;

  const api = getVsCodeApi();
  if (api) {
    saveListeners.add(listener);
    return () => {
      saveListeners.delete(listener);
    };
  }

  const channel = getSaveChannel();
  const onMessage = (event: MessageEvent<SaveChangeMessage>) => {
    if (event.data?.type === "save-changed") {
      knownRevision = event.data.revision;
      listener(event.data.revision);
    }
  };
  const onStorage = (event: StorageEvent) => {
    const isManifestChange =
      event.key === browserManifestKey();
    if (!event.newValue || (event.key !== SAVE_STORAGE_KEY && !isManifestChange)) return;
    try {
      if (isManifestChange) {
        const value = JSON.parse(event.newValue);
        const manifest = saveManifestSchema.safeParse(value);
        if (manifest.success) listener(manifest.data.revision);
        return;
      }

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
  return Promise.resolve(readBrowserStoredSave().revision);
}

export function downloadSave(data: Save) {
  const blob = new Blob(
    [JSON.stringify({ ...data, savedAt: new Date().toISOString() }, null, 2)],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `摸鱼德州-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
