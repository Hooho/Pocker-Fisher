import {
  championshipStandings,
  championshipCareerBonuses,
  difficultyPointRules,
  eliminatedProfiles,
  qualification,
  singleMatchPointRules,
  singleMatchPointsTenths,
  type ChampionshipSimulationProgress,
  type SimulationPlayerStatsMap,
  type SimulatedTablePerformance,
} from "../domain/tournament/tournament";
import { isVscodeWebview, pathForPage, useAppRouter } from "./router";
import { publicAsset } from "./assets";
import { appMetadata, formatAppUpdatedAt } from "./appMetadata";
import { LobbyPage } from "../pages/LobbyPage";
import { PlayersPage } from "../pages/PlayersPage";
import { SettingsPage, type SettingsSection } from "../pages/SettingsPage";
import { TablePage } from "../pages/TablePage";
import Table3D from "../components/Table3D";
import {
  getTableUiScale,
  getTableSeatPositions,
  type TableSeatSize,
  type TableStageSize,
} from "../components/tableLayout";
import { TournamentPage } from "../pages/TournamentPage";
import { CashResultsPage, type CashMatchResult } from "../pages/CashResultsPage";
import { LeaderboardPage } from "../pages/LeaderboardPage";
import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback, memo, type CSSProperties } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Settings2,
  Users,
  Trophy,
  Spade,
  Download,
  Upload,
  Play,
  Pause,
  Volume2,
  VolumeX,
  X,
  ArrowLeft,
  Sparkles,
  RotateCcw,
  Check,
  Flag,
  BookOpen,
  Medal,
  UserRound,
  LocateFixed,
  Crown,
  Clock,
  MoreHorizontal,
  ArrowUp,
  Info,
  Home,
} from "lucide-react";
import {
  act,
  newGame,
  startHand,
  hero,
  legal,
  observe,
  shuffled,
  rank,
  suit,
  pot,
  evaluate,
  currentHandName,
  previewBoard,
  type Character,
  type Game,
  type Move,
} from "../domain/game/engine";
import {
  blank,
  loadSave,
  saveData,
  checkSaveState,
  adoptSaveRevision,
  areSaveContentsEqual,
  parseSave,
  downloadSave,
  getSaveRevision,
  isSaveConflictError,
  isSaveValidationError,
  summarizeSaveRecords,
  subscribeToSaveChanges,
  type Save,
  type Tournament,
  type MatchMode,
  type MatchSession,
  type ChampionshipRecord,
  type PlayerCareerStats,
} from "../domain/storage/storage";
import { aiMove, reshape, requestAI } from "../domain/game/ai";
import { playGameSound } from "../domain/game/sound";
import BotWorker from "../workers/bot.worker.ts?worker&inline";
import TournamentWorker from "../workers/tournament.worker.ts?worker&inline";
import ChampionshipWorker from "../workers/championship.worker.ts?worker&inline";

type CommunityCardDebugFunction = () => void;

declare global {
  interface Window {
    showAllCommunityCards?: CommunityCardDebugFunction;
    hideAllCommunityCards?: CommunityCardDebugFunction;
  }
}

const levels = ["入门", "普通", "进阶", "专家", "大师"];
const SAVE_RECHECK_DELAY_MS = 50;
const rounds = [
  "首轮",
  "次轮",
  "半决赛",
  "总决赛",
];
const counts = [64, 32, 16, 8, 6, 4, 2];
const roundLabel = (round: number) => rounds[Math.min(round, rounds.length - 1)];
const championshipQualifyingStages = [
  { round: "首轮", players: "64 人", tables: "8 桌" },
  { round: "次轮", players: "32 人", tables: "4 桌" },
  { round: "半决赛", players: "16 人", tables: "2 桌" },
  { round: "总决赛", players: "8 强", tables: "冠军桌" },
] as const;
// One concrete five-card example per hand ranking, highest to lowest, used to
// illustrate the rules with real cards instead of just naming them.
const handRankExamples = [
  { name: "皇家同花顺", cards: [8, 9, 10, 11, 12] },
  { name: "同花顺", cards: [20, 21, 22, 23, 24] },
  { name: "四条", cards: [11, 24, 37, 50, 0] },
  { name: "葫芦", cards: [0, 13, 26, 1, 14] },
  { name: "同花", cards: [12, 9, 7, 4, 1] },
  { name: "顺子", cards: [3, 17, 31, 45, 7] },
  { name: "三条", cards: [6, 19, 32, 51, 42] },
  { name: "两对", cards: [11, 24, 2, 15, 33] },
  { name: "一对", cards: [8, 21, 27, 43, 10] },
  { name: "高牌", cards: [12, 22, 32, 42, 0] },
];
const winnerPetals = [
  { x: -68, y: -54, twist: "-150deg", drift: "-12px", color: "#e7c970" },
  { x: -58, y: -68, twist: "-95deg", drift: "-10px", color: "#a9bc91" },
  { x: -42, y: -77, twist: "135deg", drift: "-8px", color: "#f0e3bb" },
  { x: -25, y: -86, twist: "175deg", drift: "-6px", color: "#ca8d7b" },
  { x: -10, y: -68, twist: "210deg", drift: "9px", color: "#d9b75d" },
  { x: 10, y: -95, twist: "-155deg", drift: "8px", color: "#e9d9a1" },
  { x: 28, y: -80, twist: "-120deg", drift: "12px", color: "#c98b79" },
  { x: 45, y: -76, twist: "145deg", drift: "14px", color: "#e7c970" },
  { x: 63, y: -60, twist: "155deg", drift: "14px", color: "#e8dcae" },
  { x: 88, y: -45, twist: "-175deg", drift: "12px", color: "#d7b85f" },
  { x: 78, y: -25, twist: "-195deg", drift: "8px", color: "#a9bc91" },
  { x: 90, y: -3, twist: "120deg", drift: "15px", color: "#f0e3bb" },
  { x: 73, y: 18, twist: "125deg", drift: "15px", color: "#e7c970" },
  { x: 83, y: 38, twist: "-140deg", drift: "13px", color: "#ca8d7b" },
  { x: 54, y: 55, twist: "-155deg", drift: "11px", color: "#f0e3bb" },
  { x: 42, y: 84, twist: "170deg", drift: "10px", color: "#a9bc91" },
  { x: 23, y: 75, twist: "195deg", drift: "-6px", color: "#d7b85f" },
  { x: 2, y: 91, twist: "-120deg", drift: "-8px", color: "#e9d9a1" },
  { x: -18, y: 72, twist: "-135deg", drift: "-12px", color: "#ca8d7b" },
  { x: -38, y: 84, twist: "150deg", drift: "-10px", color: "#e7c970" },
  { x: -53, y: 56, twist: "175deg", drift: "-15px", color: "#e9d9a1" },
  { x: -88, y: 40, twist: "-165deg", drift: "-13px", color: "#a9bc91" },
  { x: -77, y: 19, twist: "-205deg", drift: "-8px", color: "#a9bc91" },
  { x: -90, y: -17, twist: "135deg", drift: "-12px", color: "#f0e3bb" },
  { x: -35, y: -12, twist: "145deg", drift: "-14px", color: "#e4c365" },
  { x: 39, y: 7, twist: "-170deg", drift: "12px", color: "#f0e3bb" },
];
const aiProviderPresets = [
  {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com",
    model: "deepseek-flash",
  },
  {
    name: "MiniMax",
    endpoint: "https://api.minimax.io/v1",
    model: "MiniMax-M3",
  },
  {
    name: "GPT",
    endpoint: "https://api.openai.com/v1",
    model: "gpt-6-astra",
  },
  {
    name: "Kimi",
    endpoint: "https://api.moonshot.ai/v1",
    model: "kimi-k3",
  },
  {
    name: "智谱 GLM",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.3",
  },
] as const;
function makeTournamentRoster(
  characters: Character[],
  overrides: Record<string, Character>,
  difficulty: number,
) {
  const customized = characters.map((p) => overrides[p.id] || p);
  const pool = shuffled(
    customized.filter((p) => Math.abs(p.level - difficulty) <= 1),
  );
  const fallback = shuffled(
    customized.filter((p) => !pool.some((x) => x.id === p.id)),
  );
  return [...pool, ...fallback]
    .map((p) => ({
      ...p,
      level: Math.max(1, Math.min(5, difficulty + Math.round((p.level - 3) / 2))),
    }))
    .slice(0, 63);
}
function createChampionshipRecord(
  players: Character[],
  mode: ChampionshipRecord["mode"],
  entrants: number,
  difficulty = 3,
): ChampionshipRecord {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playedAt: new Date().toISOString(),
    mode,
    entrants,
    standings: championshipStandings(players, difficulty),
  };
}
function recordCashEliminations(eliminated: Character[], before: Game, after: Game): Character[] {
  const recordedIds = new Set(eliminated.map((player) => player.id));
  const previousChips = new Map(
    before.players.map((player) => [player.profile.id, player.chips]),
  );
  const newlyEliminated = after.players
    .filter((player) =>
      player.chips === 0 &&
      (previousChips.get(player.profile.id) || 0) > 0 &&
      !recordedIds.has(player.profile.id),
    )
    .map((player) => player.profile);
  return [...eliminated, ...newlyEliminated].slice(0, 7);
}
function createCashMatchResult(game: Game, eliminated: Character[]): CashMatchResult {
  const chipsById = new Map(game.players.map((player) => [player.profile.id, player.chips]));
  const standings: Character[] = [];
  const seen = new Set<number>();
  const addPlayer = (player: Character | undefined) => {
    if (!player || seen.has(player.id)) return;
    seen.add(player.id);
    standings.push(player);
  };

  addPlayer(game.players.find((player) => player.chips > 0)?.profile);
  eliminated.slice().reverse().forEach(addPlayer);
  game.players.slice().sort((a, b) => b.chips - a.chips).forEach((player) => addPlayer(player.profile));

  return {
    playedAt: new Date().toISOString(),
    entrants: game.players.length,
    standings: standings.map((player, index) => ({
      place: index + 1,
      player,
      chips: chipsById.get(player.id) || 0,
    })),
  };
}
function getCompletedStandings(
  tournament: Tournament | null,
  records: ChampionshipRecord[],
): Character[] {
  if (!tournament?.complete) return [];
  if (tournament.finalStandings?.length) return tournament.finalStandings.slice(0, 8);

  const savedRecord = records.find(
    (record) => record.mode === "played" && record.standings.length > 0,
  );
  if (savedRecord) {
    return savedRecord.standings
      .slice()
      .sort((a, b) => a.place - b.place)
      .slice(0, 8)
      .map(({ player }) => player);
  }
  if (tournament.out) return [];

  const placements = [
    tournament.field[0],
    ...(tournament.finalEliminated || []).slice().reverse(),
    ...(tournament.topTwoOuts || []),
  ];
  const seen = new Set<number>();
  const uniquePlacements: Character[] = [];
  for (const player of placements) {
    if (!player || seen.has(player.id)) continue;
    seen.add(player.id);
    uniquePlacements.push(player);
  }
  return uniquePlacements.slice(0, 8);
}
async function prepareAvatar(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
  if (file.size > 8 * 1024 * 1024) throw new Error("图片不能超过 8 MB");
  const bitmap = await createImageBitmap(file);
  try {
    const size = 256;
    const scale = Math.max(size / bitmap.width, size / bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法处理这张图片");
    context.fillStyle = "#324635";
    context.fillRect(0, 0, size, size);
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    bitmap.close();
  }
}
function renameLocalPlayer(save: Save, name: string): Save {
  const rename = (player: Character) => player.id === -1 ? { ...player, name } : player;
  const renameGame = (game: Game): Game => ({
    ...game,
    players: game.players.map((player) => ({ ...player, profile: rename(player.profile) })),
  });
  const renameTournament = (tournament: Tournament): Tournament => ({
    ...tournament,
    field: tournament.field.map(rename),
    ...(tournament.finalists ? { finalists: tournament.finalists.map(rename) } : {}),
    ...(tournament.finalStandings ? { finalStandings: tournament.finalStandings.map(rename) } : {}),
    ...(tournament.qualificationOut ? { qualificationOut: tournament.qualificationOut.map(rename) } : {}),
    ...(tournament.topTwoOuts ? { topTwoOuts: tournament.topTwoOuts.map(rename) } : {}),
    ...(tournament.finalEliminated ? { finalEliminated: tournament.finalEliminated.map(rename) } : {}),
    ...(tournament.pendingLocal ? { pendingLocal: tournament.pendingLocal.map(rename) } : {}),
    ...(tournament.playoff ? {
      playoff: {
        ...tournament.playoff,
        original: renameGame(tournament.playoff.original),
        locked: tournament.playoff.locked.map(rename),
      },
    } : {}),
    ...(tournament.background ? {
      background: {
        ...tournament.background,
        remaining: tournament.background.remaining.map(rename),
        qualified: tournament.background.qualified.map(rename),
      },
    } : {}),
    ...(tournament.simulationCheckpoint ? {
      simulationCheckpoint: {
        ...tournament.simulationCheckpoint,
        field: tournament.simulationCheckpoint.field.map(rename),
        advancing: tournament.simulationCheckpoint.advancing.map(rename),
      },
    } : {}),
  });
  const nextSave: Save = {
    ...save,
    playerProfile: { ...save.playerProfile, name },
    game: save.game ? renameGame(save.game) : null,
    tournament: save.tournament ? renameTournament(save.tournament) : null,
    ...(save.pausedTournament ? {
      pausedTournament: {
        game: renameGame(save.pausedTournament.game),
        tournament: renameTournament(save.pausedTournament.tournament),
        ...(save.pausedTournament.match ? { match: save.pausedTournament.match } : {}),
      },
    } : {}),
    tournamentRecords: save.tournamentRecords.map((record) => ({
      ...record,
      standings: record.standings.map((standing) => ({
        ...standing,
        player: rename(standing.player),
      })),
    })),
  };
  return nextSave;
}
const blankCareerStats: PlayerCareerStats = {
  matches: 0,
  advances: 0,
  handsWon: 0,
  handsPlayed: 0,
  cashMatchesWon: 0,
  championshipsEntered: 0,
  tournamentHandsWon: 0,
  tournamentHandsPlayed: 0,
  pointsTenths: 0,
  highestChips: 0,
  bestPlace: 0,
};
function registerMatches(
  save: Save,
  players: Character[],
  bestPlace = 0,
  isChampionship = false,
): Save {
  const playerStats = { ...save.playerStats };
  for (const player of players) {
    const id = String(player.id);
    const current = playerStats[id] || blankCareerStats;
    playerStats[id] = {
      ...current,
      matches: current.matches + 1,
      championshipsEntered: current.championshipsEntered + (isChampionship ? 1 : 0),
      highestChips: Math.max(current.highestChips, 10000),
      bestPlace: bestPlace
        ? current.bestPlace ? Math.min(current.bestPlace, bestPlace) : bestPlace
        : current.bestPlace,
    };
  }
  return { ...save, playerStats };
}
function recordHandResult(save: Save, game: Game, inTournament: boolean): Save {
  const playerStats = { ...save.playerStats };
  const winners = new Set(game.winners.map((index) => game.players[index]?.profile.id));
  for (const player of game.players) {
    const id = String(player.profile.id);
    const current = playerStats[id] || blankCareerStats;
    const won = winners.has(player.profile.id) ? 1 : 0;
    playerStats[id] = {
      ...current,
      handsWon: current.handsWon + won,
      handsPlayed: current.handsPlayed + 1,
      // Cash-table hands still count toward "手数" for bragging rights, but only
      // hands played inside a real championship feed the combined career score —
      // otherwise endless single-table grinding could outweigh real tournament runs.
      pointsTenths: current.pointsTenths + (inTournament ? won : 0),
      tournamentHandsWon: current.tournamentHandsWon + (inTournament ? won : 0),
      tournamentHandsPlayed: current.tournamentHandsPlayed + (inTournament ? 1 : 0),
      highestChips: Math.max(current.highestChips, player.chips),
    };
  }
  return { ...save, playerStats };
}
function recordCashMatchWinner(
  save: Save,
  game: Game,
  match?: MatchSession,
  fallbackDifficulty = 3,
): Save {
  const winner = game.players.find((player) => player.chips > 0);
  if (!winner) return save;
  const id = String(winner.profile.id);
  const current = save.playerStats[id] || blankCareerStats;
  const entrants = match?.entrants ?? game.players.length;
  const difficulty = match?.difficulty ?? fallbackDifficulty;
  return {
    ...save,
    playerStats: {
      ...save.playerStats,
      [id]: {
        ...current,
        cashMatchesWon: current.cashMatchesWon + 1,
        pointsTenths: current.pointsTenths + singleMatchPointsTenths(entrants, difficulty),
      },
    },
  };
}
function applyTablePerformance(save: Save, performance: SimulatedTablePerformance): Save {
  const playerStats = { ...save.playerStats };
  const ids = new Set([
    ...Object.keys(performance.handsWon),
    ...Object.keys(performance.highestChips),
  ]);
  for (const id of ids) {
    const current = playerStats[id] || blankCareerStats;
    const handsWon = performance.handsWon[id] || 0;
    playerStats[id] = {
      ...current,
      handsWon: current.handsWon + handsWon,
      pointsTenths: current.pointsTenths + handsWon,
      highestChips: Math.max(current.highestChips, performance.highestChips[id] || 0),
    };
  }
  return { ...save, playerStats };
}
function applySimulationPerformance(
  save: Save,
  performance: SimulationPlayerStatsMap,
  countMatches = false,
): Save {
  const playerStats = { ...save.playerStats };
  for (const [id, result] of Object.entries(performance)) {
    const current = playerStats[id] || blankCareerStats;
    playerStats[id] = {
      ...current,
      matches: current.matches + (countMatches ? 1 : 0),
      advances: current.advances + result.advances,
      handsWon: current.handsWon + result.handsWon,
      pointsTenths: current.pointsTenths + result.handsWon,
      highestChips: Math.max(current.highestChips, result.highestChips),
      bestPlace: result.bestPlace
        ? current.bestPlace ? Math.min(current.bestPlace, result.bestPlace) : result.bestPlace
        : current.bestPlace,
    };
  }
  return { ...save, playerStats };
}
function recordAdvancement(save: Save, players: Character[], place: number): Save {
  const playerStats = { ...save.playerStats };
  for (const player of players) {
    const id = String(player.id);
    const current = playerStats[id] || blankCareerStats;
    playerStats[id] = {
      ...current,
      advances: current.advances + 1,
      bestPlace: current.bestPlace ? Math.min(current.bestPlace, place) : place,
    };
  }
  return { ...save, playerStats };
}
function recordTournamentEliminations(tournament: Tournament, game: Game): Tournament {
  if (!game.done || tournament.round < 2) return tournament;
  const newlyEliminated = eliminatedProfiles(game);
  if (!newlyEliminated.length) return tournament;
  if (tournament.round === 2) {
    const recordedIds = new Set((tournament.qualificationOut || []).map((player) => player.id));
    return {
      ...tournament,
      qualificationOut: [
        ...(tournament.qualificationOut || []),
        ...newlyEliminated.filter((player) => !recordedIds.has(player.id)),
      ].slice(-8),
    };
  }
  const recordedIds = new Set((tournament.finalEliminated || []).map((player) => player.id));
  return {
    ...tournament,
    finalEliminated: [
      ...(tournament.finalEliminated || []),
      ...newlyEliminated.filter((player) => !recordedIds.has(player.id)),
    ].slice(-8),
  };
}
function stacksFromGame(game: Game | null): Record<string, number> {
  return Object.fromEntries(
    (game?.players || []).map((player) => [String(player.profile.id), player.chips]),
  );
}
function recordPlacements(save: Save, players: Character[]): Save {
  const playerStats = { ...save.playerStats };
  players.forEach((player, index) => {
    const id = String(player.id);
    const current = playerStats[id] || blankCareerStats;
    const place = index + 1;
    playerStats[id] = {
      ...current,
      bestPlace: current.bestPlace ? Math.min(current.bestPlace, place) : place,
    };
  });
  return { ...save, playerStats };
}
const TABLE_TIMER_STORAGE_KEY = "river-save:timer";
const LEGACY_TABLE_TIMER_STORAGE_KEY = "moyu-dezhou-match-timer-v2";
type StoredTimer = { matchId: string; elapsedMs: number };
type TimerStorage = {
  cash: StoredTimer | null;
  championship: StoredTimer | null;
};
let legacyTimerStorageCleaned = false;
type TableTimerState = {
  matchId: string;
  mode: MatchMode;
  accumulatedMs: number;
  runningSinceMs: number | null;
};
function createMatchSession(
  mode: MatchMode,
  config: Pick<MatchSession, "entrants" | "difficulty"> = {},
): MatchSession {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return { id: randomId, mode, ...config };
}
function emptyTimerStorage(): TimerStorage {
  return { cash: null, championship: null };
}
function emptyTableTimer(session: MatchSession): TableTimerState {
  return { matchId: session.id, mode: session.mode, accumulatedMs: 0, runningSinceMs: null };
}
function cleanupLegacyTimerStorage() {
  if (legacyTimerStorageCleaned) return;
  legacyTimerStorageCleaned = true;
  if (typeof localStorage === "undefined") return;
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (
      key === LEGACY_TABLE_TIMER_STORAGE_KEY ||
      key.startsWith(`${LEGACY_TABLE_TIMER_STORAGE_KEY}:`)
    ) {
      keys.push(key);
    }
  }
  keys.forEach((key) => localStorage.removeItem(key));
}
function parseStoredTimer(value: unknown): StoredTimer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const timer = value as Record<string, unknown>;
  return typeof timer.matchId === "string" &&
    timer.matchId.length > 0 &&
    typeof timer.elapsedMs === "number" &&
    Number.isFinite(timer.elapsedMs) &&
    timer.elapsedMs >= 0
    ? { matchId: timer.matchId, elapsedMs: timer.elapsedMs }
    : null;
}
function readTimerStorage(): TimerStorage {
  cleanupLegacyTimerStorage();
  if (typeof localStorage === "undefined") return emptyTimerStorage();
  try {
    const raw = localStorage.getItem(TABLE_TIMER_STORAGE_KEY);
    if (!raw) return emptyTimerStorage();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return emptyTimerStorage();
    }
    const value = parsed as Record<string, unknown>;
    return {
      cash: parseStoredTimer(value.cash),
      championship: parseStoredTimer(value.championship),
    };
  } catch {
    return emptyTimerStorage();
  }
}
function writeTimerStorage(value: TimerStorage) {
  if (typeof localStorage === "undefined") return;
  if (!value.cash && !value.championship) {
    localStorage.removeItem(TABLE_TIMER_STORAGE_KEY);
    return;
  }
  localStorage.setItem(TABLE_TIMER_STORAGE_KEY, JSON.stringify(value));
}
function loadTableTimer(session: MatchSession | null, savedElapsedMs = 0): TableTimerState | null {
  if (!session) return null;
  const stored = readTimerStorage()[session.mode];
  const storedElapsedMs = stored?.matchId === session.id ? stored.elapsedMs : 0;
  return {
    matchId: session.id,
    mode: session.mode,
    accumulatedMs: Math.max(savedElapsedMs, storedElapsedMs),
    runningSinceMs: null,
  };
}
function ensureMatchMetadata(save: Save): Save {
  let next = save;
  if ((save.game || save.tournament) && !save.activeMatch) {
    const mode: MatchMode = save.tournament ? "championship" : "cash";
    next = {
      ...next,
      activeMatch: createMatchSession(mode, {
        entrants: save.tournament?.entrants ?? save.game?.players.length,
        difficulty: save.settings.difficulty,
      }),
    };
  }
  if (next.pausedTournament && !next.pausedTournament.match) {
    next = {
      ...next,
      pausedTournament: {
        ...next.pausedTournament,
        match: createMatchSession("championship", {
          entrants: next.pausedTournament.tournament.entrants ?? next.pausedTournament.game.players.length,
          difficulty: next.settings.difficulty,
        }),
      },
    };
  }
  return next;
}
function saveTableTimer(state: TableTimerState) {
  try {
    const timers = readTimerStorage();
    timers[state.mode] = {
      matchId: state.matchId,
      elapsedMs: state.accumulatedMs,
    };
    writeTimerStorage(timers);
  } catch {
    // best-effort only; the timer just won't survive a refresh if storage is unavailable
  }
}
function removeTableTimer(matchId?: string) {
  try {
    const timers = readTimerStorage();
    (Object.keys(timers) as MatchMode[]).forEach((mode) => {
      if (!matchId || timers[mode]?.matchId === matchId) timers[mode] = null;
    });
    writeTimerStorage(timers);
  } catch {
    // best-effort only
  }
}
function elapsedTableMs(state: TableTimerState) {
  return state.accumulatedMs + (state.runningSinceMs ? Date.now() - state.runningSinceMs : 0);
}
function formatTableDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function bestResultLabel(place: number) {
  if (!place) return "—";
  if (place === 1) return "冠军";
  if (place === 2) return "亚军";
  if (place === 6) return "六强";
  const bracket = [4, 8, 16, 32, 64].find((size) => place <= size) || place;
  return `${bracket} 强`;
}
function championshipWinCount(records: ChampionshipRecord[], id: number) {
  // Standings only ever record the top 8 finishers of a championship, so counting
  // "entries" from them would undercount everyone who went out earlier — entries
  // are read from a player's `matches` career stat instead (bumped for the whole
  // field when a championship starts). Simulated-only runs never involved a real
  // hand for anyone, so they don't count as a win here, same as they don't score.
  let won = 0;
  for (const record of records) {
    if (record.mode !== "played") continue;
    if (record.standings[0]?.player.id === id) won += 1;
  }
  return won;
}
type ChampionshipTitle = "champion" | "runner-up" | "third";
function championshipTitle(records: ChampionshipRecord[], id: number): ChampionshipTitle | null {
  let bestPlace = Number.POSITIVE_INFINITY;
  for (const record of records) {
    if (record.mode !== "played") continue;
    const place = record.standings.find((standing) => standing.player.id === id)?.place;
    if (place && place < bestPlace) bestPlace = place;
  }
  if (bestPlace === 1) return "champion";
  if (bestPlace === 2) return "runner-up";
  if (bestPlace === 3) return "third";
  return null;
}
type HistoricalHonors = {
  champion: number;
  runnerUp: number;
  top8: number;
};
function historicalHonorsLabel(honors: HistoricalHonors) {
  return [
    honors.champion ? `${honors.champion}冠` : "",
    honors.runnerUp ? `${honors.runnerUp}亚` : "",
    honors.top8 ? `${honors.top8}八强` : "",
  ].join("");
}
function winRateLabel(wins: number, entries: number) {
  return entries ? `${Math.round((wins / entries) * 100)}%` : "—";
}
function startNextTournamentRound(save: Save, localQualified: Character[]): Save {
  const tournament = save.tournament;
  if (!tournament) return save;
  const byId = new Map<number, Character>();
  [...localQualified, ...(tournament.background?.qualified || [])].forEach((p) =>
    byId.set(p.id, p),
  );
  const field = shuffled([...byId.values()]);
  if (!field.some((p) => p.id === -1)) return save;
  const round = tournament.round + 1;
  const table = [field.find((p) => p.id === -1)!, ...field.filter((p) => p.id !== -1).slice(0, 7)];
  const knownStacks = tournament.stacks || {};
  const heroStack = save.game?.players.find((p) => p.profile.id === -1)?.chips
    ?? knownStacks["-1"]
    ?? 10000;
  const fieldStacks = Object.fromEntries(
    field.map((player) => [
      String(player.id),
      tournament.resetStacksEachRound
        ? 10000
        : player.id === -1 ? heroStack : knownStacks[String(player.id)] ?? 10000,
    ]),
  );
  const game = newGame(
    table,
    100,
    table.map((p) => fieldStacks[String(p.id)]),
  );
  const tableIds = new Set(table.map((p) => p.id));
  const background = round < 3
    ? { remaining: field.filter((p) => !tableIds.has(p.id)), qualified: [], done: false }
    : undefined;
  const nextTournament = recordTournamentEliminations({
    ...tournament,
    round,
    field,
    stacks: fieldStacks,
    background,
    pendingLocal: undefined,
    playoff: undefined,
    finalists: round === 3 ? field : tournament.finalists,
    qualificationOut: [],
    out: false,
    paused: false,
    autoSimulating: false,
    simulationComplete: false,
    simulationCheckpoint: undefined,
    results: [...tournament.results, `${roundLabel(tournament.round)} · 晋级`],
  }, game);
  const nextSave: Save = {
    ...save,
    game,
    tournament: nextTournament,
    chipAnimation: undefined,
  };
  return recordAdvancement(nextSave, field, field.length);
}
function Card({
  value,
  back = false,
  small = false,
  highlight = false,
  className = "",
  style,
}: {
  value?: number;
  back?: boolean;
  small?: boolean;
  highlight?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`card ${className} ${small ? "small" : ""} ${highlight ? "highlight" : ""} ${back ? "back" : ""} ${value !== undefined && [1, 2].includes(suit(value)) ? "red" : ""}`}
      style={style}
    >
      {back ? (
        <span>♠</span>
      ) : value !== undefined ? (
        <span className="card-face">
          <b>{["", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"][rank(value)]}</b>
          <i>{["♠", "♥", "♦", "♣"][suit(value)]}</i>
        </span>
      ) : (
        <span className="empty-card">·</span>
      )}
    </div>
  );
}
function Avatar({
  p,
  playerAvatar,
  className = "",
}: {
  p: Character;
  playerAvatar?: string | null;
  className?: string;
}) {
  const avatarSrc = publicAsset(`avatars-webp/${String(p.id).padStart(3, "0")}.webp`);

  return p.id === -1 ? (
    <div className={`hero-avatar ${className}`.trim()}>
      {playerAvatar ? <img src={playerAvatar} alt={`${p.name}头像`} /> : "♠"}
    </div>
  ) : (
    <img className={className || undefined} src={avatarSrc} alt={p.name} loading="lazy" />
  );
}
type LeaderboardEntry = PlayerCareerStats & {
  player: Character;
  honors: HistoricalHonors;
};
// App() is one large component, so any unrelated state change anywhere (opening
// a modal, toggling the header's "更多" menu, the table timer ticking once a
// second) re-runs its whole render — and an inline `leaderboard.map(...)` over
// ~63 rows would rebuild every row's element tree each time, even though the
// underlying data hadn't changed. That rebuild-and-reconcile cost is what showed
// up as clicks feeling laggy. Pulling the rows into their own memoized component
// lets React bail out of that work entirely whenever its props are unchanged.
const LeaderboardRows = memo(function LeaderboardRows({
  rows,
  playerAvatar,
  userPlayerName,
  localRowRef,
  onSelect,
}: {
  rows: LeaderboardEntry[];
  playerAvatar?: string | null;
  userPlayerName: string;
  localRowRef: { current: HTMLButtonElement | null };
  onSelect: (id: number) => void;
}) {
  return (
    <>
      {rows.map((row, index) => (
        <button
          type="button"
          className={`leaderboard-row ${index < 3 ? "podium" : ""} ${row.player.id === -1 ? "local-player" : ""}`}
          key={row.player.id}
          ref={row.player.id === -1 ? localRowRef : undefined}
          onClick={() => onSelect(row.player.id)}
        >
          <span className="leaderboard-player">
            <b className="leaderboard-rank">{String(index + 1).padStart(2, "0")}</b>
            <Avatar p={row.player} playerAvatar={playerAvatar} />
            <span><strong>{row.player.id === -1 ? userPlayerName : row.player.name}</strong><small>{row.player.style}</small></span>
          </span>
          <strong className="leaderboard-points">{(row.pointsTenths / 10).toFixed(1)}</strong>
          <span className="leaderboard-best">
            <strong>{bestResultLabel(row.bestPlace)}</strong>
            {historicalHonorsLabel(row.honors) ? <small>{historicalHonorsLabel(row.honors)}</small> : null}
          </span>
          <span className="leaderboard-stat">{row.championshipsEntered}</span>
          <span className="leaderboard-stat">{winRateLabel(row.honors.champion, row.championshipsEntered)}</span>
          <span className="leaderboard-stat">{Math.max(0, row.matches - row.championshipsEntered)}</span>
          <span className="leaderboard-stat">{winRateLabel(row.cashMatchesWon, Math.max(0, row.matches - row.championshipsEntered))}</span>
        </button>
      ))}
    </>
  );
});
type FireworksVariant = "championship" | "cash";

function Fireworks({ active, variant = "championship" }: { active: boolean; variant?: FireworksVariant }) {
  const isCashVictory = variant === "cash";
  const bursts = useMemo(() => {
    if (!active || isCashVictory) return [];
    const colors = ["#f4d67f", "#ff7a6b", "#6bc8ff", "#7ee787", "#ffb86b", "#d68bff", "#ff9ecf", "#ffffff"];
    return Array.from({ length: 22 }, (_, i) => {
      const particles = 30 + Math.floor(Math.random() * 16);
      return {
        id: i,
        left: 7 + Math.random() * 86,
        top: 7 + Math.random() * 54,
        delay: i * 0.3 + Math.random() * 0.25,
        color: colors[i % colors.length],
        particles,
        distance: 170 + Math.random() * 170,
      };
    });
  }, [active, isCashVictory]);
  const confetti = useMemo(() => {
    if (!active) return [];
    const colors = ["#f4d67f", "#ff7a6b", "#6bc8ff", "#7ee787", "#ffb86b", "#d68bff", "#ff9ecf", "#f7f0d0"];
    return Array.from({ length: isCashVictory ? 140 : 220 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.8,
      duration: 5.5 + Math.random() * 2.6,
      drift: Math.round((Math.random() - 0.5) * 220),
      spin: `${Math.round(360 + Math.random() * 720)}deg`,
      width: 6 + Math.round(Math.random() * 7),
      height: 10 + Math.round(Math.random() * 11),
      color: colors[i % colors.length],
    }));
  }, [active, isCashVictory]);
  if (!active) return null;
  return (
    <div className={`fireworks-overlay ${isCashVictory ? "cash-victory-overlay" : ""}`} aria-hidden="true">
      <div className="champion-celebration-flash" />
      <div className="champion-celebration-copy">
        <div className={`champion-plaque ${isCashVictory ? "cash-victory-plaque" : ""}`}>
          {isCashVictory ? (
            <span className="cash-victory-trophy"><Trophy size={34} strokeWidth={2.4} /></span>
          ) : (
            <>
              <span className="champion-plaque-emblem champion-plaque-emblem-left"><Trophy size={36} strokeWidth={2.4} /></span>
              <span className="champion-plaque-emblem champion-plaque-emblem-right"><Trophy size={36} strokeWidth={2.4} /></span>
            </>
          )}
          {!isCashVictory ? <span className="champion-plaque-kicker">CHAMPIONSHIP WON</span> : null}
          <strong>{isCashVictory ? <>恭喜你 <em>赢得比赛</em></> : <>恭喜您 <em>赢得总冠军</em></>}</strong>
          <span className="champion-plaque-rule">✦　✦　✦</span>
          {!isCashVictory ? <small>击败全部对手 · 登上冠军宝座</small> : null}
        </div>
      </div>
      <div className="fireworks-confetti">
        {confetti.map((piece) => (
          <i
            className={piece.id % 5 === 0 ? "firework-confetti-piece confetti-round" : "firework-confetti-piece"}
            key={piece.id}
            style={{
              left: `${piece.left}%`,
              width: `${piece.width}px`,
              height: `${piece.height}px`,
              animationDelay: `${piece.delay}s`,
              animationDuration: `${piece.duration}s`,
              "--confetti-color": piece.color,
              "--confetti-drift": `${piece.drift}px`,
              "--confetti-spin": piece.spin,
            } as CSSProperties}
          />
        ))}
      </div>
      {bursts.map((burst) => (
        <div
          key={burst.id}
          className="firework-burst"
          style={{
            left: `${burst.left}%`,
            top: `${burst.top}%`,
            animationDelay: `${burst.delay}s`,
          }}
        >
          {Array.from({ length: burst.particles }, (_, p) => (
            <span
              key={p}
              className="firework-particle"
              style={
                {
                  "--angle": `${(360 / burst.particles) * p}deg`,
                  "--color": burst.color,
                  "--burst-distance": `${burst.distance}px`,
                  animationDelay: `${burst.delay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}
function SimulationProgressPanel({
  progress,
  label,
  resumeHint,
  playerAvatar,
}: {
  progress: ChampionshipSimulationProgress | null;
  label: string;
  resumeHint?: string;
  playerAvatar?: string | null;
}) {
  const round = progress?.round ?? 1;
  const completed = progress?.completedTables ?? 0;
  const total = progress?.totalTables ?? 0;
  const activeTable = progress?.activeTable;
  const remaining = Math.max(0, total - completed - (activeTable ? 1 : 0));
  const percent = total
    ? Math.min(100, Math.round(((completed + (activeTable ? 0.35 : 0)) / total) * 100))
    : 0;

  return (
    <section className="simulation-live-panel" aria-live="polite">
      <div className="simulation-live-heading">
        <div>
          <span className="simulation-live-pill"><i /> 实时模拟</span>
          <span className="simulation-live-label">{label}</span>
        </div>
        <span className="simulation-round-name">
          第 {round} 阶段 · {roundLabel(Math.max(0, round - 1))}
        </span>
      </div>
      <div className="simulation-progress-stats">
        <div><strong>{total ? `${completed} / ${total}` : "准备中"}</strong><small>本轮已完成牌桌</small></div>
        <div><strong>{activeTable ? "1" : "0"}</strong><small>当前牌桌</small></div>
        <div><strong>{total ? remaining : "—"}</strong><small>待模拟牌桌</small></div>
      </div>
      <div
        className="simulation-progress-track"
        role="progressbar"
        aria-label="本轮模拟进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <i style={{ width: `${percent}%` }} />
      </div>
      {activeTable ? (
        <div className="simulation-active-table">
          <div className="simulation-table-heading">
            <strong>当前牌桌</strong>
            <span>{activeTable.hand ? `第 ${activeTable.hand} 手` : "即将开牌"} · {activeTable.players.filter((p) => !p.eliminated).length} 人仍在桌上</span>
          </div>
          <div className="simulation-player-grid">
            {activeTable.players.map(({ profile: player, chips, eliminated }) => (
              <div className={`simulation-player ${eliminated ? "eliminated" : ""}`} key={player.id}>
                <Avatar p={player} playerAvatar={playerAvatar} />
                <span><strong>{player.name}</strong><small>{eliminated ? "已淘汰" : chips === 0 ? "本手全下" : `${chips.toLocaleString()} 筹码`}</small></span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="simulation-table-wait">正在准备下一桌…</p>
      )}
      {resumeHint ? <p className="simulation-resume-note">{resumeHint}</p> : null}
    </section>
  );
}
function describeSaveReadFailure(error: unknown) {
  const errorName =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  if (error instanceof SyntaxError) return "存档内容不是有效的 JSON。";
  if (errorName === "QuotaExceededError") return "浏览器存储空间不足，无法完成存档迁移。";
  return "存档结构校验失败，或迁移到新版时写入失败。";
}

export default function App() {
  const [data, setData] = useState<Save>(blank);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [ready, setReady] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [page, setPage] = useAppRouter();
  const vscodeEnvironment = isVscodeWebview();
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("ai");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [modal, setModal] = useState<
    "new" | "rules" | "points" | "cash-details" | "tournament-details" | null
  >(null);
  const [newMode, setNewMode] = useState<"cash" | "tournament">("cash");
  const [seatCount, setSeatCount] = useState(6);
  const [resetTournamentStacks, setResetTournamentStacks] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tableSeconds, setTableSeconds] = useState(0);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [cashEliminated, setCashEliminated] = useState<Character[]>([]);
  const [cashMatchResult, setCashMatchResult] = useState<CashMatchResult>();
  const [key, setKey] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("本地玩家");
  const [profileAvatarDraft, setProfileAvatarDraft] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [toast, setToast] = useState("");
  const [raise, setRaise] = useState(200);
  const [selected, setSelected] = useState<Character | null>(null);
  const [statsOnly, setStatsOnly] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState<Character | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchCount, setBatchCount] = useState(5);
  const [batchResults, setBatchResults] = useState<Character[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const batchStop = useRef(false);
  const [progress, setProgress] = useState("");
  const [eliminatedProgress, setEliminatedProgress] = useState<ChampionshipSimulationProgress | null>(null);
  const [imported, setImported] = useState<Save | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [saveLoadIssue, setSaveLoadIssue] = useState<{
    title: string;
    message: string;
    recoverable: boolean;
  } | null>(null);
  const [saveStale, setSaveStale] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [lastAction, setLastAction] = useState<{ id: number; player: number } | null>(null);
  const [chipToss, setChipToss] = useState<{
    seat: number;
    token: number;
    hand: number;
    playerId: number;
    total: number;
    source: { x: number; y: number } | null;
  } | null>(null);
  const [celebrationDone, setCelebrationDone] = useState(false);
  const tableStageRef = useRef<HTMLDivElement>(null);
  const seatCardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [seatCardPositions, setSeatCardPositions] = useState<Array<{ x: number; y: number } | null>>([]);
  const [tableStageSize, setTableStageSize] = useState<TableStageSize>({ width: 0, height: 0 });
  const [tableSeatSize, setTableSeatSize] = useState<TableSeatSize>({ width: 0, height: 0 });
  const [tableLayoutReady, setTableLayoutReady] = useState(false);
  const [showAllCommunityCards, setShowAllCommunityCards] = useState(false);
  const actionId = useRef(0);
  const file = useRef<HTMLInputElement>(null);
  const localLeaderboardRow = useRef<HTMLButtonElement>(null);
  const leaderboardScrollRef = useRef<HTMLElement>(null);
  const [leaderboardScrolled, setLeaderboardScrolled] = useState(false);

  useEffect(() => {
    if (ready && page === "table" && !data.game) {
      setPage("lobby", { replace: true });
    }
  }, [data.game, page, ready, setPage]);
  // The raw onScroll event can fire far more often than once per frame (especially
  // with trackpad inertia), and calling setState synchronously on every single one
  // was itself the stutter: each call is main-thread work competing with the
  // browser's own scroll/compositing work. Coalescing to at most one state check
  // per animation frame, and only calling setState when the threshold actually
  // flips, removes that overhead.
  const leaderboardScrollFrame = useRef<number | null>(null);
  const leaderboardScrolledRef = useRef(false);
  const markSaveStale = useCallback(() => {
    setSaveStale(true);
    setPaused(true);
    setMoreMenuOpen(false);
    setModal(null);
    setImported(null);
    setConfirmDialog(null);
    setSelected(null);
    setBatchOpen(false);
    backgroundWorker.current?.postMessage({ type: "pause" });
    eliminatedWorker.current?.terminate();
    eliminatedWorker.current = null;
  }, []);
  const saveFreshnessCheck = useRef<Promise<boolean> | null>(null);
  const confirmExternalSave = useCallback(() => {
    if (vscodeEnvironment) return Promise.resolve(true);
    if (saveFreshnessCheck.current) return saveFreshnessCheck.current;

    const check = (async () => {
      const first = await checkSaveState();
      if (first.revision <= getSaveRevision()) return false;
      if (areSaveContentsEqual(first.save, dataRef.current)) {
        adoptSaveRevision(first.revision);
        return false;
      }

      await new Promise<void>((resolve) => window.setTimeout(resolve, SAVE_RECHECK_DELAY_MS));
      const second = await checkSaveState();
      if (second.revision <= getSaveRevision()) return false;
      if (areSaveContentsEqual(second.save, dataRef.current)) {
        adoptSaveRevision(second.revision);
        return false;
      }
      return true;
    })().finally(() => {
      saveFreshnessCheck.current = null;
    });

    saveFreshnessCheck.current = check;
    return check;
  }, [vscodeEnvironment]);
  const verifyAndMarkSaveStale = useCallback(() => {
    void confirmExternalSave()
      .then((stale) => {
        if (stale) markSaveStale();
      })
      .catch(() => {
        setSaveError(true);
        setToast("无法确认本地存档版本，请导出存档备份");
      });
  }, [confirmExternalSave, markSaveStale]);
  useEffect(() => {
    return () => {
      if (leaderboardScrollFrame.current != null) cancelAnimationFrame(leaderboardScrollFrame.current);
    };
  }, []);
  const avatarFile = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const rulesPausedByModal = useRef(false);
  const selectedPausedByModal = useRef(false);
  const backgroundWorker = useRef<Worker | null>(null);
  const eliminatedWorker = useRef<Worker | null>(null);
  const g = data.game;

  useEffect(() => {
    const previousShowAllCommunityCards = window.showAllCommunityCards;
    const previousHideAllCommunityCards = window.hideAllCommunityCards;
    const showAllCommunityCards: CommunityCardDebugFunction = () => {
      setShowAllCommunityCards(true);
      setToast("已通过控制台显示本手五张公共牌");
    };
    const hideAllCommunityCards: CommunityCardDebugFunction = () => {
      setShowAllCommunityCards(false);
      setToast("已恢复按流程显示公共牌");
    };

    window.showAllCommunityCards = showAllCommunityCards;
    window.hideAllCommunityCards = hideAllCommunityCards;
    console.info("[摸鱼德州] 控制台调试命令：window.showAllCommunityCards()");
    return () => {
      if (window.showAllCommunityCards === showAllCommunityCards) {
        if (previousShowAllCommunityCards) window.showAllCommunityCards = previousShowAllCommunityCards;
        else delete window.showAllCommunityCards;
      }
      if (window.hideAllCommunityCards === hideAllCommunityCards) {
        if (previousHideAllCommunityCards) window.hideAllCommunityCards = previousHideAllCommunityCards;
        else delete window.hideAllCommunityCards;
      }
    };
  }, []);

  const t = data.tournament;
  const tablePlayerTotals = useMemo(() => g?.players.map((player) => player.total) ?? [], [g?.players]);
  const tablePlayerIds = useMemo(() => g?.players.map((player) => player.profile.id) ?? [], [g?.players]);
  const markChipAnimationStarted = useCallback(
    (hand: number, updates: Record<string, number>) => {
      setData((old) => {
        const previous = old.chipAnimation?.hand === hand ? old.chipAnimation.settledTotals : {};
        const settledTotals = { ...previous };
        let changed = old.chipAnimation?.hand !== hand;
        Object.entries(updates).forEach(([playerId, total]) => {
          const nextTotal = Math.max(settledTotals[playerId] || 0, total);
          if (settledTotals[playerId] !== nextTotal) changed = true;
          settledTotals[playerId] = nextTotal;
        });
        if (!changed) return old;
        return { ...old, chipAnimation: { hand, settledTotals } };
      });
    },
    [],
  );
  const championshipWon = Boolean(
    t &&
    !t.complete &&
    g &&
    g.done &&
    t.round >= counts.length - 1 &&
    g.players.filter((player) => player.chips > 0).length === 1 &&
    g.players[0]?.profile.id === -1 &&
    g.players[0].chips > 0,
  );
  const cashMatchFinished = Boolean(
    !t &&
    g &&
    g.done &&
    g.players.filter((player) => player.chips > 0).length === 1,
  );
  const cashMatchWon = Boolean(
    cashMatchFinished &&
    g?.players[0]?.profile.id === -1 &&
    g.players[0].chips > 0,
  );
  // Lets openPlayerProfile stay a stable useCallback (see below) while still
  // reading up-to-date page/paused/tournament state at click time.
  const openPlayerProfileState = useRef({ page, paused, t });
  const activeMatch = data.activeMatch;
  const singleMatchFinishedForTimer = Boolean(
    !t &&
    g?.done &&
    g.players.filter((player) => player.chips > 0).length <= 1,
  );
  const tableEliminated = !!t?.out;
  const tableFinished = !!t?.complete;
  const tableTimerRunning = Boolean(
    page === "table" &&
    activeMatch &&
    !paused &&
    !tableEliminated &&
    !tableFinished &&
    !singleMatchFinishedForTimer &&
    !championshipWon &&
    pageVisible,
  );
  const tableTimerState = useRef<TableTimerState | null>(null);
  const flushTableTimer = useCallback(() => {
    const state = tableTimerState.current;
    if (!state) return;
    const accumulatedMs = Math.max(state.accumulatedMs, Math.floor(elapsedTableMs(state)));
    const nextState: TableTimerState = { ...state, accumulatedMs, runningSinceMs: null };
    tableTimerState.current = nextState;
    saveTableTimer(nextState);
    setTableSeconds(Math.floor(accumulatedMs / 1000));
  }, []);
  const exportCurrentSave = useCallback(() => downloadSave(data), [data]);
  useEffect(() => {
    if (!activeMatch) {
      tableTimerState.current = null;
      setTableSeconds(0);
      return;
    }
    const nextState = loadTableTimer(activeMatch);
    tableTimerState.current = nextState;
    setTableSeconds(nextState ? Math.floor(nextState.accumulatedMs / 1000) : 0);
  }, [activeMatch?.id, activeMatch?.mode]);
  useLayoutEffect(() => {
    if (page !== "table") {
      setTableLayoutReady(false);
      setTableStageSize({ width: 0, height: 0 });
      setTableSeatSize({ width: 0, height: 0 });
      setSeatCardPositions([]);
      return;
    }
    const stage = tableStageRef.current;
    if (!stage) return;
    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      const nextScale = getTableUiScale(next);
      const currentScale = Number(stage.style.getPropertyValue("--table-scale")) || 1;
      if (Math.abs(currentScale - nextScale) > 0.001) {
        stage.style.setProperty("--table-scale", nextScale.toFixed(3));
      }
      setTableStageSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
      const seatRects = Array.from(stage.querySelectorAll<HTMLElement>(".seat"));
      const nextSeatSize = seatRects.reduce(
        (size, seat) => {
          const rect = seat.getBoundingClientRect();
          return {
            width: Math.max(size.width, Math.round(rect.width)),
            height: Math.max(size.height, Math.round(rect.height)),
          };
        },
        { width: 0, height: 0 },
      );
      setTableSeatSize((current) =>
        current.width === nextSeatSize.width && current.height === nextSeatSize.height
          ? current
          : nextSeatSize,
      );
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    stage.querySelectorAll<HTMLElement>(".seat").forEach((seat) => observer.observe(seat));
    return () => observer.disconnect();
  }, [page, ready, g?.hand, g?.players.length]);
  useLayoutEffect(() => {
    if (
      page !== "table" ||
      !tableStageSize.width ||
      !tableStageSize.height ||
      !tableSeatSize.width ||
      !tableSeatSize.height
    ) {
      return;
    }
    const stage = tableStageRef.current;
    if (!stage) return;
    const nextSeatCardPositions = Array.from(stage.querySelectorAll<HTMLElement>(".seat-cards")).map((card) => {
      const rect = card.getBoundingClientRect();
      return rect.width && rect.height
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : null;
    });
    setSeatCardPositions((current) => {
      if (
        current.length === nextSeatCardPositions.length &&
        current.every((point, index) =>
          point?.x === nextSeatCardPositions[index]?.x && point?.y === nextSeatCardPositions[index]?.y,
        )
      ) {
        return current;
      }
      return nextSeatCardPositions;
    });
    setTableLayoutReady(true);
  }, [
    page,
    ready,
    g?.hand,
    g?.players.length,
    tableStageSize.width,
    tableStageSize.height,
    tableSeatSize.width,
    tableSeatSize.height,
  ]);
  const resetTableTimer = () => {
    removeTableTimer(tableTimerState.current?.matchId || data.activeMatch?.id);
    tableTimerState.current = null;
    setTableSeconds(0);
  };
  useEffect(() => {
    const handleVisibility = () => {
      const visible = document.visibilityState === "visible";
      if (!visible) flushTableTimer();
      setPageVisible(visible);
    };
    const handlePageHide = () => {
      flushTableTimer();
      setPageVisible(false);
    };
    const handlePageShow = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [flushTableTimer]);
  useEffect(() => {
    setMoreMenuOpen(false);
  }, [page]);
  useEffect(() => {
    const st = tableTimerState.current;
    if (tableTimerRunning) {
      if (st && st.runningSinceMs == null) {
        tableTimerState.current = { ...st, runningSinceMs: Date.now() };
        saveTableTimer(tableTimerState.current);
      }
    } else if (st?.runningSinceMs != null) {
      flushTableTimer();
    }
  }, [flushTableTimer, tableTimerRunning]);
  useEffect(() => {
    if (!tableTimerRunning) return;
    const id = setInterval(() => {
      const state = tableTimerState.current;
      if (!state) return;
      const accumulatedMs = Math.max(state.accumulatedMs, Math.floor(elapsedTableMs(state)));
      setTableSeconds(Math.floor(accumulatedMs / 1000));
      saveTableTimer({ ...state, accumulatedMs, runningSinceMs: null });
    }, 1000);
    return () => clearInterval(id);
  }, [tableTimerRunning]);
  useEffect(() => {
    if (t?.complete) removeTableTimer(data.activeMatch?.id);
  }, [data.activeMatch?.id, t?.complete]);
  const [showFireworks, setShowFireworks] = useState(false);
  const [fireworksVariant, setFireworksVariant] = useState<FireworksVariant>("championship");
  const fireworksTimer = useRef<number | null>(null);
  const championSoundPlayed = useRef(false);
  const championSoundRequest = useRef<Promise<boolean> | null>(null);
  const triggerFireworks = useCallback((durationMs: number, variant: FireworksVariant = "championship") => {
    setFireworksVariant(variant);
    setShowFireworks(true);
    if (fireworksTimer.current) window.clearTimeout(fireworksTimer.current);
    fireworksTimer.current = window.setTimeout(() => setShowFireworks(false), durationMs);
  }, []);
  const playChampionSound = useCallback(() => {
    if (championSoundPlayed.current || championSoundRequest.current) return;
    const request = playGameSound("champion", data.settings.sound);
    championSoundRequest.current = request;
    void request.then((played) => {
      if (championSoundRequest.current !== request) return;
      championSoundRequest.current = null;
      if (played) championSoundPlayed.current = true;
    });
  }, [data.settings.sound]);
  const triggerChampionCelebration = useCallback(() => {
    triggerFireworks(9500, "championship");
    playChampionSound();
  }, [playChampionSound, triggerFireworks]);
  const triggerCashCelebration = useCallback(() => {
    triggerFireworks(8500, "cash");
  }, [triggerFireworks]);
  // Keep the celebration replayable until the player confirms the championship.
  // That means refreshing the unconfirmed final hand can replay the moment too.
  useEffect(() => {
    if (!championshipWon) {
      championSoundPlayed.current = false;
      championSoundRequest.current = null;
      return;
    }
    if (!ready) return;
    triggerChampionCelebration();
  }, [championshipWon, ready, triggerChampionCelebration]);
  useEffect(() => {
    if (!championshipWon) return;
    const replayChampionSound = () => playChampionSound();
    window.addEventListener("pointerdown", replayChampionSound, { capture: true });
    window.addEventListener("keydown", replayChampionSound, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", replayChampionSound, { capture: true });
      window.removeEventListener("keydown", replayChampionSound, { capture: true });
    };
  }, [championshipWon, playChampionSound]);
  useEffect(() => {
    if (!cashMatchWon || !ready) return;
    triggerCashCelebration();
  }, [cashMatchWon, ready, triggerCashCelebration]);
  useEffect(() => {
    return () => {
      if (fireworksTimer.current) window.clearTimeout(fireworksTimer.current);
    };
  }, []);
  const completedStandings = getCompletedStandings(t, data.tournamentRecords);
  const currentSaveSummary = summarizeSaveRecords(data);
  const localBest =
    g && g.board.length >= 3
      ? evaluate([...g.players[0].cards, ...g.board]).best
      : [];
  const localHandName = g
    ? currentHandName([...g.players[0].cards, ...g.board])
    : "等待发牌";
  const userPlayer = { ...hero, name: data.playerProfile.name.trim() || "本地玩家" };
  const userPlayerRef = useRef(userPlayer);
  userPlayerRef.current = userPlayer;
  useEffect(() => {
    cleanupLegacyTimerStorage();
    void Promise.allSettled([
      loadSave(),
      fetch(publicAsset("characters.json")).then((response) => {
        if (!response.ok) throw new Error(`人物数据请求失败（${response.status}）`);
        return response.json();
      }),
    ]).then(([saveResult, charactersResult]) => {
      if (saveResult.status === "rejected") {
        setSaveError(true);
        setSaveLoadIssue({
          title: "本地存档读取失败",
          message: `${describeSaveReadFailure(saveResult.reason)}原存档未被覆盖，请导入备份后继续。`,
          recoverable: false,
        });
        if (charactersResult.status === "fulfilled") setCharacters(charactersResult.value);
        setReady(true);
        return;
      }

      const loaded = saveResult.value;
      if (loaded.recoveryNotice) {
        setSaveError(true);
        setSaveLoadIssue({
          title: "检测到存档损坏",
          message: loaded.recoveryNotice,
          recoverable: true,
        });
      }
      const saved = loaded.save;
      const restored = ensureMatchMetadata(
        saved.tournament?.out && !saved.tournament.complete && !saved.tournament.simulationComplete
          ? { ...saved, tournament: { ...saved.tournament, autoSimulating: true } }
          : saved,
      );
      setData(restored);
      setProfileNameDraft(restored.playerProfile.name);
      setProfileAvatarDraft(restored.playerProfile.avatar);
      if (charactersResult.status === "fulfilled") {
        setCharacters(charactersResult.value);
      } else {
        setToast("人物数据加载失败，但存档已恢复");
      }
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (!ready) return;

    const unsubscribe = subscribeToSaveChanges(() => verifyAndMarkSaveStale());
    window.addEventListener("focus", verifyAndMarkSaveStale);
    document.addEventListener("visibilitychange", verifyAndMarkSaveStale);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", verifyAndMarkSaveStale);
      document.removeEventListener("visibilitychange", verifyAndMarkSaveStale);
    };
  }, [ready, verifyAndMarkSaveStale]);
  useEffect(() => {
    if (!ready || saveError || saveStale) return;
    saveData(data)
      .catch((error) => {
        if (isSaveConflictError(error)) {
          verifyAndMarkSaveStale();
          return;
        }
        if (isSaveValidationError(error)) {
          setSaveError(true);
          setToast(error.message);
          return;
        }
        setSaveError(true);
        setToast("自动保存失败，请导出存档备份");
      });
  }, [data, ready, saveError, saveStale, verifyAndMarkSaveStale]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  const commit = (next: Game) => {
    const top = next.log[0] || "";
    const previous = g?.log[0] || "";
    if (top !== previous && !top.startsWith("第 ") && !top.includes("赢得")) {
      const player = next.players.find(p => top.startsWith(`${p.profile.name} · `));
      if (player) { const label = player.last; const type = label.includes("弃牌") ? "fold" : label.includes("全下") ? "allin" : label.includes("加注") ? "raise" : label.includes("跟注") ? "call" : "check"; actionId.current++; setLastAction({ id: actionId.current, player: player.profile.id }); if (["raise", "allin", "call"].includes(type)) { const seatIndex = next.players.indexOf(player); if (seatIndex >= 0) { const rect = seatCardRefs.current[seatIndex]?.getBoundingClientRect(); setChipToss({ seat: seatIndex, token: actionId.current, hand: next.hand, playerId: player.profile.id, total: player.total, source: rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null }) } } playGameSound(type, data.settings.sound) }
    }
    if (top.startsWith("第 ")) setLastAction(null);
    if (next.board.length > (g?.board.length || 0)) playGameSound("deal", data.settings.sound);
    const handEnded = next.done && !g?.done;
    const localChampionWon = Boolean(
      t &&
      !t.complete &&
      next.done &&
      t.round >= counts.length - 1 &&
      next.players.filter((player) => player.chips > 0).length === 1 &&
      next.players[0]?.profile.id === -1 &&
      next.players[0].chips > 0,
    );
    if (handEnded && next.winners.length) {
      setCelebrationDone(false);
      if (localChampionWon) {
        triggerChampionCelebration();
      } else {
        playGameSound("win", data.settings.sound);
      }
    }
    if (handEnded && !t && g) {
      setCashEliminated((eliminated) => recordCashEliminations(eliminated, g, next));
    }
    setData((old) => {
      const ended = next.done && !old.game?.done;
      let tournament = old.tournament;
      if (next.done && tournament && tournament.round >= 2 && old.game) {
        tournament = recordTournamentEliminations(tournament, next);
      }
      const updated: Save = {
        ...old,
        game: next,
        tournament,
        stats: ended
          ? { ...old.stats, hands: old.stats.hands + 1, wins: old.stats.wins + (next.winners.includes(0) ? 1 : 0) }
          : old.stats,
      };
      if (!ended) return updated;
      const withHandResult = recordHandResult(updated, next, !!tournament);
      return !tournament && next.players.filter((player) => player.chips > 0).length === 1
        ? recordCashMatchWinner(withHandResult, next, old.activeMatch, old.settings.difficulty)
        : withHandResult;
    });
    if (handEnded && next.winners.length) { const timer = window.setTimeout(() => setCelebrationDone(true), 5200); return () => window.clearTimeout(timer) }
  };
  useEffect(() => { if (!g?.done || !g.winners.length) { setCelebrationDone(false); return } setCelebrationDone(false); const timer = window.setTimeout(() => setCelebrationDone(true), 5200); return () => window.clearTimeout(timer) }, [g?.done, g?.hand, g?.result]);
  useEffect(() => {
    if (!g || g.done || g.turn === 0 || paused || page !== "table") return;
    const controller = new AbortController();
    let worker: Worker | undefined;
    const id = setTimeout(async () => {
      const o = observe(g);
      if (t) o.qualify = t.round < 3 ? 4 : 1;
      const fallback = () => {
        worker = new BotWorker();
        worker.onmessage = (e: MessageEvent<Move>) => {
          if (!controller.signal.aborted) commit(act(g, e.data));
          worker?.terminate();
        };
        worker.onerror = () => {
          if (!controller.signal.aborted)
            commit(act(g, { type: o.call ? "fold" : "call" }));
          worker?.terminate();
        };
        worker.postMessage(o);
      };
      if (
        data.settings.mode === "all" ||
        (data.settings.mode === "key" &&
          (o.call >= g.bb * 10 || o.pot >= g.bb * 25))
      ) {
        try {
          const move = await aiMove(data.settings, key, o, controller.signal);
          if (!controller.signal.aborted) commit(act(g, move));
        } catch {
          if (!controller.signal.aborted) {
            setToast("AI 暂不可用，本地策略已接管");
            fallback();
          }
        }
      } else fallback();
    }, data.settings.speed * (0.68 + Math.random() * 0.78));
    return () => {
      clearTimeout(id);
      controller.abort();
      worker?.terminate();
    };
  }, [g, paused, page, data.settings, key]);
  useEffect(() => {
    const background = t?.background;
    if (ready && page === "table" && t && !t.out && !t.complete && t.round < 3 && !background && g) {
      const currentTable = t.playoff?.original || g;
      const localIds = new Set(currentTable.players.map((p) => p.profile.id));
      const remaining = t.field.filter((p) => !localIds.has(p.id));
      setData((old) => old.tournament ? {
        ...old,
        tournament: { ...old.tournament, background: { remaining, qualified: [], done: remaining.length === 0 } },
      } : old);
      return;
    }
    const shouldRun = !!(
      ready && page === "table" && !paused && t && !t.out && !t.complete &&
      t.round < 3 && background && !background.done && background.remaining.length
    );
    if (!shouldRun) {
      backgroundWorker.current?.postMessage({ type: "pause" });
      return;
    }
    if (backgroundWorker.current) {
      backgroundWorker.current.postMessage({ type: "resume" });
      return;
    }
    const worker = new TournamentWorker();
    backgroundWorker.current = worker;
    worker.onmessage = (event: MessageEvent<{
      table?: {
        entrants: Character[];
        qualified: Character[];
        qualifiedStacks?: Record<string, number>;
        performance?: SimulatedTablePerformance;
      };
      progress?: number;
      total?: number;
      done?: boolean;
    }>) => {
      if (event.data.table) {
        const { entrants, qualified, qualifiedStacks, performance } = event.data.table;
        const ids = new Set(entrants.map((p) => p.id));
        setData((old) => {
          const current = old.tournament;
          if (!current?.background || current.out || current.complete) return old;
          const remaining = current.background.remaining.filter((p) => !ids.has(p.id));
          const bg = {
            ...current.background,
            remaining,
            qualified: [...current.background.qualified, ...qualified],
            done: remaining.length === 0,
          };
          const updated = applyTablePerformance(
            {
              ...old,
              tournament: {
                ...current,
                background: bg,
                stacks: { ...(current.stacks || {}), ...(qualifiedStacks || {}) },
              },
            },
            performance || { handsWon: {}, highestChips: {} },
          );
          return bg.done && current.pendingLocal
            ? startNextTournamentRound(updated, current.pendingLocal)
            : updated;
        });
        setProgress(`其他牌桌结算 · ${event.data.progress || 0} / ${event.data.total || 0} 人`);
        if (event.data.total && event.data.progress === event.data.total) {
          if (backgroundWorker.current === worker) backgroundWorker.current = null;
          worker.terminate();
          setBusy(false);
          setProgress("");
        }
      }
      if (event.data.done) {
        setData((old) => {
          const current = old.tournament;
          if (!current?.background || current.out || current.complete) return old;
          const updated: Save = {
            ...old,
            tournament: { ...current, background: { ...current.background, remaining: [], done: true } },
          };
          return current.pendingLocal
            ? startNextTournamentRound(updated, current.pendingLocal)
            : updated;
        });
        setBusy(false);
        setProgress("");
        if (backgroundWorker.current === worker) backgroundWorker.current = null;
        worker.terminate();
      }
    };
    worker.onerror = () => {
      if (backgroundWorker.current === worker) backgroundWorker.current = null;
      worker.terminate();
      setToast("其他牌桌模拟中断；回到冠军赛时会从已完成进度继续");
    };
    worker.postMessage({
      type: "start",
      field: background!.remaining,
      stacks: t?.stacks || {},
      size: 8,
      qualify: 4,
      pace: 5,
    });
  }, [ready, page, paused, t?.round, t?.out, t?.complete, t?.background?.done]);
  useEffect(() => {
    if (!ready || !t?.autoSimulating || t.simulationComplete || eliminatedWorker.current) return;
    const localIds = new Set([
      ...(g?.players || []).map((p) => p.profile.id),
      ...(t.playoff?.original.players || []).map((p) => p.profile.id),
    ]);
    const liveLocal = (g?.players || []).filter((p) => p.chips > 0 && p.profile.id !== -1).map((p) => p.profile);
    const simulatedEntrants = t.round >= 3
      ? liveLocal
      : [...t.field.filter((p) => p.id !== -1 && !localIds.has(p.id)), ...(t.playoff?.locked || []), ...liveLocal]
        .filter((p, index, all) => all.findIndex((other) => other.id === p.id) === index);
    const entrants = simulatedEntrants.length
      ? simulatedEntrants
      : t.field.filter((p) => p.id !== -1);
    const checkpoint = t.simulationCheckpoint;
    setEliminatedProgress({
      round: (checkpoint?.round ?? t.round) + 1,
      completedTables: checkpoint?.nextTableIndex ?? 0,
      totalTables: checkpoint ? Math.ceil(checkpoint.field.length / 8) : 0,
    });
    const worker = new ChampionshipWorker();
    eliminatedWorker.current = worker;
    worker.onmessage = (event: MessageEvent<{
      progress?: ChampionshipSimulationProgress;
      standings?: Character[];
      performance?: SimulationPlayerStatsMap;
      error?: string;
    }>) => {
      if (event.data.progress) {
        const status = event.data.progress;
        setProgress(`出局后快速模拟 · 第 ${status.round} 阶段`);
        setEliminatedProgress(status);
        if (status.checkpoint) {
          setData((old) => {
            const current = old.tournament;
            if (!current?.autoSimulating) return old;
            return {
              ...old,
              tournament: {
                ...current,
                simulationCheckpoint: status.checkpoint,
              },
            };
          });
        }
      }
      if (event.data.standings) {
        const past = t.round >= 3
          ? [...(t.finalEliminated || []).slice().reverse(), ...(t.topTwoOuts || [])]
          : [];
        const fullOrder = [...event.data.standings, ...past]
          .filter((p, index, all) => all.findIndex((other) => other.id === p.id) === index);
        const record = createChampionshipRecord(
          fullOrder,
          "played",
          t.entrants || t.field.length,
          data.activeMatch?.difficulty ?? data.settings.difficulty,
        );
        setData((old) => {
          const current = old.tournament;
          if (!current?.autoSimulating) return old;
          let updated: Save = {
            ...old,
            tournament: {
              ...current,
              complete: true,
              finalStandings: record.standings.map(({ player }) => player),
              autoSimulating: false,
              simulationComplete: true,
              simulationCheckpoint: undefined,
              background: current.background ? { ...current.background, remaining: [], done: true } : undefined,
              results: [...current.results, "你已出局 · 冠军赛模拟完成"],
            },
            tournamentRecords: [record, ...old.tournamentRecords],
          };
          updated = applySimulationPerformance(updated, event.data.performance || {});
          return recordPlacements(updated, fullOrder);
        });
        setToast(`${record.standings[0]?.player.name || "选手"} 赢得本届冠军，赛事记录已保存`);
        setBusy(false);
        setProgress("");
        setEliminatedProgress(null);
        if (eliminatedWorker.current === worker) eliminatedWorker.current = null;
        worker.terminate();
      }
      if (event.data.error) {
        setToast(`冠军赛自动模拟失败：${event.data.error}`);
        if (eliminatedWorker.current === worker) eliminatedWorker.current = null;
        worker.terminate();
      }
    };
    worker.onerror = () => {
      setToast("冠军赛自动模拟中断，重新打开冠军赛后可重试");
      if (eliminatedWorker.current === worker) eliminatedWorker.current = null;
      worker.terminate();
    };
    worker.postMessage({
      entrants,
      pace: 5,
      startingRound: t.round,
      checkpoint,
      startingBestPlace: t.field.length,
    });
    setBusy(true);
  }, [ready, page, t?.autoSimulating, t?.simulationComplete, t?.round, g?.hand, data.activeMatch?.difficulty, data.settings.difficulty]);
  useEffect(() => {
    if (g && !g.done) setRaise(legal(g).min);
  }, [g?.turn, g?.current, g?.hand]);
  const profile = (p: Character) => data.overrides[p.id] || p;
  const start = () => {
    generation.current++;
    flushTableTimer();
    if (newMode === "cash" && data.tournament?.autoSimulating) {
      eliminatedWorker.current?.terminate();
      eliminatedWorker.current = null;
    }
    playGameSound("deal", data.settings.sound);
    const roster = makeTournamentRoster(characters, data.overrides, data.settings.difficulty);
    const game = newGame([
      userPlayer,
      ...roster.slice(0, newMode === "cash" ? seatCount - 1 : 7),
    ]);
    const tournament: Tournament | null =
      newMode === "tournament"
        ? {
          round: 0,
          field: [userPlayer, ...roster],
          stacks: Object.fromEntries([
            userPlayer,
            ...roster,
          ].map((player) => [String(player.id), 10000])),
          resetStacksEachRound: resetTournamentStacks,
          background: { remaining: roster.slice(7), qualified: [], done: false },
          entrants: roster.length + 1,
          seed: Date.now(),
          pace: data.settings.pace,
          out: false,
          paused: false,
          autoSimulating: false,
          simulationComplete: false,
          complete: false,
          results: [],
        }
        : null;
    const entrants = tournament ? [userPlayer, ...roster] : game.players.map((player) => player.profile);
    const matchConfig = {
      entrants: tournament?.entrants ?? game.players.length,
      difficulty: data.settings.difficulty,
    };
    const currentMatch = data.activeMatch || (data.game
      ? createMatchSession(data.tournament ? "championship" : "cash", matchConfig)
      : undefined);
    const newMatch = createMatchSession(newMode === "tournament" ? "championship" : "cash", matchConfig);
    const pausedTournament = newMode === "cash" && data.tournament && data.game && !data.tournament.complete
      ? {
        game: data.game,
        tournament: { ...data.tournament, paused: true },
        ...(currentMatch ? { match: currentMatch } : {}),
      }
      : newMode === "tournament" ? undefined : data.pausedTournament;
    setData((d) => {
      const registered = registerMatches(d, entrants, tournament ? entrants.length : 0, !!tournament);
      return {
        ...registered,
        game,
        tournament,
        activeMatch: newMatch,
        chipAnimation: undefined,
        pausedTournament,
        stats: {
          ...registered.stats,
          tournaments: registered.stats.tournaments + (tournament ? 1 : 0),
        },
      };
    });
    setPaused(false);
    setPage("table");
    setModal(null);
    setSaveError(false);
    if (newMode === "cash") {
      setCashEliminated([]);
      setCashMatchResult(undefined);
    }
  };
  const finishCashMatch = () => {
    if (!g || !cashMatchFinished) return;
    if (fireworksTimer.current) {
      window.clearTimeout(fireworksTimer.current);
      fireworksTimer.current = null;
    }
    setShowFireworks(false);
    const eliminated = [...cashEliminated];
    const recordedIds = new Set(eliminated.map((player) => player.id));
    g.players
      .filter((player) => player.chips === 0 && !recordedIds.has(player.profile.id))
      .forEach((player) => eliminated.push(player.profile));
    setCashMatchResult(createCashMatchResult(g, eliminated));
    resetTableTimer();
    setData((old) => {
      return {
        ...old,
        game: null,
        activeMatch: undefined,
      };
    });
    setPage("cashResults");
  };
  const nextHand = () => {
    if (!g) return;
    const alive = g.players.filter((p) => p.chips > 0);
    const target = t
      ? (t.playoff?.slots ?? (t.round < 3 ? 4 : [6, 4, 2, 1][t.round - 3]))
      : 1;
    if (t && alive.length <= target) {
      advanceTournament();
      return;
    }
    if (g.players[0].chips === 0) {
      setToast(t ? "你已出局，冠军赛将快速模拟至产生冠军" : "你已出局，可返回大厅开始新比赛");
      if (t) setData((d) => d.tournament ? ({ ...d, tournament: { ...d.tournament, out: true, autoSimulating: true, simulationComplete: false, simulationCheckpoint: undefined } }) : d);
      return;
    }
    playGameSound("deal", data.settings.sound);
    commit(
      startHand(
        g,
        t
          ? Math.min(102400, 100 * 2 ** Math.floor(g.hand / (t?.pace || 10)))
          : Math.min(102400, 100 * 2 ** Math.floor(g.hand / data.settings.pace)),
      ),
    );
  };
  const advanceTournament = () => {
    if (!g || !t) return;
    const alivePlayers = g.players.filter((p) => p.chips > 0);
    const currentGameStacks = stacksFromGame(g);
    if (t.round >= 3) {
      if (g.players[0].chips === 0) {
        setData((d) => ({
          ...d,
          tournament: d.tournament
            ? {
              ...d.tournament,
              stacks: { ...(d.tournament.stacks || {}), ...currentGameStacks },
              out: true,
              autoSimulating: true,
              simulationComplete: false,
              simulationCheckpoint: undefined,
            }
            : null,
        }));
        return;
      }
      if (alivePlayers.length === 1) {
        const finalEliminated = [...(t.finalEliminated || [])];
        const recordedIds = new Set(finalEliminated.map((player) => player.id));
        g.players
          .filter((player) => player.chips === 0 && !recordedIds.has(player.profile.id))
          .forEach((player) => {
            finalEliminated.push(player.profile);
            recordedIds.add(player.profile.id);
          });
        const actualPlacements = [
          alivePlayers[0].profile,
          ...finalEliminated.slice().reverse(),
          ...(t.topTwoOuts || []),
        ].filter((player, index, players) => players.findIndex((other) => other.id === player.id) === index);
        const record = createChampionshipRecord(
          actualPlacements,
          "played",
          t.entrants || 64,
          data.activeMatch?.difficulty ?? data.settings.difficulty,
        );
        setData((d) => {
          if (!d.tournament || d.tournament.complete) return d;
          const updated: Save = {
            ...d,
            tournament: {
              ...d.tournament,
              stacks: { ...(d.tournament.stacks || {}), ...currentGameStacks },
              round: 6,
              field: [userPlayer],
              finalStandings: actualPlacements.slice(0, 8),
              complete: true,
              simulationComplete: true,
              autoSimulating: false,
              out: false,
            },
            tournamentRecords: [record, ...d.tournamentRecords],
            stats: { ...d.stats, titles: d.stats.titles + 1 },
          };
          return recordPlacements(updated, actualPlacements);
        });
        return;
      }
      let round = t.round + 1;
      while (round < 6 && alivePlayers.length <= [6, 4, 2, 1][round - 3]) round++;
      const advancingPlayers = alivePlayers.map((player) => player.profile);
      const nextBB = Math.min(102400, 100 * 2 ** Math.floor(g.hand / t.pace));
      const nextRoundStacks = t.resetStacksEachRound
        ? Object.fromEntries(advancingPlayers.map((player) => [String(player.id), 10000]))
        : currentGameStacks;
      const advancingGamePlayers = g.players.filter((player) => player.chips > 0);
      const previousDealerId = g.players[g.dealer]?.profile.id;
      const dealer = advancingGamePlayers.findIndex((player) => player.profile.id === previousDealerId);
      const nextGame = t.resetStacksEachRound
        ? newGame(advancingPlayers, nextBB, advancingPlayers.map(() => 10000))
        : startHand({
          ...g,
          players: advancingGamePlayers,
          dealer: dealer >= 0 ? dealer : Math.max(0, advancingGamePlayers.length - 1),
        }, nextBB);
      setData((d) => {
        const nextTournament = d.tournament
          ? recordTournamentEliminations({
            ...d.tournament,
            stacks: { ...(d.tournament.stacks || {}), ...nextRoundStacks },
            round,
            field: advancingPlayers,
            results: [...d.tournament.results, `${roundLabel(t.round)} · 晋级`],
          }, nextGame)
          : null;
        return recordAdvancement({ ...d, tournament: nextTournament, game: nextGame }, advancingPlayers, counts[round] || advancingPlayers.length);
      });
      return;
    }
    if (!t.background) {
      const original = t.playoff?.original || g;
      const localIds = new Set(original.players.map((p) => p.profile.id));
      const remaining = t.field.filter((p) => !localIds.has(p.id));
      setData((d) => d.tournament ? ({
        ...d,
        tournament: {
          ...d.tournament,
          stacks: { ...(d.tournament.stacks || {}), ...currentGameStacks },
          background: { remaining, qualified: [], done: remaining.length === 0 },
        },
      }) : d);
      return;
    }
    const q = qualification(g, t.playoff?.slots ?? 4);
    const locked = [...(t.playoff?.locked || []), ...q.locked];
    const original = t.playoff?.original || g;
    const userTied = q.tied.some((p) => p.id === -1);
    if (userTied) {
      const playoffGame = newGame(
        [userPlayer, ...q.tied.filter((p) => p.id !== -1)],
        100,
      );
      setData((d) => ({
        ...d,
        tournament: d.tournament
          ? recordTournamentEliminations({
            ...d.tournament,
            stacks: { ...(d.tournament.stacks || {}), ...currentGameStacks },
            playoff: { original, locked, slots: q.slots },
          }, playoffGame)
          : null,
        game: playoffGame,
      }));
      setToast("晋级边界出现同筹码平局，进入附加赛");
      return;
    }
    if (!locked.some((p) => p.id === -1)) {
      setData((d) => ({
        ...d,
        tournament: d.tournament
          ? {
            ...d.tournament,
            stacks: { ...(d.tournament.stacks || {}), ...currentGameStacks },
            out: true,
            autoSimulating: true,
            simulationComplete: false,
            simulationCheckpoint: undefined,
          }
          : null,
      }));
      return;
    }
    const queueLocalAdvancers = (
      localQualified: Character[],
      qualifiedStacks: Record<string, number> = {},
    ) => {
      const localStacks = { ...currentGameStacks, ...qualifiedStacks };
      if (t.background?.done) {
        setBusy(false);
        setProgress("");
        setData((d) => startNextTournamentRound({
          ...d,
          tournament: d.tournament
            ? { ...d.tournament, stacks: { ...(d.tournament.stacks || {}), ...localStacks } }
            : null,
        }, localQualified));
        return;
      }
      setBusy(true);
      setProgress("本桌已晋级，等待其他牌桌结束…");
      setData((d) => {
        const current = d.tournament;
        if (!current) return d;
        return {
          ...d,
          tournament: {
            ...current,
            stacks: { ...(current.stacks || {}), ...localStacks },
            pendingLocal: localQualified,
          },
        };
      });
    };
    if (q.tied.length) {
      const worker = new TournamentWorker();
      worker.onmessage = (event: MessageEvent<{
        tieQualified?: Character[];
        qualifiedStacks?: Record<string, number>;
        performance?: SimulatedTablePerformance;
      }>) => {
        if (event.data.performance) setData((d) => applyTablePerformance(d, event.data.performance!));
        if (event.data.tieQualified) {
          queueLocalAdvancers([...locked, ...event.data.tieQualified], event.data.qualifiedStacks);
        }
        worker.terminate();
      };
      worker.onerror = () => { worker.terminate(); setToast("附加赛模拟失败，请重试晋级"); };
      worker.postMessage({ type: "tie", field: q.tied, slots: q.slots, pace: 5 });
      return;
    }
    queueLocalAdvancers(locked);
  };
  useEffect(() => {
    if (page === "table" && !paused && g?.done && t && !t.out && !t.complete && g.players[0]?.chips === 0) advanceTournament();
  }, [g?.done, g?.hand, g?.players[0]?.chips, t?.round, t?.out, t?.complete, t?.background?.done, page, paused]);
  const applyImportedSave = (nextSave: Save, overwroteExisting: boolean) => {
    generation.current++;
    resetTableTimer();
    const restored = ensureMatchMetadata(nextSave);
    removeTableTimer();
    setData(restored);
    setProfileNameDraft(restored.playerProfile.name);
    setProfileAvatarDraft(restored.playerProfile.avatar);
    setImported(null);
    setSaveError(false);
    setSaveLoadIssue(null);
    setPaused(true);
    setPage(restored.game ? "table" : "lobby");
    setToast(
      overwroteExisting
        ? "现有记录已覆盖，存档已恢复"
        : "存档已导入",
    );
  };
  const importFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 10_000_000) {
      setToast("存档不能超过 10 MB");
      return;
    }
    try {
      const nextSave = parseSave(JSON.parse(await f.text()));
      if (summarizeSaveRecords(data).hasExistingData) {
        setImported(nextSave);
      } else {
        applyImportedSave(nextSave, false);
      }
    } catch {
      setToast("存档格式或版本无效，现有数据未修改");
    }
    if (file.current) file.current.value = "";
  };
  const openNew = (mode: "cash" | "tournament") => {
    setNewMode(mode);
    setModal("new");
  };
  const enterCashMatch = () => {
    const hasActiveCashMatch = Boolean(
      data.game && !data.tournament && (!data.activeMatch || data.activeMatch.mode === "cash"),
    );
    if (hasActiveCashMatch) {
      setPaused(false);
      setPage("table");
      return;
    }
    openNew("cash");
  };
  const openModeDetails = (mode: "cash" | "tournament") => {
    setModal(mode === "cash" ? "cash-details" : "tournament-details");
  };
  const openRules = () => {
    if (page === "table" && !paused) {
      rulesPausedByModal.current = true;
      setPaused(true);
      if (t) setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: true } } : old);
    }
    setModal("rules");
  };
  const closeModal = () => {
    if (rulesPausedByModal.current) {
      rulesPausedByModal.current = false;
      setPaused(false);
      setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: false } } : old);
    }
    setModal(null);
  };
  openPlayerProfileState.current = { page, paused, t };
  const openPlayerProfile = useCallback((raw: Character, onlyStats = false) => {
    const { page: curPage, paused: curPaused, t: curT } = openPlayerProfileState.current;
    if (curPage === "table" && !curPaused) {
      selectedPausedByModal.current = true;
      setPaused(true);
      if (curT) setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: true } } : old);
    }
    setStatsOnly(onlyStats);
    setSelected(raw);
    setPreview(null);
  }, []);
  const selectLeaderboardPlayer = useCallback(
    (id: number) => {
      const raw = id === -1 ? userPlayerRef.current : characters.find((c) => c.id === id);
      if (!raw) return;
      openPlayerProfile(raw);
    },
    [openPlayerProfile, characters],
  );
  const closePlayerProfile = () => {
    if (selectedPausedByModal.current) {
      selectedPausedByModal.current = false;
      setPaused(false);
      setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: false } } : old);
    }
    setSelected(null);
    setPreview(null);
    setStatsOnly(false);
  };
  const enterChampionship = () => {
    if (data.pausedTournament) {
      const suspended = data.pausedTournament;
      const resumedMatch = suspended.match || createMatchSession("championship");
      setData((old) => ({
        ...old,
        game: suspended.game,
        tournament: {
          ...suspended.tournament,
          paused: false,
          autoSimulating:
            suspended.tournament.out && !suspended.tournament.simulationComplete
              ? true
              : suspended.tournament.autoSimulating,
        },
        activeMatch: resumedMatch,
        pausedTournament: undefined,
      }));
      if (suspended.tournament.out && !suspended.tournament.simulationComplete) {
        setPage("tournament");
      } else if (suspended.tournament.complete) {
        setPage("tournament");
      } else {
        setPaused(false);
        setPage("table");
      }
      return;
    }
    if (t?.out && !t.simulationComplete) {
      setData((old) => old.tournament
        ? { ...old, tournament: { ...old.tournament, autoSimulating: true } }
        : old);
      setPage("tournament");
      return;
    }
    if (t && !t.complete && !t.out) {
      if (!g) {
        openNew("tournament");
        return;
      }
      setPaused(false);
      setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: false } } : old);
      setPage("table");
      return;
    }
    if (t?.complete) {
      setPage("tournament");
      return;
    }
    openNew("tournament");
  };
  const updateSettings = (patch: Partial<Save["settings"]>) =>
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch, ...(typeof patch.sound === "boolean" ? { soundConfigured: true } : {}) } }));
  const profileName = profileNameDraft.trim().slice(0, 24) || "本地玩家";
  const profileChanged =
    profileName !== data.playerProfile.name ||
    profileAvatarDraft !== data.playerProfile.avatar;
  const saveProfile = async () => {
    const nextSave = renameLocalPlayer(
      {
        ...data,
        playerProfile: { ...data.playerProfile, avatar: profileAvatarDraft },
      },
      profileName,
    );
    setProfileSaving(true);
    try {
      await saveData(nextSave);
      setData(nextSave);
      setProfileNameDraft(profileName);
      setSaveError(false);
      setToast("个人资料已保存");
    } catch (error) {
      if (isSaveConflictError(error)) {
        markSaveStale();
        return;
      }
      if (isSaveValidationError(error)) {
        setSaveError(true);
        setToast(error.message);
        return;
      }
      setSaveError(true);
      setToast("个人资料保存失败，请导出存档备份后重试");
    } finally {
      setProfileSaving(false);
    }
  };
  const resetAllData = async () => {
    setResetting(true);
    try {
      await saveData(blank);
      resetTableTimer();
      removeTableTimer();
      setData(blank);
      setProfileNameDraft(blank.playerProfile.name);
      setProfileAvatarDraft(blank.playerProfile.avatar);
      setKey("");
      setBatchResults([]);
      setBatchOpen(false);
      setCashEliminated([]);
      setCashMatchResult(undefined);
      setSelected(null);
      setPreview(null);
      setImported(null);
      setModal(null);
      setConfirmDialog(null);
      setPaused(false);
      setSaveError(false);
      setSaveStale(false);
      setResetConfirmOpen(false);
      setPage("lobby");
      setToast("所有数据已重置");
    } catch (error) {
      if (isSaveConflictError(error)) {
        setResetConfirmOpen(false);
        markSaveStale();
        return;
      }
      if (isSaveValidationError(error)) {
        setSaveError(true);
        setToast(error.message);
        return;
      }
      setSaveError(true);
      setToast("重置失败，请先导出存档备份后重试");
    } finally {
      setResetting(false);
    }
  };
  const active = g && !g.done && g.turn === 0 && !paused;
  const limits = g && !g.done ? legal(g) : null;
  const presetValue = (preset: number | { fraction: number }) => {
    if (!g || !limits) return 0;
    const target =
      typeof preset === "number"
        ? preset
        : g.current + Math.round((pot(g) + limits.toCall) * preset.fraction);
    return Math.max(limits.min, Math.min(limits.max, target));
  };
  const submitRaise = () => {
    if (!g || !limits) return;
    if (raise === limits.max) {
      setConfirmDialog({
        title: "确认全下？",
        message: `将把剩余的 ${g.players[0].chips.toLocaleString()} 筹码全部投入本手，一旦确认无法撤回。`,
        confirmLabel: "确认全下",
        onConfirm: () => commit(act(g, { type: "raise", amount: raise })),
      });
      return;
    }
    commit(act(g, { type: "raise", amount: raise }));
  };
  const overlayOpen = !!(modal || selected || batchOpen || imported || confirmDialog || resetConfirmOpen || saveStale || saveLoadIssue);
  useEffect(() => {
    if (!active || !g || overlayOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        commit(act(g, { type: "fold" }));
      } else if (key === "c") {
        event.preventDefault();
        commit(act(g, { type: "call" }));
      } else if (key === "r") {
        if (!limits?.canRaise) return;
        event.preventDefault();
        submitRaise();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, g, overlayOpen, limits, raise]);
  const alive = g?.players.filter((p) => p.chips > 0).length || 0;
  const threshold = t
    ? (t.playoff?.slots ?? (t.round < 3 ? 4 : [6, 4, 2, 1][t.round - 3]))
    : 1;
  const backgroundQualified = t?.background?.qualified.length || 0;
  const backgroundTotal = backgroundQualified + (t?.background?.remaining.length || 0);
  const backgroundPercent = backgroundTotal
    ? Math.min(100, Math.round((backgroundQualified / backgroundTotal) * 100))
    : 0;
  const waitingOnOtherTables = busy && !!t?.background && !t.background.done;
  const canAdvance = !!g?.done && alive <= threshold;
  const advancementTargetRound = t ? Math.min(t.round + 1, counts.length - 1) : 0;
  const advancementTargetLabel = t
    ? `${roundLabel(advancementTargetRound)} ${counts[advancementTargetRound]}强`
    : "";
  const selectedCurrent = selected ? profile(selected) : null;
  const selectedCareerStats = selectedCurrent
    ? data.playerStats[String(selectedCurrent.id)] || blankCareerStats
    : blankCareerStats;
  const selectedChampionshipsWon = selectedCurrent
    ? championshipWinCount(data.tournamentRecords, selectedCurrent.id)
    : 0;
  // Recomputing a 63-player leaderboard (map + per-player standings scan + sort)
  // on every render of this component was the source of the scroll stutter on the
  // points page: any unrelated state change anywhere in the app (timers, toasts,
  // animations) re-ran this synchronously and re-rendered all 63 rows. Memoized
  // so it only recomputes when the underlying data actually changes.
  const localPlayerName = data.playerProfile.name.trim() || "本地玩家";
  const leaderboard = useMemo(() => {
    const localPlayer: Character = { ...hero, name: localPlayerName };
    const championshipBonuses = championshipCareerBonuses(data.tournamentRecords);
    const honorsById = new Map<number, HistoricalHonors>();
    for (const record of data.tournamentRecords) {
      if (record.mode !== "played") continue;
      for (const standing of record.standings) {
        if (!standing.place || standing.place > 8) continue;
        const honors = honorsById.get(standing.player.id) || { champion: 0, runnerUp: 0, top8: 0 };
        if (standing.place === 1) honors.champion += 1;
        else if (standing.place === 2) honors.runnerUp += 1;
        else honors.top8 += 1;
        honorsById.set(standing.player.id, honors);
      }
    }
    const profiles = new Map<number, Character>();
    characters.forEach((player) => profiles.set(player.id, profile(player)));
    profiles.set(-1, localPlayer);
    return [...profiles.values()]
      .map((player) => {
        const stats = data.playerStats[String(player.id)] || blankCareerStats;
        const championship = championshipBonuses[String(player.id)];
        return {
          player,
          ...stats,
          pointsTenths: stats.pointsTenths + (championship?.pointsTenths || 0),
          bestPlace: championship?.bestPlace
            ? stats.bestPlace
              ? Math.min(stats.bestPlace, championship.bestPlace)
              : championship.bestPlace
            : stats.bestPlace,
          honors: honorsById.get(player.id) || { champion: 0, runnerUp: 0, top8: 0 },
        };
      })
      .sort((a, b) =>
        b.pointsTenths - a.pointsTenths ||
        b.handsWon - a.handsWon ||
        (a.bestPlace || Number.MAX_SAFE_INTEGER) - (b.bestPlace || Number.MAX_SAFE_INTEGER) ||
        b.matches - a.matches ||
        a.player.name.localeCompare(b.player.name),
      );
  }, [characters, data.playerStats, data.tournamentRecords, data.overrides, localPlayerName]);
  const localRank = leaderboard.findIndex((row) => row.player.id === -1) + 1;
  useEffect(() => {
    if (page !== "leaderboard" || !ready) return;
    const frame = requestAnimationFrame(() => {
      localLeaderboardRow.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [page, ready]);
  const tableRoundLabel = t
    ? t.playoff
      ? `${roundLabel(t.round)} · 附加赛`
      : roundLabel(t.round)
    : "单次赛";
  const playerDirectoryContent = (
    <PlayersPage
      characters={characters}
      levels={levels}
      profile={profile}
      onOpenPlayerProfile={openPlayerProfile}
      onOpenBatch={() => setBatchOpen(true)}
      renderAvatar={(player) => <Avatar p={player} />}
    />
  );
  const aiSettingsContent = (
    <>
      <div className="settings-form">
        <label>
          行动速度
          <select
            value={data.settings.speed}
            onChange={(e) => updateSettings({ speed: +e.target.value })}
          >
            <option value={1500}>从容 · 1.5 秒</option>
            <option value={1000}>标准 · 1 秒</option>
            <option value={200}>快速 · 0.2 秒</option>
          </select>
        </label>
        <label>
          AI 对局决策
          <select
            value={data.settings.mode}
            onChange={(e) =>
              updateSettings({
                mode: e.target.value as Save["settings"]["mode"],
              })
            }
          >
            <option value="local">本地策略 · 完全离线</option>
            <option value="key">AI 增强 · 关键行动</option>
            <option value="all">AI 增强 · 每次行动</option>
          </select>
        </label>
        <div className="settings-wide provider-picker">
          <div className="provider-picker-heading">
            <span>快速配置模型</span>
            <small>选择服务商后自动填写接口地址和推荐模型，可继续手动修改。</small>
          </div>
          <div className="provider-picker-grid" role="group" aria-label="快速配置模型服务商">
            {aiProviderPresets.map((provider) => {
              const selected =
                data.settings.endpoint === provider.endpoint &&
                data.settings.model === provider.model;
              return (
                <button
                  key={provider.name}
                  type="button"
                  className={`provider-preset ${selected ? "active" : ""}`}
                  aria-pressed={selected}
                  onClick={() =>
                    updateSettings({
                      endpoint: provider.endpoint,
                      model: provider.model,
                    })
                  }
                >
                  <span>{provider.name}</span>
                  <small>{provider.model}</small>
                </button>
              );
            })}
          </div>
        </div>
        <label className="settings-wide">
          兼容接口地址
          <input
            value={data.settings.endpoint}
            placeholder="https://your-provider.example/v1"
            onChange={(e) => updateSettings({ endpoint: e.target.value })}
          />
        </label>
        <label>
          模型名称
          <input
            value={data.settings.model}
            placeholder="填写服务商的模型 ID"
            onChange={(e) => updateSettings({ model: e.target.value })}
          />
        </label>
        <label>
          API 密钥
          <input
            type="password"
            autoComplete="off"
            value={key}
            placeholder="仅保留在本次页面内存，不导出"
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <div className="settings-actions settings-wide">
          <div className="notice">
            人物塑造和对局决策独立使用。浏览器直连要求服务支持跨域；失败时自动回退本地策略。
          </div>
          <div className="settings-action-buttons">
            <button
              type="button"
              className="settings-save-button"
              onClick={() => setToast("AI 设置已保存")}
            >
              <Check size={15} /> 保存设置
            </button>
            <button
              className="gold-button settings-test-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await requestAI(data.settings, key, '返回 {"ok":true}');
                  setToast("AI 连接成功");
                } catch (e) {
                  setToast(e instanceof Error ? e.message : "连接失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "正在连接…" : "测试 AI 连接"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
  const profileSettingsContent = (
    <>
      <form
        className="profile-settings"
        onSubmit={(event) => {
          event.preventDefault();
          void saveProfile();
        }}
      >
        <div className="profile-avatar-editor">
          <div className="hero-avatar profile-avatar-large">
            {profileAvatarDraft
              ? <img src={profileAvatarDraft} alt={`${profileName}头像`} />
              : "♠"}
          </div>
          <div className="profile-avatar-actions">
            <strong>头像</strong>
            <p className="muted">选择图片后会自动裁切为正方形。</p>
            <div>
              <button type="button" onClick={() => avatarFile.current?.click()}>
                <Upload size={15} /> 更换头像
              </button>
              {profileAvatarDraft ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setProfileAvatarDraft(null)}
                >
                  恢复默认
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <label className="profile-name-field">
          显示名称
          <input
            value={profileNameDraft}
            maxLength={24}
            placeholder="本地玩家"
            onChange={(event) => {
              setProfileNameDraft(event.target.value.slice(0, 24));
            }}
          />
        </label>
        <input
          ref={avatarFile}
          className="profile-file-input"
          type="file"
          accept="image/*"
          aria-label="选择头像图片"
          onChange={async (event) => {
            const selectedFile = event.target.files?.[0];
            event.target.value = "";
            if (!selectedFile) return;
            try {
              const avatar = await prepareAvatar(selectedFile);
              setProfileAvatarDraft(avatar);
              setToast("头像已选择，点击保存资料后生效");
            } catch (error) {
              setToast(error instanceof Error ? error.message : "头像处理失败");
            }
          }}
        />
        <div className="profile-save-actions">
          <span>{profileChanged ? "有尚未保存的修改" : "资料已是最新"}</span>
          <button
            className="gold-button"
            type="submit"
            disabled={!profileChanged || profileSaving}
          >
            <Check size={15} /> {profileSaving ? "正在保存…" : "保存资料"}
          </button>
        </div>
      </form>
    </>
  );
  const infoSettingsContent = (
    <section className="info-settings" aria-labelledby="info-settings-title">
      <div className="settings-section-heading">
        <h1 id="info-settings-title">关于</h1>
        <p className="muted">了解游戏版本、存档保存位置、读取时机和备份方式。</p>
      </div>
      <div className="info-settings-highlight" role="note">
        <span className="info-settings-highlight-mark"><Check size={18} /></span>
        <div>
          <strong>随时退出，随时关闭！实时保存！</strong>
          <span>不用担心中断牌局，重新打开游戏后会自动恢复进度。</span>
        </div>
      </div>
      <div className="info-settings-grid">
        <article className="info-settings-card info-settings-card-wide info-settings-card-meta">
          <div className="info-settings-card-heading">
            <span className="info-settings-icon"><Info size={17} /></span>
            <div>
              <h2>应用信息</h2>
            </div>
          </div>
          <p>当前运行的游戏使用以下构建信息。</p>
          <dl className="info-settings-list">
            <div>
              <dt>当前版本</dt>
              <dd>v{appMetadata.version}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{formatAppUpdatedAt(appMetadata.updatedAt)}</dd>
            </div>
          </dl>
        </article>
        {vscodeEnvironment ? (
          <article className="info-settings-card info-settings-card-wide info-settings-card-primary">
            <div className="info-settings-card-heading">
              <span className="info-settings-icon"><Info size={17} /></span>
              <div>
                <h2>VS Code 扩展存档</h2>
              </div>
            </div>
            <p>
              保存前会先校验完整存档；校验失败时不会覆盖已有存档。通过校验后，游戏会快速保存到本地，并在后台备份为多个分片 JSON 文件。存档只保存在本地，不会自动上传到云端。
            </p>
            <dl className="info-settings-list">
              <div>
                <dt>文件结构</dt>
                <dd><code>manifest + profile/active/history/characters + snapshots.json</code></dd>
              </div>
              <div>
                <dt>旧版本</dt>
                <dd>有新保存时约每 5 分钟记录一个，最多保留 5 个整档旧版本，发现当前档损坏时自动回退并提示。</dd>
              </div>
              <div>
                <dt>应用更新</dt>
                <dd>检测到应用版本变化时，会先保存一份完整旧存档，再使用新版本读取和保存。</dd>
              </div>
              <div>
                <dt>旧格式兼容</dt>
                <dd>支持读取旧版 river-save 存档，首次读取后自动迁移，不删除原数据。</dd>
              </div>
              <div>
                <dt>读取时机</dt>
                <dd>打开或重新加载游戏时，自动恢复较新的存档。</dd>
              </div>
            </dl>
            <div className="notice info-settings-note">
              JSON 备份会在游戏操作停止约 0.75 秒后写入，不会阻塞牌局操作。分片写入完成后才更新 manifest；没有打开工作区时，会保存到扩展专属目录。
            </div>
          </article>
        ) : null}
        <article className="info-settings-card info-settings-card-wide">
          <div className="info-settings-card-heading">
            <span className="info-settings-icon info-settings-icon-muted"><Upload size={17} /></span>
            <div>
              <h2>下载存档，上传恢复</h2>
            </div>
          </div>
          <p>
            你可以随时导出一份 JSON 存档，也可以在另一台设备导入它来继续游戏。
            完全离线，不联网
          </p>
          <div className="info-settings-transfer">
            <span><Download size={14} /> 导出最新存档</span>
            <span><Upload size={14} /> 导入并恢复进度</span>
          </div>
          <div className="info-settings-browser-actions">
            支持跨端使用：只要在不同设备之间保持同一份最新存档文件，并在切换设备时导入即可。不同设备之间不会自动同步。
          </div>
        </article>
        <section className="reset-settings" aria-labelledby="reset-settings-title">
          <div className="reset-danger-panel">
            <h2>重置所有数据</h2>
            <p>
              此操作会删除当前环境中的全部游戏进度和个性化内容，无法撤销。头像文件和应用资源不会受到影响。
            </p>
            <div className="reset-data-summary" aria-label="当前存档摘要">
              <span>手数 <strong>{currentSaveSummary.hands.toLocaleString()}</strong></span>
              <span>冠军赛 <strong>{currentSaveSummary.championships.toLocaleString()}</strong></span>
              <span>选手战绩 <strong>{currentSaveSummary.playerRecords.toLocaleString()}</strong></span>
            </div>
            <button
              type="button"
              className="reset-button"
              disabled={resetting}
              onClick={() => setResetConfirmOpen(true)}
            >
              <RotateCcw size={15} /> {resetting ? "正在重置…" : "重置应用"}
            </button>
          </div>
        </section>
      </div>
    </section>
  );
  const displayedBoard = g && showAllCommunityCards ? previewBoard(g) : g?.board ?? [];
  const tableSeatPositions = g
    ? getTableSeatPositions(g.players.length, tableStageSize, tableSeatSize)
    : [];
  return (
    <div className={`app ${page === "table" ? "immersive" : ""} ${page === "lobby" ? "home-screen" : ""}`}>
      <aside className="sidebar">
        <a
          className="brand"
          href={pathForPage("lobby")}
          onClick={(e) => {
            e.preventDefault();
            if (page === "table") {
              setPaused(true);
              if (t) setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: true } } : old);
            }
            setPage("lobby");
          }}
        >
          <span className="brand-mark">♠</span>
          <span>
            摸鱼德州<small>摸 鱼 时 间 到</small>
          </span>
        </a>
        <div className="side-label">THE POKER ROOM</div>

        {moreMenuOpen ? (
          <div className="more-menu-backdrop" onMouseDown={() => setMoreMenuOpen(false)} />
        ) : null}
        <div className={`header-right nav-tools${moreMenuOpen ? " open" : ""}`}>
          <div className="nav-tools-actions">
            <span className="save-status">
              <i className="live-dot" />
              {saveError ? "存档待备份" : "本地自动保存"}
            </span>
            <button
              className="icon-btn"
              aria-label="导出存档"
              title="导出存档"
              onClick={() => {
                exportCurrentSave();
                setMoreMenuOpen(false);
              }}
            >
              <Download size={17} />
              <span className="tool-label">导出存档</span>
            </button>
            <button
              className="icon-btn"
              aria-label="导入存档"
              title="导入存档"
              onClick={() => {
                file.current?.click();
                setMoreMenuOpen(false);
              }}
            >
              <Upload size={17} />
              <span className="tool-label">导入存档</span>
            </button>
            <button
              className={`settings-btn ${page === "settings" ? "active" : ""}`}
              aria-label="设置"
              title="设置"
              onClick={() => {
                if (page === "table") {
                  setPaused(true);
                  if (t) setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: true } } : old);
                }
                setSettingsSection("ai");
                setPage("settings");
                setMoreMenuOpen(false);
              }}
            >
              <Settings2 size={18} />
              设置
            </button>
          </div>
          <button
            className={`leaderboard-nav-button ${page === "leaderboard" ? "active" : ""}`}
            aria-label="积分榜"
            title="积分榜"
            onClick={() => {
              if (page === "table") {
                setPaused(true);
                if (t) setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: true } } : old);
              }
              const wasLeaderboard = page === "leaderboard";
              setPage("leaderboard");
              if (wasLeaderboard) {
                requestAnimationFrame(() => {
                  localLeaderboardRow.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                });
              }
            }}
          >
            <Medal size={18} />
            积分榜
          </button>
          <button
            className="rules-btn"
            aria-label="德州规则"
            title="德州规则"
            onClick={openRules}
          >
            <BookOpen size={18} />
            <span className="btn-label-full">德州规则</span>
            <span className="btn-label-short">德州规则</span>
          </button>
          <button
            className={`more-btn ${moreMenuOpen ? "active" : ""}`}
            aria-label="更多"
            title="更多"
            aria-haspopup="true"
            aria-expanded={moreMenuOpen}
            onClick={() => setMoreMenuOpen((v) => !v)}
          >
            <MoreHorizontal size={18} />
            更多
          </button>
        </div>
      </aside>
      <main>
        {!ready ? (
          <div className="loading">正在布置你的扑克室…</div>
        ) : page === "lobby" ? (
          <LobbyPage
            tournament={t}
            pausedTournament={data.pausedTournament}
            roundLabel={roundLabel}
            hasActiveCashMatch={Boolean(
              data.game && !data.tournament && (!data.activeMatch || data.activeMatch.mode === "cash"),
            )}
            onModeDetails={openModeDetails}
            onEnterCash={enterCashMatch}
            onEnterChampionship={enterChampionship}
          />
        ) : page === "table" ? (
          g ? (
            <TablePage>
              <div className="table-heading">
                <div className="table-heading-title table-heading-left">
                  <button
                    className="exit-table-button"
                    title="退出牌桌，牌局已自动保存"
                    onClick={() => {
                      setPaused(true);
                      if (t) setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: true } } : old);
                      setPage("lobby");
                    }}
                  >
                    <ArrowLeft size={16} />
                    <span>退出牌桌</span>
                  </button>
                  <span className="table-timer" title="本局用时">
                    <Clock size={13} />
                    {formatTableDuration(tableSeconds)}
                  </span>
                </div>
                <div className="table-tools">
                  <span>
                    盲注{" "}
                    <b>
                      {g.bb / 2} / {g.bb}
                    </b>
                  </span>
                  <button
                    className="icon-btn"
                    aria-label={paused ? "继续" : "暂停"}
                    onClick={() => {
                      const nextPaused = !paused;
                      setPaused(nextPaused);
                      if (t) setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: nextPaused } } : old);
                    }}
                  >
                    {paused ? <Play size={18} /> : <Pause size={18} />}
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="切换音效"
                    onClick={() =>
                      updateSettings({ sound: !data.settings.sound })
                    }
                  >
                    {data.settings.sound ? (
                      <Volume2 size={18} />
                    ) : (
                      <VolumeX size={18} />
                    )}
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="德州规则"
                    title="德州规则"
                    onClick={openRules}
                  >
                    <BookOpen size={18} />
                  </button>
                </div>
              </div>
              <div
                className="table-stage"
                ref={tableStageRef}
                style={{ visibility: tableLayoutReady ? "visible" : "hidden" }}
              >
                <div className="table-context-watermark">
                  <strong>{tableRoundLabel}</strong>
                  <span>第 {g.hand} 手</span>
                </div>
                {tableLayoutReady ? (
                  <Table3D
                    potValue={pot(g)}
                    chipUnit={g.bb}
                    hand={g.hand}
                    playerTotals={tablePlayerTotals}
                    playerIds={tablePlayerIds}
                    playerCardPositions={seatCardPositions}
                    chipAnimation={data.chipAnimation ?? null}
                    onChipAnimationStart={markChipAnimationStarted}
                    done={g.done}
                    winnerIndices={g.winners}
                    playerCount={g.players.length}
                    chipToss={chipToss}
                  />
                ) : null}
                <div className="community">
                  <div className="pot-label">
                    {g.done ? "已派奖" : "底池总额"}{" "}
                    <b>{pot(g).toLocaleString()}</b>
                  </div>
                  <div className="board-cards">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Card
                        key={`${g.hand}-${i}-${displayedBoard[i]}`}
                        value={displayedBoard[i]}
                        back={displayedBoard[i] === undefined}
                        className={showAllCommunityCards ? "board-card-preview" : g.board[i] === undefined ? "board-card-deal" : "board-card-reveal"}
                        style={{ animationDelay: showAllCommunityCards || g.board[i] === undefined ? `${i * 90}ms` : "0ms" }}
                        highlight={
                          (g.done &&
                            g.winners.some((w) =>
                              evaluate([
                                ...g.players[w].cards,
                                ...g.board,
                              ]).best.includes(g.board[i]),
                            )) ||
                          (!g.done && localBest.includes(g.board[i]))
                        }
                      />
                    ))}
                  </div>
                </div>
                {g.players.map((p, i) => {
                  const seatPosition = tableSeatPositions[i];
                  const show =
                    p.profile.id === -1 ||
                    (g.done && !p.folded && g.board.length === 5);
                  const actionType = p.last.includes("弃牌")
                    ? "fold"
                    : p.last.includes("全下")
                      ? "allin"
                      : p.last.includes("加注")
                        ? "raise"
                        : p.last.includes("跟注")
                          ? "call"
                          : p.last.includes("过牌")
                            ? "check"
                            : "blind";
                  const actionAmount = p.last.match(/^(加注|跟注)\s([\d,]+)/);
                  const actionText = actionAmount
                    ? `${actionAmount[1] === "加注" ? "加注至" : "跟注"} ${Number(actionAmount[2].replaceAll(",", "")).toLocaleString()}`
                    : p.last;
                  const seatTitle = championshipTitle(data.tournamentRecords, p.profile.id);
                  const seatTitleLabel = seatTitle === "champion" ? "冠军" : seatTitle === "runner-up" ? "亚军" : "季军";
                  return (
                    <div
                      key={p.profile.id}
                      className={`seat ${i === 0 ? "you" : ""} ${!g.done && g.turn === i ? "acting" : ""} ${p.folded ? "folded" : ""} ${g.winners.includes(i) && g.done ? "winner" : ""} ${p.last ? `action-${actionType}` : ""}`}
                      style={seatPosition}
                      onClick={() => {
                        const raw =
                          p.profile.id === -1
                            ? userPlayer
                            : characters.find((c) => c.id === p.profile.id);
                        if (!raw) return;
                        openPlayerProfile(raw, true);
                      }}
                    >
                      <div
                        className="seat-cards"
                        ref={(element) => {
                          seatCardRefs.current[i] = element;
                        }}
                      >
                        {p.cards.map((c, j) => (
                          <Card
                            key={j}
                            value={show ? c : undefined}
                            back={!show}
                            small
                            highlight={
                              i === 0 && !g.done && localBest.includes(c)
                            }
                          />
                        ))}
                      </div>
                      {p.last ? <div className={`seat-action-callout ${actionType} ${lastAction?.player === p.profile.id ? "new-action" : ""}`} key={`${g.hand}-${p.profile.id}-${p.last}`}><b>{actionText}</b>{["raise", "allin", "call"].includes(actionType) ? <span className="action-chips"><i /><i /><i /></span> : null}</div> : null}
                      {g.done && g.winners.includes(i) ? <div className="winner-chip-stack arrive" key={`${g.hand}-${p.profile.id}-${g.result}`} aria-label={`${p.profile.name} 获得筹码`}><span /><span /><span /><span /><b>+{Math.max(0, p.chips - p.start + p.total).toLocaleString()}</b></div> : null}
                      {g.done && !celebrationDone && g.winners.includes(i) ? (
                        <span className="winner-confetti" aria-hidden="true">
                          {winnerPetals.map((petal, index) => (
                            <i
                              className={"winner-confetti-piece " + (index % 4 === 0 ? "confetti-round" : "")}
                              key={`${g.hand}-${p.profile.id}-petal-${index}`}
                              style={{
                                "--burst-x": `${petal.x}px`,
                                "--burst-y": `${petal.y}px`,
                                "--burst-drift": petal.drift,
                                "--burst-twist": petal.twist,
                                "--petal-color": petal.color,
                                "--petal-delay": `${(index % 5) * 55}ms`,
                              } as CSSProperties}
                            />
                          ))}
                        </span>
                      ) : null}
                      <div className="seat-info">
                        <Avatar
                          p={p.profile}
                          playerAvatar={data.playerProfile.avatar}
                          className={seatTitle ? `seat-avatar-title seat-avatar-${seatTitle}` : undefined}
                        />
                        {seatTitle ? (
                          <i className={`seat-title-badge seat-title-${seatTitle}`} aria-label={seatTitleLabel} title={seatTitleLabel}>
                            {seatTitle === "champion" ? <Crown size={9} /> : <Medal size={9} />}
                          </i>
                        ) : null}
                        <div>
                          <strong>
                            {p.profile.name}
                            {g.dealer === i ? <i className="dealer">D</i> : null}
                          </strong>
                          <b>{p.chips.toLocaleString()}</b>
                        </div>
                      </div>
                      {!g.done && i === 0 && !p.folded ? (
                        <div className="seat-action current-hand-action" aria-live="polite">
                          <span className="current-hand-hint">
                            <span>当前牌型</span>
                            <b>{localHandName}</b>
                          </span>
                        </div>
                      ) : !p.last && !g.done && g.turn === i ? (
                        <div className="seat-action">
                          <span className="thinking">
                            正在思考
                            <span
                              className="thinking-bar"
                              style={
                                {
                                  "--think-ms": `${Math.round(data.settings.speed * 1.07)}ms`,
                                } as CSSProperties
                              }
                            />
                          </span>
                        </div>
                      ) : null}
                      {g.done && show && g.board.length === 5 ? (
                        <small className="hand-name">
                          {evaluate([...p.cards, ...g.board]).name}
                        </small>
                      ) : null}
                    </div>
                  );
                })}
                {g.done && g.winners.length && !celebrationDone ? <><div className="victory-flash" /><div className="winner-banner"><small>{g.winners.length > 1 ? "底池平分" : "底池归属"}</small><strong>{g.winners.map(i => g.players[i].profile.name).join(" & ")}{g.winners.length === 1 ? " 赢下底池" : ""}</strong><span>{g.winners.map(i => Math.max(0, g.players[i].chips - g.players[i].start + g.players[i].total).toLocaleString()).join(" / ")} 筹码到账</span></div></> : null}
                {paused ? (
                  <div className="pause-overlay">
                    <Pause size={26} />
                    <h3>牌局已暂停</h3>
                    <button
                      className="gold-button"
                      onClick={() => {
                        setPaused(false);
                        if (t) setData((old) => old.tournament ? { ...old, tournament: { ...old.tournament, paused: false } } : old);
                      }}
                    >
                      继续牌局
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="action-slot">
                <div className={`action-panel ${g.done ? "hand-complete" : ""}`}>
                  {g.done ? (
                    <>
                      <div className="hand-result">
                        <span className={`eyebrow ${!t?.complete && !t?.out ? "hand-winner-eyebrow" : ""}`}>{t?.complete ? "CHAMPION" : t?.out ? "TOURNAMENT ENDED" : "本手赢家"}</span>
                        {t?.complete ? <strong>{t.out ? "冠军赛模拟完成，最终冠军已产生" : "恭喜，你赢得了本届冠军！"}</strong> : t?.out ? <strong>你已出局，正在模拟其余比赛…</strong> : <div className="hand-winners">{g.winners.map(i => { const winner = g.players[i]; const amount = Math.max(0, winner.chips - winner.start + winner.total); return <div className="hand-winner" key={winner.profile.id}><Avatar p={winner.profile} playerAvatar={data.playerProfile.avatar} /><span><b>{winner.profile.name}</b></span><strong>+{amount.toLocaleString()}</strong>{g.board.length === 5 ? <em>{evaluate([...winner.cards, ...g.board]).name}</em> : null}</div> })}</div>}
                        {waitingOnOtherTables ? (
                          <div className="advance-wait" aria-live="polite">
                            <span>{progress || "正在等待其他牌桌结束…"}</span>
                            <div
                              className="simulation-progress-track"
                              role="progressbar"
                              aria-label="其他牌桌结算进度"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={backgroundPercent}
                            >
                              <i style={{ width: `${backgroundPercent}%` }} />
                            </div>
                          </div>
                        ) : null}
                      </div>
                      {!t?.out && !t?.complete ? (
                        <button
                          className="gold-button"
                          disabled={busy}
                          onClick={() => {
                            if (championshipWon) {
                              advanceTournament();
                              setPage("tournament");
                              return;
                            }
                            if (cashMatchFinished) {
                              finishCashMatch();
                              return;
                            }
                            if (!t && g.players[0].chips === 0) {
                              setPage("lobby");
                              return;
                            }
                            nextHand();
                          }}
                        >
                          {busy
                            ? "请稍候…"
                            : championshipWon
                              ? (
                                <span className="advance-button-copy champion-button-copy">
                                  <strong className="advance-button-target">查看结果</strong>
                                </span>
                              )
                              : canAdvance && t
                                ? (
                                  <span className="advance-button-copy">
                                    <span>确认晋级</span>
                                    <strong className="advance-button-target">{advancementTargetLabel}</strong>
                                  </span>
                                )
                                : cashMatchFinished
                                  ? "比赛结算"
                                  : g.players[0].chips === 0
                                    ? "返回大厅"
                                    : "下一手"}
                          <ChevronRight size={17} />
                        </button>
                      ) : t?.complete ? (
                        <button className="gold-button" onClick={() => setPage("tournament")}>
                          查看结果
                          <ChevronRight size={17} />
                        </button>
                      ) : (
                        <button onClick={() => setPage("lobby")}>返回大厅</button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="bet-controls">
                        <div className="quick-bets">
                          {(limits
                            ? [
                              {
                                label: "最小",
                                value: limits.min,
                                title: `加注至最小 ${limits.min.toLocaleString()}`,
                              },
                              { label: "¼ 池", value: presetValue({ fraction: 0.25 }), title: "四分之一底池" },
                              { label: "⅓ 池", value: presetValue({ fraction: 1 / 3 }), title: "三分之一底池" },
                              { label: "½ 池", value: presetValue({ fraction: 0.5 }), title: "二分之一底池" },
                              { label: "¾ 池", value: presetValue({ fraction: 0.75 }), title: "四分之三底池" },
                              { label: "满池", value: presetValue({ fraction: 1 }), title: "加注一个底池" },
                            ]
                            : []
                          ).map((option) => (
                            <button
                              key={option.label}
                              title={option.title}
                              aria-label={option.title}
                              className={active && raise === option.value ? "active" : ""}
                              disabled={!active || !limits?.canRaise}
                              onClick={() => setRaise(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                          <button
                            className={`allin-btn ${active && limits && raise === limits.max ? "active" : ""}`}
                            title="全下"
                            aria-label="全下"
                            disabled={!active || !limits?.canRaise}
                            onClick={() => limits && setRaise(limits.max)}
                          >全下</button>
                        </div>
                        <div className="raise-range">
                          <div className="raise-range-head">
                            <span>加注至</span>
                            <input
                              type="number"
                              className="raise-amount-input"
                              aria-label="加注金额"
                              min={limits?.min || 0}
                              max={limits?.max || 0}
                              value={raise}
                              disabled={!active || !limits?.canRaise}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (!Number.isNaN(v)) setRaise(v);
                              }}
                              onBlur={() => {
                                if (!limits) return;
                                setRaise(Math.max(limits.min, Math.min(limits.max, raise)));
                              }}
                            />
                          </div>
                          <input
                            aria-label="加注金额滑块"
                            type="range"
                            min={limits?.min || 0}
                            max={limits?.max || 0}
                            step={g?.bb || 1}
                            value={raise}
                            disabled={!active || !limits?.canRaise}
                            onChange={(e) => setRaise(Number(e.target.value))}
                          />
                        </div>
                      </div>
                      <div className="action-buttons">
                        <button
                          className="fold-button"
                          title="弃牌（快捷键 F）"
                          disabled={!active}
                          onClick={() => commit(act(g, { type: "fold" }))}
                        >
                          弃牌<span className="key-hint">F</span>
                        </button>
                        <button
                          className="call-button"
                          title={`${limits?.toCall ? `跟注 ${limits.toCall}` : "过牌"}（快捷键 C）`}
                          disabled={!active}
                          onClick={() => commit(act(g, { type: "call" }))}
                        >
                          {limits?.toCall ? (
                            <>
                              <span>跟注</span>
                              <small className="action-amount">{limits.toCall}</small>
                            </>
                          ) : "过牌"}
                          <span className="key-hint">C</span>
                        </button>
                        <button
                          className="gold-button"
                          title={`加注 ${raise}（快捷键 R）`}
                          disabled={!active || !limits?.canRaise}
                          onClick={submitRaise}
                        >
                          <span>加注</span>
                          <small className="action-amount">{raise}</small>
                          <span className="key-hint">R</span>
                        </button>
                        {confirmDialog ? (
                          <>
                            <div
                              className="allin-confirm-backdrop"
                              onMouseDown={() => setConfirmDialog(null)}
                            />
                            <div
                              className="allin-confirm-popover"
                              role="alertdialog"
                              aria-modal="true"
                              aria-label={confirmDialog.title}
                            >
                              <strong>{confirmDialog.title}</strong>
                              <p>{confirmDialog.message}</p>
                              <div className="allin-confirm-actions">
                                <button onClick={() => setConfirmDialog(null)}>取消</button>
                                <button
                                  className="gold-button"
                                  onClick={() => {
                                    const run = confirmDialog.onConfirm;
                                    setConfirmDialog(null);
                                    run();
                                  }}
                                >
                                  {confirmDialog.confirmLabel || "确认"}
                                </button>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </TablePage>
          ) : (
            <div className="loading">正在恢复牌局…</div>
          )
        ) : page === "settings" ? (
          <SettingsPage
            section={settingsSection}
            onSectionChange={setSettingsSection}
            aiContent={aiSettingsContent}
            playersContent={playerDirectoryContent}
            profileContent={profileSettingsContent}
            infoContent={infoSettingsContent}
          />
        ) : page === "players" ? (
          <div className="content-page">{playerDirectoryContent}</div>
        ) : page === "cashResults" ? (
          <CashResultsPage
            result={cashMatchResult}
            userPlayerName={userPlayer.name}
            onNewMatch={() => openNew("cash")}
            onBackToLobby={() => setPage("lobby")}
            renderAvatar={(player) => <Avatar p={player} playerAvatar={data.playerProfile.avatar} />}
          />
        ) : page === "tournament" ? (
          <TournamentPage
            tournament={t}
            completedStandings={completedStandings}
            userPlayerName={userPlayer.name}
            tournamentRecordsCount={data.tournamentRecords.length}
            rounds={rounds}
            counts={counts}
            roundLabel={roundLabel}
            onPrimaryAction={() => {
              if (t?.complete) openNew("tournament");
              else enterChampionship();
            }}
            simulationProgress={
              <SimulationProgressPanel
                progress={eliminatedProgress}
                label="你出局后的赛事进度"
                playerAvatar={data.playerProfile.avatar}
                resumeHint="刷新后会从最近完成的牌桌继续；刷新时正在进行的牌桌会重算。"
              />
            }
            onViewLeaderboard={() => setPage("leaderboard")}
            renderAvatar={(player) => <Avatar p={player} playerAvatar={data.playerProfile.avatar} />}
          />
        ) : (
          <LeaderboardPage
            tournamentCount={data.stats.tournaments}
            localRank={localRank}
            totalPlayers={leaderboard.length}
            leaderboardScrolled={leaderboardScrolled}
            leaderboardRef={leaderboardScrollRef}
            rows={
              <LeaderboardRows
                rows={leaderboard}
                playerAvatar={data.playerProfile.avatar}
                userPlayerName={userPlayer.name}
                localRowRef={localLeaderboardRow}
                onSelect={selectLeaderboardPlayer}
              />
            }
            onOpenPoints={() => setModal("points")}
            onScroll={() => {
              if (leaderboardScrollFrame.current != null) return;
              leaderboardScrollFrame.current = requestAnimationFrame(() => {
                leaderboardScrollFrame.current = null;
                const next = (leaderboardScrollRef.current?.scrollTop ?? 0) > 0;
                if (next === leaderboardScrolledRef.current) return;
                leaderboardScrolledRef.current = next;
                setLeaderboardScrolled(next);
              });
            }}
            onScrollTop={() => leaderboardScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
            onLocateSelf={() => localLeaderboardRow.current?.scrollIntoView({
              behavior: "smooth",
              block: "center",
              inline: "nearest",
            })}
          />
        )}
      </main>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => void importFile(e.target.files?.[0])}
      />
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
      {saveLoadIssue ? (
        <div className="modal-backdrop storage-issue-backdrop">
          <section
            className="modal storage-issue-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="storage-issue-title"
          >
            <p className="eyebrow">LOCAL SAVE CHECK</p>
            <h2 id="storage-issue-title">{saveLoadIssue.title}</h2>
            <div className="notice import-warning">{saveLoadIssue.message}</div>
            <p className="muted">
              {saveLoadIssue.recoverable
                ? "系统已暂时使用可读取的版本。确认后才会继续正常自动保存。"
                : "当前数据未覆盖。你可以导入之前导出的 JSON 存档。"}
            </p>
            <div className="modal-actions">
              {saveLoadIssue.recoverable ? (
                <button
                  type="button"
                  className="gold-button full"
                  onClick={() => {
                    setSaveLoadIssue(null);
                    setSaveError(false);
                  }}
                >
                  确认并继续
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSaveLoadIssue(null);
                      file.current?.click();
                    }}
                  >
                    导入备份
                  </button>
                  <button
                    type="button"
                    className="gold-button"
                    onClick={() => setSaveLoadIssue(null)}
                  >
                    知道了
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
      {modal ? (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <section
            className={`modal ${modal === "rules" ? "rules-modal" : ""} ${modal === "cash-details" || modal === "tournament-details" ? "mode-details-modal" : ""} ${modal === "tournament-details" ? "championship-details-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "new"
                ? "创建牌局"
                : modal === "cash-details"
                  ? "单次赛说明"
                  : modal === "tournament-details"
                    ? "冠军赛说明"
                    : modal === "points"
                      ? "计分规则"
                      : "游戏规则"
            }
          >
            <button
              className="close"
              aria-label="关闭"
              onClick={closeModal}
            >
              <X size={20} />
            </button>
            {modal === "new" ? (
              <>
                <p className="eyebrow">TAKE YOUR SEAT</p>
                <h2>{newMode === "cash" ? "开始单次赛" : "开始冠军赛"}</h2>
                <p className="muted">
                  {g && t
                    ? "开始单次赛会暂停并保存当前冠军赛，之后可继续。"
                    : g
                      ? "新比赛会替换当前牌局，你可以先导出存档。"
                      : "10,000 起始筹码 · 50 / 100 初始盲注"}
                </p>
                {newMode === "cash" ? (
                  <label>
                    牌桌人数
                    <select
                      value={seatCount}
                      onChange={(e) => setSeatCount(+e.target.value)}
                    >
                      {[2, 4, 6, 8].map((n) => (
                        <option value={n} key={n}>
                          {n} 人（含你）
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="notice">
                    64 人 · 多桌同时模拟 · {resetTournamentStacks ? "进入下一轮时全部重置为 10,000 筹码" : "晋级时保留现有筹码"}；出局后快速模拟至冠军产生。
                  </div>
                )}
                <label>
                  电脑整体水平
                  <select
                    value={data.settings.difficulty}
                    onChange={(e) =>
                      updateSettings({ difficulty: +e.target.value })
                    }
                  >
                    {levels.map((l, i) => (
                      <option value={i + 1} key={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  涨盲节奏
                  <select
                    value={data.settings.pace}
                    onChange={(e) =>
                      updateSettings({ pace: +e.target.value })
                    }
                  >
                    <option value={5}>快速 · 每 5 手涨盲</option>
                    <option value={10}>标准 · 每 10 手涨盲</option>
                    <option value={20}>深度 · 每 20 手涨盲</option>
                  </select>
                </label>
                {newMode === "tournament" ? (
                  <label className="modal-toggle">
                    <span className="modal-toggle-copy">
                      <strong>进入下一轮重置筹码</strong>
                      <small>{resetTournamentStacks ? "全部选手重置为 10,000" : "保留选手当前筹码"}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={resetTournamentStacks}
                      onChange={(e) => setResetTournamentStacks(e.target.checked)}
                    />
                    <span className="modal-toggle-track" aria-hidden="true" />
                  </label>
                ) : null}
                <button
                  className="gold-button full"
                  disabled={!characters.length}
                  onClick={start}
                >
                  确认入座 <ArrowUpRight size={17} />
                </button>
              </>
            ) : modal === "cash-details" ? (
              <>
                <h2>单次赛说明</h2>
                <ul className="mode-details-list">
                  <li>2–8 人同桌，与电脑选手进行一场独立牌局。</li>
                  <li>人数和难度可自由选择。</li>
                  <li>起始筹码统一为 10,000，可设置每 5、10 或 20 手涨盲，不设晋级流程。</li>
                </ul>
              </>
            ) : modal === "tournament-details" ? (
              <>
                <h2>冠军赛说明</h2>
                <ul className="mode-details-list">
                  <li>64 人分桌比赛，依次进行首轮、次轮、半决赛和总决赛。</li>
                  <li>前三轮每桌 8 进 4，最后 8 人进入总决赛。</li>
                  <li>进入下一轮的筹码方式可在入座前选择：全部重置为 10,000，或保留现有筹码；总决赛按 8、6、4、2、1 人推进。</li>
                  <li>每赢一手牌获得积分，最终按名次获得额外奖励。</li>
                </ul>
                <div className="championship-bracket" aria-labelledby="championship-bracket-title">
                  <div className="championship-bracket-heading">
                    <div>
                      <strong id="championship-bracket-title">冠军赛晋级树</strong>
                    </div>
                    <span>64 <i aria-hidden="true">→</i> 1</span>
                  </div>
                  <div className="bracket-track">
                    <div className="bracket-track-label">
                      <span>四轮赛制</span>
                      <small>分桌晋级 → 冠军桌</small>
                    </div>
                    <div className="bracket-track-scroll">
                      <div className="bracket-track-nodes">
                        {championshipQualifyingStages.map((stage) => (
                          <div className="bracket-node" key={stage.round}>
                            <small>{stage.round}</small>
                            <strong>{stage.players}</strong>
                            <span>{stage.tables}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : modal === "points" ? (
              <>
                <p className="eyebrow">SCORING</p>
                <h2>计分规则</h2>
                <div className="rules-copy">
                  <p>
                    单次赛和冠军赛分别计分。单次赛只有最终赢家得分；冠军赛按最终名次给前 8 名积分，冠军赛中的每个赢手再获得 <strong>+0.1</strong> 分。
                  </p>
                  <p>
                    单次赛赢家分 = 参赛人数基础分 × 难度系数。参赛人数越多、电脑难度越高，赢家获得的积分越多；单次赛不额外按赢手计分。
                  </p>
                  <div className="points-rule-chart" aria-label="单次赛人数基础分">
                    {singleMatchPointRules.map((row) => (
                      <div className="points-rule-row" key={row.entrants}>
                        <span>{row.entrants} 人桌赢家</span>
                        <b>{(row.basePointsTenths / 10).toFixed(1)}</b>
                      </div>
                    ))}
                  </div>
                  <p className="muted rules-chart-note">
                    单次赛和冠军赛名次分共用难度系数：{difficultyPointRules.map((rule, index) => `${index ? "、" : ""}${rule.label} ${rule.multiplierTenths / 10}`).join("")}；冠军赛赢手的 <strong>+0.1</strong> 分不乘系数。
                  </p>
                  <p>冠军赛结束时，按最终名次一次性发放名次分（进阶难度为基准）：</p>
                  <div className="points-rule-chart" aria-label="名次积分对照表">
                    {[
                      { label: "冠军", points: 20 },
                      { label: "亚军", points: 15 },
                      { label: "季军", points: 12 },
                      { label: "第 4 名", points: 11 },
                      { label: "第 5 名", points: 10 },
                      { label: "第 6 名", points: 9 },
                      { label: "第 7 名", points: 8 },
                      { label: "第 8 名", points: 7 },
                    ].map((row) => (
                      <div className="points-rule-row" key={row.label}>
                        <span>{row.label}</span>
                        <b>+{row.points}</b>
                      </div>
                    ))}
                  </div>
                  <p className="muted rules-chart-note">
                    积分榜按总积分从高到低排序；分数相同时依次比较赢手总数、历史最佳名次、参赛场次，最后按姓名排序。
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2>无限注德州扑克</h2>
                <div className="rules-copy">
                  <div className="hand-rank-chart" aria-label="牌型从大到小，附示例">
                    {handRankExamples.map((example, index) => (
                      <div className="hand-rank-row" key={example.name}>
                        <b className="hand-rank-index">{index + 1}</b>
                        <span className="hand-rank-name">{example.name}</span>
                        <div className="hand-rank-cards">
                          {example.cards.map((c, i) => (
                            <Card key={i} value={c} small />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="muted rules-chart-note">花色不分大小，仅用于示例配色。</p>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
      {selectedCurrent ? (
        <div className="modal-backdrop">
          <section
            className="modal character-modal"
            role="dialog"
            aria-modal="true"
            aria-label="人物档案"
          >
            <button
              className="close"
              aria-label="关闭人物档案"
              onClick={closePlayerProfile}
            >
              <X size={20} />
            </button>
            <Avatar p={selectedCurrent} playerAvatar={data.playerProfile.avatar} />
            <h2>{selectedCurrent.name}</h2>
            {!statsOnly ? (
              <>
                <span className="style-tag">
                  {selectedCurrent.style} · {levels[selectedCurrent.level - 1]}
                </span>
                <p>{selectedCurrent.bio}</p>
                <div className="trait">
                  <span>进攻倾向</span>
                  <meter min={0} max={1} value={selectedCurrent.aggression} />
                  <b>{Math.round(selectedCurrent.aggression * 100)}%</b>
                </div>
                <div className="trait">
                  <span>诈唬倾向</span>
                  <meter min={0} max={0.6} value={selectedCurrent.bluff} />
                  <b>{Math.round(selectedCurrent.bluff * 100)}%</b>
                </div>
              </>
            ) : null}
            <div className="career-stats">
              <div className="career-stat">
                <span>最好成绩</span>
                <b>{bestResultLabel(selectedCareerStats.bestPlace)}</b>
              </div>
              <div className="career-stat">
                <span>参赛次数</span>
                <b>{selectedCareerStats.championshipsEntered}</b>
              </div>
              <div className="career-stat">
                <span>赢得冠军</span>
                <b>{selectedChampionshipsWon}</b>
              </div>
              <div className="career-stat">
                <span>冠军赛胜率</span>
                <b>
                  {selectedCareerStats.championshipsEntered
                    ? `${Math.round((selectedChampionshipsWon / selectedCareerStats.championshipsEntered) * 100)}%`
                    : "—"}
                </b>
              </div>
              <div className="career-stat">
                <span>冠军赢手</span>
                <b>{selectedCareerStats.tournamentHandsWon}</b>
              </div>
              <div className="career-stat">
                <span>手局胜率</span>
                <b>
                  {selectedCareerStats.tournamentHandsPlayed
                    ? `${Math.round((selectedCareerStats.tournamentHandsWon / selectedCareerStats.tournamentHandsPlayed) * 100)}%`
                    : "—"}
                </b>
              </div>
            </div>
            {selectedCurrent.id !== -1 && !statsOnly ? (
              <>
                <label>
                  用 AI 重新塑造
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="例如：谨慎的老手，但关键时刻敢于诈唬"
                  />
                </label>
                <button
                  className="gold-button full"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setPreview(
                        await reshape(
                          data.settings,
                          key,
                          selectedCurrent,
                          instruction,
                        ),
                      );
                    } catch (e) {
                      setToast(e instanceof Error ? e.message : "生成失败");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Sparkles size={16} />
                  {busy ? "正在塑造人物…" : "生成性格预览"}
                </button>
                {preview ? (
                  <div className="ai-preview">
                    <b>{preview.style}</b>
                    <p>{preview.bio}</p>
                    <p>
                      进攻 {Math.round(preview.aggression * 100)}% · 诈唬{" "}
                      {Math.round(preview.bluff * 100)}%
                    </p>
                    <button
                      onClick={() => {
                        setData((d) => ({
                          ...d,
                          previous: {
                            ...d.previous,
                            [preview.id]: selectedCurrent,
                          },
                          overrides: { ...d.overrides, [preview.id]: preview },
                        }));
                        setPreview(null);
                        setToast("人物已更新，将在新比赛生效");
                      }}
                    >
                      应用新性格
                    </button>
                  </div>
                ) : null}
                <div className="modal-actions">
                  <button
                    onClick={() => {
                      setData((d) => ({
                        ...d,
                        overrides: {
                          ...d.overrides,
                          [selectedCurrent.id]: selected!,
                        },
                      }));
                      setToast("已恢复初始人物档案");
                    }}
                  >
                    <RotateCcw size={14} />
                    恢复默认
                  </button>
                  {data.previous[selectedCurrent.id] ? (
                    <button
                      onClick={() =>
                        setData((d) => ({
                          ...d,
                          overrides: {
                            ...d.overrides,
                            [selectedCurrent.id]: d.previous[selectedCurrent.id],
                          },
                        }))
                      }
                    >
                      恢复上一版
                    </button>
                  ) : null}
                </div>
                <small className="muted">
                  不改变身份和水平，当前比赛使用开赛时的人物快照。仅保留公开交手记录。
                </small>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
      {batchOpen ? (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="批量人物塑造"
          >
            <button
              className="close"
              aria-label="关闭批量塑造"
              disabled={busy}
              onClick={() => setBatchOpen(false)}
            >
              <X size={20} />
            </button>
            <p className="eyebrow">CHARACTER STUDIO</p>
            <h2>批量塑造选手</h2>
            <p className="muted">
              从选手列表依次选取，逐名调用模型。生成后预览并统一应用，当前比赛不受影响。
            </p>
            <label>
              本批人数
              <select
                disabled={busy}
                value={batchCount}
                onChange={(e) => setBatchCount(+e.target.value)}
              >
                {[5, 10, 30, 63].map((n) => (
                  <option key={n} value={n}>
                    {n} 人
                  </option>
                ))}
              </select>
            </label>
            <label>
              统一创作要求
              <textarea
                disabled={busy}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="例如：保留各自差异，让性格更鲜明"
              />
            </label>
            <div className="notice">
              本批最多调用{" "}
              {Math.min(
                batchCount,
                characters.length,
              )}{" "}
              次，费用按你的模型服务计费。暂停会在当前人物处理完后停止，已生成结果保留。
            </div>
            <button
              className="gold-button full"
              disabled={busy}
              onClick={async () => {
                batchStop.current = false;
                setBusy(true);
                const targets = characters.slice(0, batchCount);
                setBatchTotal(targets.length);
                const completed = new Set(batchResults.map((p) => p.id));
                try {
                  for (const raw of targets) {
                    if (batchStop.current) break;
                    if (completed.has(raw.id)) continue;
                    const result = await reshape(
                      data.settings,
                      key,
                      profile(raw),
                      instruction,
                    );
                    setBatchResults((items) => [...items, result]);
                  }
                } catch (e) {
                  setToast(
                    e instanceof Error
                      ? e.message
                      : "生成失败，已完成结果已保留",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? `正在生成… ${Math.min(batchResults.length, batchTotal)} / ${batchTotal}`
                : "生成 / 继续"}
            </button>
            {busy ? (
              <button
                className="full"
                onClick={() => {
                  batchStop.current = true;
                }}
              >
                完成当前人物后暂停
              </button>
            ) : null}
            <div className="batch-results">
              {batchResults.map((p) => (
                <article key={p.id}>
                  <b>
                    {p.name} · {p.style}
                  </b>
                  <p>{p.bio}</p>
                  <small>
                    进攻 {Math.round(p.aggression * 100)}% · 诈唬{" "}
                    {Math.round(p.bluff * 100)}%
                  </small>
                </article>
              ))}
            </div>
            {batchResults.length ? (
              <button
                className="gold-button full"
                disabled={busy}
                onClick={() => {
                  setData((d) => {
                    const overrides = { ...d.overrides };
                    const previous = { ...d.previous };
                    batchResults.forEach((p) => {
                      previous[p.id] =
                        d.overrides[p.id] ||
                        characters.find((c) => c.id === p.id)!;
                      overrides[p.id] = p;
                    });
                    return { ...d, overrides, previous };
                  });
                  setBatchResults([]);
                  setBatchOpen(false);
                  setToast("批量人物更新已保存，将在新比赛中生效");
                }}
              >
                应用 {batchResults.length} 位人物的新性格
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
      {imported ? (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="确认导入"
          >
            <h2>覆盖现有存档？</h2>
            <div className="notice import-warning" role="alert">
              检测到本地已有记录。继续后，当前记录和设置会被上传的存档完整替换，此操作无法撤销。
            </div>
            <div className="import-comparison">
              <div>
                <span>当前本地记录</span>
                <strong>{currentSaveSummary.hands} 手牌 · {currentSaveSummary.championships} 次冠军赛</strong>
                <small>
                  {currentSaveSummary.hasActiveGame ? "含未结束牌局 · " : ""}
                  {currentSaveSummary.playerRecords} 位选手战绩
                  {currentSaveSummary.hasPersonalization ? " · 含个性化设置" : ""}
                </small>
              </div>
              <div>
                <span>上传的存档</span>
                <strong>
                  {summarizeSaveRecords(imported).hands} 手牌 · {summarizeSaveRecords(imported).championships} 次冠军赛
                </strong>
                <small>
                  保存于 {new Date(imported.savedAt).toLocaleString()} · {summarizeSaveRecords(imported).playerRecords} 位选手战绩
                </small>
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={exportCurrentSave}>备份当前存档</button>
              <button onClick={() => setImported(null)}>取消</button>
              <button
                className="gold-button"
                onClick={() => applyImportedSave(imported, true)}
              >
                确认覆盖
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {resetConfirmOpen ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !resetting) setResetConfirmOpen(false);
          }}
        >
          <section
            className="modal reset-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-confirm-title"
          >
            <p className="eyebrow">RESET LOCAL DATA</p>
            <h2 id="reset-confirm-title">确认重置所有数据？</h2>
            <div className="notice import-warning">
              当前牌局、冠军赛进度、战绩、人物修改、个人资料和设置都会被清空。此操作无法撤销，建议先导出存档备份。
            </div>
            <div className="modal-actions">
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetConfirmOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="reset-button"
                disabled={resetting}
                onClick={() => void resetAllData()}
              >
                <RotateCcw size={14} /> {resetting ? "正在重置…" : "确认重置"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {saveStale ? (
        <div className="modal-backdrop stale-save-backdrop">
          <section
            className="modal stale-save-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="stale-save-title"
          >
            <p className="eyebrow">LOCAL SAVE UPDATED</p>
            <h2 id="stale-save-title">页面已过期</h2>
            <p className="muted">
              检测到本地存档版本不一致。请刷新页面后继续操作。
            </p>
            <div className="modal-actions">
              <button
                className="gold-button full"
                onClick={() => window.location.reload()}
              >
                刷新页面
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <Fireworks active={showFireworks} variant={fireworksVariant} />
    </div>
  );
}
