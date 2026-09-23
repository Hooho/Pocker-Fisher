import {
  championshipStandings,
  championshipCareerBonuses,
  qualification,
  type ChampionshipSimulationProgress,
  type SimulationPlayerStatsMap,
  type SimulatedTablePerformance,
} from "./tournament";
import { pathForPage, useAppRouter } from "./app/router";
import { useEffect, useRef, useState, useMemo, useCallback, memo, lazy, Suspense, type CSSProperties } from "react";
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
  type Character,
  type Game,
  type Move,
} from "./engine";
import {
  blank,
  loadSave,
  saveData,
  checkSaveRevision,
  parseSave,
  downloadSave,
  getSaveRevision,
  isSaveConflictError,
  summarizeSaveRecords,
  subscribeToSaveChanges,
  type Save,
  type Tournament,
  type ChampionshipRecord,
  type PlayerCareerStats,
} from "./storage";
import { aiMove, reshape, requestAI } from "./ai";
const Table3D = lazy(() => import("./Table3D"));
import { playGameSound } from "./sound";
const levels = ["入门", "普通", "进阶", "专家", "大师"];
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
  { x: -42, y: -77, twist: "135deg", drift: "-8px", color: "#f0e3bb" },
  { x: -10, y: -68, twist: "210deg", drift: "9px", color: "#d9b75d" },
  { x: 28, y: -80, twist: "-120deg", drift: "12px", color: "#c98b79" },
  { x: 63, y: -60, twist: "155deg", drift: "14px", color: "#e8dcae" },
  { x: 78, y: -25, twist: "-195deg", drift: "8px", color: "#a9bc91" },
  { x: 73, y: 18, twist: "125deg", drift: "15px", color: "#e7c970" },
  { x: 54, y: 55, twist: "-155deg", drift: "11px", color: "#f0e3bb" },
  { x: 23, y: 75, twist: "195deg", drift: "-6px", color: "#d7b85f" },
  { x: -18, y: 72, twist: "-135deg", drift: "-12px", color: "#ca8d7b" },
  { x: -53, y: 56, twist: "175deg", drift: "-15px", color: "#e9d9a1" },
  { x: -77, y: 19, twist: "-205deg", drift: "-8px", color: "#a9bc91" },
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
): ChampionshipRecord {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playedAt: new Date().toISOString(),
    mode,
    entrants,
    standings: championshipStandings(players),
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
const TABLE_TIMER_STORAGE_KEY = "moyu-dezhou-table-timer";
type TableTimerState = { accumulatedMs: number; runningSinceMs: number | null };
function loadTableTimer(): TableTimerState {
  try {
    const raw = localStorage.getItem(TABLE_TIMER_STORAGE_KEY);
    if (!raw) return { accumulatedMs: 0, runningSinceMs: null };
    const parsed = JSON.parse(raw);
    return {
      accumulatedMs: typeof parsed.accumulatedMs === "number" ? parsed.accumulatedMs : 0,
      runningSinceMs: typeof parsed.runningSinceMs === "number" ? parsed.runningSinceMs : null,
    };
  } catch {
    return { accumulatedMs: 0, runningSinceMs: null };
  }
}
function saveTableTimer(state: TableTimerState) {
  try {
    localStorage.setItem(TABLE_TIMER_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // best-effort only; the timer just won't survive a refresh if storage is unavailable
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
type TableStageSize = { width: number; height: number };

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getTableSeatPosition(
  playerCount: number,
  seatIndex: number,
  stageSize: TableStageSize,
) {
  const angle = Math.PI / 2 + (seatIndex * Math.PI * 2) / Math.max(1, playerCount);
  if (!stageSize.width || !stageSize.height) {
    return {
      left: `${50 + 43 * Math.cos(angle)}%`,
      top: `${50 + (seatIndex === 0 ? 35 : 30) * Math.sin(angle)}%`,
    };
  }

  const compact = stageSize.width <= 600;
  const centerX = stageSize.width / 2;
  const centerY = stageSize.height * (compact ? 0.54 : 0.55);
  const tableRadiusX = stageSize.width * (compact ? 0.47 : 0.43);
  const tableRadiusY = stageSize.height * (compact ? 0.18 : 0.2);
  const seatHalfWidth = compact ? 45 : 62;
  const seatHalfHeight = compact ? 38 : 58;
  const gap = compact ? 8 : 14;
  const edgePadding = compact ? 4 : 8;
  const xRadius = tableRadiusX + seatHalfWidth + gap;
  const yRadius = tableRadiusY + seatHalfHeight + gap;

  const x = clampNumber(
    centerX + xRadius * Math.cos(angle),
    seatHalfWidth + edgePadding,
    stageSize.width - seatHalfWidth - edgePadding,
  );
  const y = clampNumber(
    centerY + yRadius * Math.sin(angle),
    seatHalfHeight + edgePadding,
    stageSize.height - seatHalfHeight - edgePadding,
  );
  return { left: `${x}px`, top: `${y}px` };
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
function placementCounts(records: ChampionshipRecord[], id: number) {
  // Same "played" filter as championshipWinCount: simulated-only runs don't count.
  // Standings only ever record the top 8 finishers, so `top8` is simply how many
  // times this player's id shows up in any record's standings at all.
  const counts = { champion: 0, runnerUp: 0, third: 0, top8: 0 };
  for (const record of records) {
    if (record.mode !== "played") continue;
    const place = record.standings.find((standing) => standing.player.id === id)?.place;
    if (!place) continue;
    counts.top8 += 1;
    if (place === 1) counts.champion += 1;
    else if (place === 2) counts.runnerUp += 1;
    else if (place === 3) counts.third += 1;
  }
  return counts;
}
function placementSummary(counts: { champion: number; runnerUp: number; third: number; top8: number }) {
  if (!counts.top8) return null;
  // Podium finishes read as one run-together group ("1冠2亚3季"); the overall
  // top-8 tally is spelled out in full ("3八强") rather than the bare "3强",
  // which read ambiguously next to the single-character 冠/亚/季 labels.
  const podium = [
    counts.champion ? `${counts.champion}冠` : "",
    counts.runnerUp ? `${counts.runnerUp}亚` : "",
    counts.third ? `${counts.third}季` : "",
  ].join("");
  return [podium, `${counts.top8}八强`].filter(Boolean).join(" ");
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
      player.id === -1 ? heroStack : knownStacks[String(player.id)] ?? 10000,
    ]),
  );
  const game = newGame(table, 100, table.map((p) => fieldStacks[String(p.id)]));
  const tableIds = new Set(table.map((p) => p.id));
  const background = round < 3
    ? { remaining: field.filter((p) => !tableIds.has(p.id)), qualified: [], done: false }
    : undefined;
  const nextSave: Save = {
    ...save,
    game,
    tournament: {
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
    },
  };
  return recordAdvancement(nextSave, field, field.length);
}
function Card({
  value,
  back = false,
  small = false,
  highlight = false,
  style,
}: {
  value?: number;
  back?: boolean;
  small?: boolean;
  highlight?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`card ${small ? "small" : ""} ${highlight ? "highlight" : ""} ${back ? "back" : ""} ${value !== undefined && [1, 2].includes(suit(value)) ? "red" : ""}`}
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
function Avatar({ p, playerAvatar }: { p: Character; playerAvatar?: string | null }) {
  return p.id === -1 ? (
    <div className="hero-avatar">
      {playerAvatar ? <img src={playerAvatar} alt={`${p.name}头像`} /> : "♠"}
    </div>
  ) : (
    <img src={`/avatars/${p.id % 300}.svg`} alt={p.name} loading="lazy" />
  );
}
type LeaderboardEntry = PlayerCareerStats & {
  player: Character;
  placement: { champion: number; runnerUp: number; third: number; top8: number };
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
            {placementSummary(row.placement) ? <small>{placementSummary(row.placement)}</small> : null}
          </span>
          <span>{row.matches}</span>
          <span>{row.advances}</span>
          <span>{row.handsWon}</span>
          <span>{row.highestChips ? row.highestChips.toLocaleString() : "—"}</span>
        </button>
      ))}
    </>
  );
});
function Fireworks({ active }: { active: boolean }) {
  const bursts = useMemo(() => {
    if (!active) return [];
    const colors = ["#f4d67f", "#ff7a6b", "#6bc8ff", "#7ee787", "#ffb86b", "#d68bff", "#ff9ecf"];
    return Array.from({ length: 8 }, (_, i) => {
      const particles = 22 + Math.floor(Math.random() * 10);
      return {
        id: i,
        left: 12 + Math.random() * 76,
        top: 8 + Math.random() * 50,
        delay: i * 0.5 + Math.random() * 0.25,
        color: colors[i % colors.length],
        particles,
      };
    });
  }, [active]);
  if (!active) return null;
  return (
    <div className="fireworks-overlay" aria-hidden="true">
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
export default function App() {
  const [data, setData] = useState<Save>(blank);
  const [ready, setReady] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [page, setPage] = useAppRouter();
  const [settingsSection, setSettingsSection] = useState<"ai" | "players" | "profile">("ai");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [modal, setModal] = useState<
    "new" | "rules" | "points" | "cash-details" | "tournament-details" | null
  >(null);
  const [newMode, setNewMode] = useState<"cash" | "tournament">("cash");
  const [seatCount, setSeatCount] = useState(6);
  const [paused, setPaused] = useState(false);
  const [tableSeconds, setTableSeconds] = useState(() => Math.floor(elapsedTableMs(loadTableTimer()) / 1000));
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [key, setKey] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("本地玩家");
  const [profileAvatarDraft, setProfileAvatarDraft] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
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
  const [saveStale, setSaveStale] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [lastAction, setLastAction] = useState<{ id: number; player: number } | null>(null);
  const [chipToss, setChipToss] = useState<{ seat: number; token: number } | null>(null);
  const [celebrationDone, setCelebrationDone] = useState(false);
  const tableStageRef = useRef<HTMLDivElement>(null);
  const [tableStageSize, setTableStageSize] = useState<TableStageSize>({ width: 0, height: 0 });
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
  const t = data.tournament;
  // Lets openPlayerProfile stay a stable useCallback (see below) while still
  // reading up-to-date page/paused/tournament state at click time.
  const openPlayerProfileState = useRef({ page, paused, t });
  const tableEliminated = !!t?.out;
  const tableTimerRunning = page === "table" && !tableEliminated && pageVisible;
  const tableTimerState = useRef(loadTableTimer());
  useEffect(() => {
    if (page !== "table") {
      setTableStageSize({ width: 0, height: 0 });
      return;
    }
    const stage = tableStageRef.current;
    if (!stage) return;
    const updateSize = () => {
      const rect = stage.getBoundingClientRect();
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
      setTableStageSize((current) =>
        current.width === next.width && current.height === next.height ? current : next,
      );
    };
    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [page]);
  const resetTableTimer = () => {
    tableTimerState.current = { accumulatedMs: 0, runningSinceMs: null };
    saveTableTimer(tableTimerState.current);
    setTableSeconds(0);
  };
  const prevTableEliminated = useRef(tableEliminated);
  useEffect(() => {
    const handleVisibility = () =>
      setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handleVisibility);
    window.addEventListener("pageshow", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handleVisibility);
      window.removeEventListener("pageshow", handleVisibility);
    };
  }, []);
  useEffect(() => {
    setMoreMenuOpen(false);
  }, [page]);
  // Only elimination resets the clock here; a fresh new game/tournament resets it
  // explicitly in start() instead. That way merely returning to an in-progress
  // table (e.g. after a page refresh, which always lands back on the lobby first)
  // resumes the accumulated time rather than zeroing it.
  useEffect(() => {
    if (tableEliminated && !prevTableEliminated.current) resetTableTimer();
    prevTableEliminated.current = tableEliminated;
  }, [tableEliminated]);
  useEffect(() => {
    const st = tableTimerState.current;
    if (tableTimerRunning) {
      if (st.runningSinceMs == null) {
        tableTimerState.current = { ...st, runningSinceMs: Date.now() };
        saveTableTimer(tableTimerState.current);
      }
    } else if (st.runningSinceMs != null) {
      const accumulatedMs = st.accumulatedMs + (Date.now() - st.runningSinceMs);
      tableTimerState.current = { accumulatedMs, runningSinceMs: null };
      saveTableTimer(tableTimerState.current);
      setTableSeconds(Math.floor(accumulatedMs / 1000));
    }
  }, [tableTimerRunning]);
  useEffect(() => {
    if (!tableTimerRunning) return;
    const id = setInterval(() => {
      setTableSeconds(Math.floor(elapsedTableMs(tableTimerState.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [tableTimerRunning]);
  const [showFireworks, setShowFireworks] = useState(false);
  const fireworksTimer = useRef<number | null>(null);
  const prevTournamentRound = useRef(t?.round);
  const localPlayerInTournament = t?.field.some((player) => player.id === -1) ?? false;
  const triggerFireworks = (durationMs: number) => {
    setShowFireworks(true);
    if (fireworksTimer.current) window.clearTimeout(fireworksTimer.current);
    fireworksTimer.current = window.setTimeout(() => setShowFireworks(false), durationMs);
  };
  // Watch the resulting round state so synchronous advancement, background-table
  // completion, and tie-breaks share one trigger. Completion by itself is not an
  // advancement, and should not launch fireworks.
  useEffect(() => {
    const prevRound = prevTournamentRound.current;
    if (
      t &&
      !t.out &&
      !t.complete &&
      localPlayerInTournament &&
      typeof prevRound === "number" &&
      t.round > prevRound
    ) {
      triggerFireworks(5000);
    }
    prevTournamentRound.current = t?.round;
  }, [t?.round, t?.out, t?.complete, localPlayerInTournament]);
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
  const userPlayer = { ...hero, name: data.playerProfile.name.trim() || "本地玩家" };
  const userPlayerRef = useRef(userPlayer);
  userPlayerRef.current = userPlayer;
  useEffect(() => {
    Promise.all([loadSave(), fetch("/characters.json").then((r) => r.json())])
      .then(([saved, chars]) => {
        const restored = saved.tournament?.out && !saved.tournament.complete && !saved.tournament.simulationComplete
          ? { ...saved, tournament: { ...saved.tournament, autoSimulating: true } }
          : saved;
        setData(restored);
        setProfileNameDraft(restored.playerProfile.name);
        setProfileAvatarDraft(restored.playerProfile.avatar);
        setCharacters(chars);
        setReady(true);
      })
      .catch(() => {
        setToast("本地存档读取失败，可导入备份；未覆盖原存档");
        setSaveError(true);
        fetch("/characters.json")
          .then((r) => r.json())
          .then(setCharacters);
        setReady(true);
      });
  }, []);
  useEffect(() => {
    if (!ready) return;

    const checkForNewerSave = () => {
      if (checkSaveRevision() !== getSaveRevision()) {
        markSaveStale();
      }
    };
    const unsubscribe = subscribeToSaveChanges((revision) => {
      if (revision !== getSaveRevision()) {
        markSaveStale();
      }
    });
    window.addEventListener("focus", checkForNewerSave);
    document.addEventListener("visibilitychange", checkForNewerSave);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", checkForNewerSave);
      document.removeEventListener("visibilitychange", checkForNewerSave);
    };
  }, [ready, markSaveStale]);
  useEffect(() => {
    if (!ready || saveError || saveStale) return;
    saveData(data)
      .catch((error) => {
        if (isSaveConflictError(error)) {
          markSaveStale();
          return;
        }
        setSaveError(true);
        setToast("自动保存失败，请导出存档备份");
      });
  }, [data, ready, saveError, saveStale, markSaveStale]);
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
      if (player) { const label = player.last; const type = label.includes("弃牌") ? "fold" : label.includes("全下") ? "allin" : label.includes("加注") ? "raise" : label.includes("跟注") ? "call" : "check"; actionId.current++; setLastAction({ id: actionId.current, player: player.profile.id }); if (["raise", "allin", "call"].includes(type)) { const seatIndex = next.players.indexOf(player); if (seatIndex >= 0) setChipToss({ seat: seatIndex, token: actionId.current }) } playGameSound(type, data.settings.sound) }
    }
    if (top.startsWith("第 ")) setLastAction(null);
    if (next.board.length > (g?.board.length || 0)) playGameSound("deal", data.settings.sound);
    const handEnded = next.done && !g?.done;
    if (handEnded && next.winners.length) { setCelebrationDone(false); playGameSound("win", data.settings.sound) }
    setData((old) => {
      const ended = next.done && !old.game?.done;
      const memories = { ...old.memories };
      if (ended) {
        const handLog = next.log.slice(0, next.log.findIndex((x) => x.startsWith("第 ")) + 1);
        next.players.filter((p) => p.cards.length === 2 && p.profile.id !== -1).forEach((p) => { memories[p.profile.id] = [...handLog, ...(memories[p.profile.id] || [])].slice(0, 60) });
      }
      let tournament = old.tournament;
      if (ended && tournament && tournament.round >= 2 && old.game) {
        const newlyEliminated = next.players
          .map((player, index) => ({
            player,
            startStack: old.game!.players[index].chips,
            index,
          }))
          .filter(({ player, startStack }) => startStack > 0 && player.chips === 0)
          .sort((a, b) => a.startStack - b.startStack || a.index - b.index)
          .map(({ player }) => player.profile);
        if (tournament.round === 2)
          tournament = {
            ...tournament,
            qualificationOut: [...(tournament.qualificationOut || []), ...newlyEliminated].slice(-8),
          };
        else if (tournament.round >= 3)
          tournament = {
            ...tournament,
            finalEliminated: [...(tournament.finalEliminated || []), ...newlyEliminated].slice(-8),
          };
      }
      const updated: Save = {
        ...old,
        game: next,
        tournament,
        memories,
        stats: ended
          ? { ...old.stats, hands: old.stats.hands + 1, wins: old.stats.wins + (next.winners.includes(0) ? 1 : 0) }
          : old.stats,
      };
      return ended ? recordHandResult(updated, next, !!tournament) : updated;
    });
    if (handEnded && next.winners.length) { const timer = window.setTimeout(() => setCelebrationDone(true), 3200); return () => window.clearTimeout(timer) }
  };
  useEffect(() => { if (!g?.done || !g.winners.length) { setCelebrationDone(false); return } setCelebrationDone(false); const timer = window.setTimeout(() => setCelebrationDone(true), 3300); return () => window.clearTimeout(timer) }, [g?.done, g?.hand, g?.result]);
  useEffect(() => {
    if (!g || g.done || g.turn === 0 || paused || page !== "table") return;
    const controller = new AbortController();
    let worker: Worker | undefined;
    const id = setTimeout(async () => {
      const o = observe(g);
      o.memory = (data.memories[o.profile.id] || []).slice(
        0,
        o.profile.level * 10,
      );
      if (t) o.qualify = t.round < 3 ? 4 : 1;
      const fallback = () => {
        worker = new Worker(new URL("./bot.worker.ts", import.meta.url), {
          type: "module",
        });
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
          (o.call >= g.bb * 3 || o.pot >= g.bb * 8))
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
    const worker = new Worker(new URL("./tournament.worker.ts", import.meta.url), { type: "module" });
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
    const worker = new Worker(new URL("./championship.worker.ts", import.meta.url), { type: "module" });
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
        const record = createChampionshipRecord(fullOrder, "played", t.entrants || t.field.length);
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
  }, [ready, page, t?.autoSimulating, t?.simulationComplete, t?.round, g?.hand]);
  useEffect(() => {
    if (g && !g.done) setRaise(legal(g).min);
  }, [g?.turn, g?.current, g?.hand]);
  const profile = (p: Character) => data.overrides[p.id] || p;
  const start = () => {
    generation.current++;
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
    const pausedTournament = newMode === "cash" && data.tournament && data.game && !data.tournament.complete
      ? { game: data.game, tournament: { ...data.tournament, paused: true } }
      : newMode === "tournament" ? undefined : data.pausedTournament;
    setData((d) => {
      const registered = registerMatches(d, entrants, tournament ? entrants.length : 0, !!tournament);
      return {
        ...registered,
        game,
        tournament,
        pausedTournament,
        stats: {
          ...registered.stats,
          tournaments: registered.stats.tournaments + (tournament ? 1 : 0),
        },
      };
    });
    resetTableTimer();
    setPaused(false);
    setPage("table");
    setModal(null);
    setSaveError(false);
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
          : 100,
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
        const actualPlacements = [
          alivePlayers[0].profile,
          ...(t.finalEliminated || []).slice().reverse(),
          ...(t.topTwoOuts || []),
        ].filter((player, index, players) => players.findIndex((other) => other.id === player.id) === index);
        const record = createChampionshipRecord(actualPlacements, "played", t.entrants || 64);
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
      setData((d) => recordAdvancement({
        ...d,
        tournament: d.tournament ? {
          ...d.tournament,
          stacks: { ...(d.tournament.stacks || {}), ...currentGameStacks },
          round,
          field: advancingPlayers,
          results: [...d.tournament.results, `${roundLabel(t.round)} · 晋级`],
        } : null,
        game: startHand(g, Math.min(102400, 100 * 2 ** Math.floor(g.hand / t.pace))),
      }, advancingPlayers, counts[round] || advancingPlayers.length));
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
      setData((d) => ({
        ...d,
        tournament: d.tournament
          ? {
            ...d.tournament,
            stacks: { ...(d.tournament.stacks || {}), ...currentGameStacks },
            playoff: { original, locked, slots: q.slots },
          }
          : null,
        game: newGame([userPlayer, ...q.tied.filter((p) => p.id !== -1)]),
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
      const worker = new Worker(new URL("./tournament.worker.ts", import.meta.url), { type: "module" });
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
    setData(nextSave);
    setProfileNameDraft(nextSave.playerProfile.name);
    setProfileAvatarDraft(nextSave.playerProfile.avatar);
    setImported(null);
    setSaveError(false);
    setPaused(true);
    setPage(nextSave.game ? "table" : "lobby");
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
      setSaveError(true);
      setToast("个人资料保存失败，请导出存档备份后重试");
    } finally {
      setProfileSaving(false);
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
  const overlayOpen = !!(modal || selected || batchOpen || imported || confirmDialog || saveStale);
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
  // so it only recomputes when the underlying data actually changes, and the
  // per-player placement lookup is now a single pass over records instead of one
  // records-scan per player.
  const localPlayerName = data.playerProfile.name.trim() || "本地玩家";
  const leaderboard = useMemo(() => {
    const localPlayer: Character = { ...hero, name: localPlayerName };
    const championshipBonuses = championshipCareerBonuses(data.tournamentRecords);
    const placementById = new Map<number, { champion: number; runnerUp: number; third: number; top8: number }>();
    for (const record of data.tournamentRecords) {
      if (record.mode !== "played") continue;
      for (const standing of record.standings) {
        if (!standing.place) continue;
        const counts = placementById.get(standing.player.id) || { champion: 0, runnerUp: 0, third: 0, top8: 0 };
        counts.top8 += 1;
        if (standing.place === 1) counts.champion += 1;
        else if (standing.place === 2) counts.runnerUp += 1;
        else if (standing.place === 3) counts.third += 1;
        placementById.set(standing.player.id, counts);
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
          placement: placementById.get(player.id) || { champion: 0, runnerUp: 0, third: 0, top8: 0 },
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
  const renderPlayerDirectory = () => {
    return (
      <>
        {page === "settings" ? null : (
          <div className="page-heading">
            <div>
              <h1>每个人，都有自己的底牌。</h1>
              <p className="muted">63 位固定选手，不同的性格，相同的公平规则。</p>
            </div>
            <span className="pill">
              <Sparkles size={14} /> 支持 AI 人物塑造
            </span>
          </div>
        )}
        <div className="batch-bar">
          <span>支持逐个塑造，也可以批量更新选手列表。</span>
          <button onClick={() => setBatchOpen(true)}>
            <Sparkles size={15} />
            批量 AI 塑造
          </button>
        </div>
        <div className="character-grid">
          {characters.map((raw) => {
            const p = profile(raw);
            return (
              <button
                className="character-card"
                key={p.id}
                onClick={() => openPlayerProfile(raw)}
              >
                <Avatar p={p} />
                <span className="character-level">{levels[p.level - 1]}</span>
                <h3>
                  <span>{p.name}</span>
                  <ArrowUpRight className="character-profile-icon" size={15} aria-hidden="true" />
                </h3>
                <span className="style-tag">{p.style}</span>
                <p>{p.bio}</p>
              </button>
            );
          })}
        </div>
      </>
    );
  };
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
          <button
            className="text-button"
            onClick={() => {
              setData((d) => ({ ...d, memories: {} }));
              setToast("公开交手记忆已清除");
            }}
          >
            清除选手交手记忆
          </button>
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
                downloadSave(data);
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
          <div className="lobby lobby-home">
            <div className="lobby-atmosphere" aria-hidden="true">
              <div className="lobby-table">
                <span className="lobby-table-inlay" />
                <span className="lobby-table-mark">摸鱼德州</span>
              </div>
              <div className="lobby-playing-cards">
                <div className="ambient-playing-card"><b>A</b><span>♣</span></div>
                <div className="ambient-playing-card red"><b>K</b><span>♦</span></div>
                <div className="ambient-playing-card"><b>Q</b><span>♠</span></div>
                <div className="ambient-playing-card red"><b>J</b><span>♥</span></div>
                <div className="ambient-playing-card"><b>10</b><span>♣</span></div>
              </div>
              <div className="ambient-card-back"><span>♠</span><i>摸鱼德州</i></div>
              <div className="lobby-chip-stack stack-left"><i /><i /><i /><i /><i /></div>
              <div className="lobby-chip-stack stack-right"><i /><i /><i /><i /><i /></div>
              <div className="ambient-loose-chip chip-gold">500</div>
              <div className="ambient-loose-chip chip-red">100</div>
            </div>
            <div className="lobby-save-note">
              <div>随时退出！随时关闭！实时保存！</div>
              <div>只保存本地，可下载存档，上传恢复</div>
            </div>
            <div className="mode-grid">
              <div className="mode-card-wrap">
                <div
                  className="mode-card home-mode-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => openNew("cash")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openNew("cash");
                    }
                  }}
                >
                  <div className="mode-title-row">
                    <h3>单次赛</h3>
                    <button
                      type="button"
                      className="mode-details-button"
                      aria-label="查看单次赛说明"
                      title="查看单次赛说明"
                      onClick={(event) => {
                        event.stopPropagation();
                        openModeDetails("cash");
                      }}
                    >
                      <Info size={15} />
                    </button>
                  </div>
                  <p>开启一场独立牌局，与电脑选手对战。</p>
                  <div className="mode-footer"><span>2–8 人牌桌 · 难度自选</span><ArrowUpRight size={20} /></div>
                </div>
              </div>
              <div className="mode-card-wrap">
                <div
                  className="mode-card competition home-mode-card"
                  role="button"
                  tabIndex={0}
                  onClick={enterChampionship}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      enterChampionship();
                    }
                  }}
                >
                  <div className="mode-title-row">
                    <h3>冠军之路</h3>
                    <button
                      type="button"
                      className="mode-details-button"
                      aria-label="查看冠军赛说明"
                      title="查看冠军赛说明"
                      onClick={(event) => {
                        event.stopPropagation();
                        openModeDetails("tournament");
                      }}
                    >
                      <Info size={15} />
                    </button>
                  </div>
                  <p>{(t || data.pausedTournament?.tournament) && !(t || data.pausedTournament?.tournament)?.complete ? (t || data.pausedTournament?.tournament)?.out ? "你已出局，剩余选手正在自动模拟。" : `继续你的比赛 · ${roundLabel((t || data.pausedTournament?.tournament)!.round)}` : "多桌同时开赛，依次经过首轮、次轮、半决赛和总决赛。"}</p>
                  <div className="mode-footer"><span>{(t || data.pausedTournament?.tournament)?.complete ? "查看本届结果" : (t || data.pausedTournament?.tournament)?.out ? "查看实时模拟进度" : (t || data.pausedTournament?.tournament) ? "冠军赛已暂停 · 点击继续" : "同时模拟其他牌桌 · 逐轮晋级"}</span><ArrowUpRight size={20} /></div>
                </div>
              </div>
            </div>
          </div>
        ) : page === "table" && g ? (
          <div className="table-page">
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
            <div className="table-stage" ref={tableStageRef}>
              <div className="table-context-watermark">
                <strong>{tableRoundLabel}</strong>
                <span>第 {g.hand} 手</span>
              </div>
              <Suspense fallback={null}>
                <Table3D potValue={pot(g)} done={g.done} winnerIndices={g.winners} playerCount={g.players.length} chipToss={chipToss} />
              </Suspense>
              <div className="community">
                <div className="pot-label">
                  {g.done ? "已派奖" : "底池总额"}{" "}
                  <b>{pot(g).toLocaleString()}</b>
                </div>
                <div className="board-cards">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Card
                      key={`${g.hand}-${i}-${g.board[i]}`}
                      value={g.board[i]}
                      style={
                        g.board[i] !== undefined
                          ? { animationDelay: `${i * 90}ms` }
                          : undefined
                      }
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
                const seatPosition = getTableSeatPosition(g.players.length, i, tableStageSize);
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
                    <div className="seat-cards">
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
                            className={"winner-confetti-piece " + (index % 4 === 0 ? "round" : "")}
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
                      <Avatar p={p.profile} playerAvatar={data.playerProfile.avatar} />
                      {championshipWinCount(data.tournamentRecords, p.profile.id) > 0 ? (
                        <i className="seat-champion-badge" aria-label="冠军" title="冠军">
                          <Crown size={9} />
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
                    <div className="seat-action">
                      {!p.last && !g.done && g.turn === i
                        ? i === 0
                          ? "轮到你行动"
                          : (
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
                          )
                        : !p.last ? p.profile.style : ""}
                    </div>
                    {g.done && show && g.board.length === 5 ? (
                      <small className="hand-name">
                        {evaluate([...p.cards, ...g.board]).name}
                      </small>
                    ) : null}
                  </div>
                );
              })}
              {g.done && g.winners.length && !celebrationDone ? <><div className="victory-flash" /><div className="winner-banner"><small>{g.winners.length > 1 ? "POT SPLIT · 底池平分" : "POT AWARDED · 底池归属"}</small><strong>{g.winners.map(i => g.players[i].profile.name).join(" & ")}{g.winners.length === 1 ? " 赢下底池" : ""}</strong><span>{g.winners.map(i => Math.max(0, g.players[i].chips - g.players[i].start + g.players[i].total).toLocaleString()).join(" / ")} 筹码到账</span></div></> : null}
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
                      {t?.complete ? <strong>{t.out ? "冠军赛模拟完成，最终冠军已产生" : "恭喜，你赢得了本届冠军！"}</strong> : t?.out ? <strong>你已出局，正在模拟其余比赛…</strong> : <div className="hand-winners">{g.winners.map(i => { const winner = g.players[i]; const amount = Math.max(0, winner.chips - winner.start + winner.total); return <div className="hand-winner" key={winner.profile.id}><Avatar p={winner.profile} playerAvatar={data.playerProfile.avatar} /><span><small>{g.winners.length > 1 ? "底池赢家" : "本手赢家"}</small><b>{winner.profile.name}</b></span><strong>+{amount.toLocaleString()}</strong>{g.board.length === 5 ? <em>{evaluate([...winner.cards, ...g.board]).name}</em> : null}</div> })}</div>}
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
                        disabled={busy || (alive <= 1 && !t)}
                        onClick={nextHand}
                      >
                        {busy
                          ? "请稍候…"
                          : canAdvance && t
                            ? "确认晋级"
                            : g.players[0].chips === 0
                              ? "结算比赛"
                              : "下一手"}
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
          </div>
        ) : page === "settings" ? (
          <div className="content-page settings-page">
            <aside className="settings-menu" aria-label="设置菜单">
              <h1>设置</h1>
              <button
                className={settingsSection === "ai" ? "active" : ""}
                aria-current={settingsSection === "ai" ? "page" : undefined}
                onClick={() => setSettingsSection("ai")}
              >
                <Sparkles size={17} /> AI 设置
              </button>
              <button
                className={settingsSection === "players" ? "active" : ""}
                aria-current={settingsSection === "players" ? "page" : undefined}
                onClick={() => setSettingsSection("players")}
              >
                <Users size={17} /> 电脑选手
              </button>
              <button
                className={settingsSection === "profile" ? "active" : ""}
                aria-current={settingsSection === "profile" ? "page" : undefined}
                onClick={() => setSettingsSection("profile")}
              >
                <UserRound size={17} /> 个人资料
              </button>
            </aside>
            <section className="settings-panel">
              {settingsSection === "ai"
                ? aiSettingsContent
                : settingsSection === "players"
                  ? renderPlayerDirectory()
                  : profileSettingsContent}
            </section>
          </div>
        ) : page === "players" ? (
          <div className="content-page">
            {renderPlayerDirectory()}
          </div>
        ) : page === "tournament" ? (
          <div className={`content-page${t?.complete ? " championship-complete-page" : ""}`}>
            <div className="page-heading championship-heading">
              <div>
                <h1>冠军赛</h1>
                <p className="muted">
                  {t?.complete
                    ? "本届赛事已结束，以下为最终名次。"
                    : "64 位选手同时分桌比赛，晋级选手带着当前筹码进入下一轮。"}
                </p>
              </div>
              <div className="championship-actions">
                <button
                  className="gold-button"
                  onClick={() => {
                    if (t?.complete) openNew("tournament");
                    else enterChampionship();
                  }}
                >
                  {t?.out && !t.simulationComplete ? "查看模拟进度" : t?.complete ? "再开一届" : t ? "返回比赛" : "亲自参赛"}
                  <ArrowUpRight size={17} />
                </button>
              </div>
            </div>
            {t?.complete ? (
              <>
                {completedStandings.length ? (
                  <section className="championship-results championship-results-complete" aria-labelledby="championship-results-title">
                    <div className="championship-results-heading">
                      <div>
                        <small>FINAL RESULTS</small>
                        <h2 id="championship-results-title">本届最终名次</h2>
                      </div>
                      <span>总决赛</span>
                    </div>
                    <div className="championship-podium" aria-label="前三名颁奖台">
                      {[1, 0, 2].map((index) => {
                        const player = completedStandings[index];
                        if (!player) return null;
                        const place = index + 1;
                        return (
                          <article className={"podium-place place-" + place} key={player.id}>
                            <div className="podium-player">
                              <span className="podium-award" aria-hidden="true">
                                {place === 1 ? <Trophy size={22} /> : <Medal size={20} />}
                              </span>
                              <Avatar p={player} playerAvatar={data.playerProfile.avatar} />
                              <span className="podium-player-name">
                                <small>第 {place} 名{place === 1 ? " · 冠军" : ""}</small>
                                <strong>{player.id === -1 ? userPlayer.name : player.name}</strong>
                              </span>
                            </div>
                            <div className="podium-step"><b>{String(place).padStart(2, "0")}</b></div>
                          </article>
                        );
                      })}
                    </div>
                    <div className="finalists-list" aria-label="第四至第八名">
                      <div className="finalists-list-heading">
                        <h3>第四至第八名</h3>
                        <span>其余晋级选手</span>
                      </div>
                      <ol start={4}>
                        {completedStandings.slice(3, 8).map((player, index) => (
                          <li key={player.id}>
                            <b className="finalist-rank">{index + 4}</b>
                            <Avatar p={player} playerAvatar={data.playerProfile.avatar} />
                            <strong>{player.id === -1 ? userPlayer.name : player.name}</strong>
                            <span>第 {index + 4} 名</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </section>
                ) : (
                  <section className="championship-results-empty" role="status">
                    <Medal size={24} />
                    <strong>本届赛事已结束</strong>
                    <span>暂时没有可显示的最终排名记录。</span>
                  </section>
                )}
              </>
            ) : (
              <>
                <div className="tournament-summary">
                  <Trophy size={46} />
                  <div>
                    <h2>
                      {t
                        ? t.out
                          ? "你已出局 · 正在模拟剩余赛事"
                          : roundLabel(t.round)
                        : "四轮比赛，一场属于你的征程"}
                    </h2>
                    <p>
                      {t
                        ? `${t.field.length} 位本轮选手 · ${t.results.length} 次晋级${t.background && !t.background.done ? ` · 其他桌剩余 ${t.background.remaining.length} 人` : ""}`
                        : "首轮、次轮和半决赛分桌晋级，最后八人进入总决赛。"}
                    </p>
                  </div>
                  <b>64 <span>→ 1</span></b>
                </div>
                {t?.out && !t.simulationComplete ? (
                  <SimulationProgressPanel
                    progress={eliminatedProgress}
                    label="你出局后的赛事进度"
                    playerAvatar={data.playerProfile.avatar}
                    resumeHint="刷新后会从最近完成的牌桌继续；刷新时正在进行的牌桌会重算。"
                  />
                ) : null}
                <div className="rounds">
                  {rounds.map((name, i) => (
                    <div
                      className={`round ${t && Math.min(t.round, rounds.length - 1) === i ? "current" : ""} ${t && t.round > i ? "passed" : ""}`}
                      key={name}
                    >
                      <div className="round-number">
                        {t && t.round > i ? <Check size={20} /> : String(i + 1).padStart(2, "0")}
                      </div>
                      <div>
                        <small>{i < 3 ? "分组晋级" : "冠军桌"}</small>
                        <h3>{name}</h3>
                      </div>
                      <span>{counts[i]} 人</span>
                      <ChevronRight size={18} />
                    </div>
                  ))}
                </div>
                <div className="records-teaser">
                  <span><Medal size={16} /> 已保存 <b>{data.tournamentRecords.length}</b> 届赛事</span>
                  <button onClick={() => setPage("leaderboard")}>查看积分榜 <ChevronRight size={15} /></button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="content-page leaderboard-page">
            <div className="page-heading leaderboard-heading">
              <div>
                <h1>冠军积分榜</h1>
              </div>
              <div className="championship-count" aria-label={`已进行冠军赛 ${data.stats.tournaments} 次`}>
                <small>已进行冠军赛</small>
                <strong>{data.stats.tournaments} 次</strong>
              </div>
            </div>
            <div className="leaderboard-summary career-summary">
              <div><small>我的排名</small><strong>第 {localRank} 名 / {leaderboard.length} 位</strong></div>
              <button
                type="button"
                className="career-summary-rule"
                onClick={() => setModal("points")}
                aria-label="计分规则 · 点击查看详细说明"
              >
                <span className="career-summary-rule-label">
                  <small>计分规则</small>
                  <Info size={13} aria-hidden="true" />
                </span>
                <strong>赢手 +0.1 · 冠军 +20</strong>
              </button>
            </div>
            <section
              className="leaderboard-card"
              aria-label="所有选手积分与战绩"
              ref={leaderboardScrollRef}
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
            >
              <div className="leaderboard-head">
                <span>排名 · 选手</span><span>积分</span><span>最佳成绩</span><span>比赛</span>
                <span>晋级</span><span>赢手</span><span>最高筹码</span>
              </div>
              <div className="leaderboard-body">
                <LeaderboardRows
                  rows={leaderboard}
                  playerAvatar={data.playerProfile.avatar}
                  userPlayerName={userPlayer.name}
                  localRowRef={localLeaderboardRow}
                  onSelect={selectLeaderboardPlayer}
                />
              </div>
            </section>
            <div className="leaderboard-floating-actions">
              {leaderboardScrolled ? (
                <button
                  type="button"
                  className="leaderboard-scroll-top"
                  aria-label="滚动到顶部"
                  onClick={() => leaderboardScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                >
                  <ArrowUp size={17} />
                </button>
              ) : null}
              <button
                type="button"
                className="leaderboard-locate-self"
                aria-label={`定位到我的排名，第 ${localRank} 名`}
                onClick={() => localLeaderboardRow.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                  inline: "nearest",
                })}
              >
                <LocateFixed size={17} />
                <span>定位自己</span>
                <b>第 {localRank} 名</b>
              </button>
            </div>
          </div>
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
                    64 人 · 多桌同时模拟 · 晋级时保留你的现有筹码；出局后快速模拟至冠军产生。
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
                {newMode === "tournament" ? (
                  <label>
                    比赛节奏
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
                  <li>起始筹码统一为 10,000，不设晋级流程。</li>
                </ul>
              </>
            ) : modal === "tournament-details" ? (
              <>
                <h2>冠军赛说明</h2>
                <ul className="mode-details-list">
                  <li>64 人分桌比赛，依次进行首轮、次轮、半决赛和总决赛。</li>
                  <li>前三轮每桌 8 进 4，最后 8 人进入总决赛。</li>
                  <li>前三轮晋级后统一筹码，总决赛保留现有筹码并按 8、6、4、2、1 人推进。</li>
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
                    积分只累计你亲自参与过的冠军赛：完全由系统自动模拟、你未参赛的冠军赛不计分；日常单次现金局的手数只计入"手数"战绩，不计入积分。
                  </p>
                  <p>
                    赢下一手牌 <strong>+0.1</strong> 分——包括你亲自坐镇的牌桌，以及冠军赛期间你出局后系统代打的其他牌桌。
                  </p>
                  <p>冠军赛结束时，按最终名次一次性发放名次分：</p>
                  <div className="points-rule-chart" aria-label="名次积分对照表">
                    {[
                      { label: "冠军", points: 20 },
                      { label: "亚军", points: 15 },
                      { label: "季军（第 3 名）", points: 12 },
                      { label: "第 4 名", points: 11 },
                      { label: "第 5 名", points: 10 },
                      { label: "第 6 名", points: 9 },
                      { label: "第 7 名", points: 8 },
                      { label: "第 8 名", points: 7 },
                      { label: "第 9 名及以后", points: 0 },
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
            <p className="eyebrow">
              {selectedCurrent.id === -1
                ? "本人战绩"
                : `PLAYER ${String(selectedCurrent.id + 1).padStart(3, "0")}`}
            </p>
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
              <button onClick={() => downloadSave(data)}>备份当前存档</button>
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
              另一个标签页已经更新了本地存档。请刷新页面后继续操作。
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
      <Fireworks active={showFireworks} />
    </div>
  );
}
