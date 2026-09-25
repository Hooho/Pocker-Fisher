import {
  hero,
  newGame,
  type Character,
  type Game,
} from "../../domain/game/engine";
import {
  blank,
  type Save,
  type Tournament,
} from "../../domain/storage/storage";

const FIXTURE_TIME = "2026-01-01T00:00:00.000Z";

export type GameplayFixture = {
  id: string;
  description: string;
  save: Save;
  expected: {
    mode: "cash" | "championship";
    heroAlive: boolean;
    gameDone: boolean;
    tournamentRound?: number;
    tournamentField?: number;
    tournamentComplete?: boolean;
    playerOut?: boolean;
    eliminatedInCurrentHand?: number;
  };
};

function makeCharacters(count: number): Character[] {
  return [
    hero,
    ...Array.from({ length: Math.max(0, count - 1) }, (_, index) => ({
      ...hero,
      id: index,
      name: `测试选手 ${index + 1}`,
    })),
  ];
}

function finishGame(game: Game, winnerIndex: number): Game {
  const totalStack = game.players.reduce((sum, player) => sum + player.start, 0);
  return {
    ...game,
    players: game.players.map((player, index) => ({
      ...player,
      chips: index === winnerIndex ? totalStack : 0,
      bet: 0,
      total: 0,
      folded: index !== winnerIndex,
      acted: true,
      last: index === winnerIndex ? "获胜" : "淘汰",
    })),
    board: [],
    current: 0,
    minRaise: game.bb,
    street: 0,
    done: true,
    result: "牌局结束",
    winners: [winnerIndex],
  };
}

function tournamentState({
  round,
  fieldSize,
  game,
  out = false,
  complete = false,
  background = round < 3,
  finalEliminated,
  playoff,
}: {
  round: number;
  fieldSize: number;
  game: Game;
  out?: boolean;
  complete?: boolean;
  background?: boolean;
  finalEliminated?: Character[];
  playoff?: Tournament["playoff"];
}): Save {
  const field = makeCharacters(fieldSize);
  const remaining = background ? field.slice(8) : [];
  const tournament: Tournament = {
    round,
    field,
    entrants: 64,
    resetStacksEachRound: false,
    seed: 20260101,
    pace: 5,
    out,
    paused: false,
    autoSimulating: out,
    simulationComplete: complete,
    complete,
    results: [],
    ...(background
      ? { background: { remaining, qualified: [], done: remaining.length === 0 } }
      : {}),
    ...(round >= 3 ? { finalists: field.slice(0, 8) } : {}),
    ...(finalEliminated ? { finalEliminated } : {}),
    ...(playoff ? { playoff } : {}),
    ...(complete ? { finalStandings: field.slice(0, 8) } : {}),
  };

  return {
    ...blank,
    savedAt: FIXTURE_TIME,
    game,
    tournament,
    activeMatch: {
      id: `fixture-championship-${round}`,
      mode: "championship",
      entrants: 64,
      difficulty: 3,
    },
  };
}

function championshipGame(fieldSize: number, done = false, heroWins = true) {
  const players = makeCharacters(fieldSize);
  const game = newGame(players, 100);
  return done ? finishGame(game, heroWins ? 0 : 1) : game;
}

const cashStart2p = newGame(makeCharacters(2), 100);
const cashStart8p = newGame(makeCharacters(8), 100);
const cashSidePot = finishGame(
  newGame(makeCharacters(3), 100, [10_000, 5_000, 2_000]),
  0,
);
const cashPlayerWin = finishGame(newGame(makeCharacters(4), 100), 0);
const cashPlayerEliminated = finishGame(newGame(makeCharacters(4), 100), 1);

const roundOneField = makeCharacters(64);
const roundOneGame = newGame(roundOneField.slice(0, 8), 100);
const roundOneOutGame = finishGame(roundOneGame, 1);
const roundOnePlayoffGame = newGame(roundOneField.slice(0, 3), 100);

const finalEightField = makeCharacters(8);
const finalSevenOutGame = finishGame(newGame(finalEightField, 100), 0);
const finalSevenEliminated = finalEightField.slice(1);

export const gameplayFixtures: GameplayFixture[] = [
  {
    id: "cash-start-2p",
    description: "单次赛两人刚开局",
    save: { ...blank, savedAt: FIXTURE_TIME, game: cashStart2p },
    expected: { mode: "cash", heroAlive: true, gameDone: false },
  },
  {
    id: "cash-start-8p",
    description: "单次赛八人刚开局",
    save: { ...blank, savedAt: FIXTURE_TIME, game: cashStart8p },
    expected: { mode: "cash", heroAlive: true, gameDone: false },
  },
  {
    id: "cash-side-pot",
    description: "单次赛不同筹码玩家结算主池和边池",
    save: { ...blank, savedAt: FIXTURE_TIME, game: cashSidePot },
    expected: { mode: "cash", heroAlive: true, gameDone: true },
  },
  {
    id: "cash-player-win",
    description: "单次赛玩家赢下牌局",
    save: { ...blank, savedAt: FIXTURE_TIME, game: cashPlayerWin },
    expected: { mode: "cash", heroAlive: true, gameDone: true },
  },
  {
    id: "cash-player-eliminated",
    description: "单次赛玩家被淘汰",
    save: { ...blank, savedAt: FIXTURE_TIME, game: cashPlayerEliminated },
    expected: { mode: "cash", heroAlive: false, gameDone: true },
  },
  {
    id: "championship-round-1-alive",
    description: "冠军赛首轮进行中，玩家仍在牌桌",
    save: tournamentState({ round: 0, fieldSize: 64, game: roundOneGame }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: false,
      tournamentRound: 0,
      tournamentField: 64,
      playerOut: false,
    },
  },
  {
    id: "championship-round-1-out",
    description: "冠军赛首轮玩家被淘汰并进入后台模拟",
    save: tournamentState({ round: 0, fieldSize: 64, game: roundOneOutGame, out: true }),
    expected: {
      mode: "championship",
      heroAlive: false,
      gameDone: true,
      tournamentRound: 0,
      tournamentField: 64,
      playerOut: true,
    },
  },
  {
    id: "championship-round-1-playoff",
    description: "首轮晋级边界同筹码，进入附加赛",
    save: tournamentState({
      round: 0,
      fieldSize: 64,
      game: roundOnePlayoffGame,
      playoff: {
        original: roundOneGame,
        locked: roundOneField.slice(3, 5),
        slots: 2,
      },
    }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: false,
      tournamentRound: 0,
      tournamentField: 64,
      playerOut: false,
    },
  },
  {
    id: "championship-round-2-alive",
    description: "冠军赛次轮进行中",
    save: tournamentState({ round: 1, fieldSize: 32, game: championshipGame(8) }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: false,
      tournamentRound: 1,
      tournamentField: 32,
      playerOut: false,
    },
  },
  {
    id: "championship-round-2-out",
    description: "冠军赛次轮玩家被淘汰",
    save: tournamentState({ round: 1, fieldSize: 32, game: finishGame(championshipGame(8), 1), out: true }),
    expected: {
      mode: "championship",
      heroAlive: false,
      gameDone: true,
      tournamentRound: 1,
      tournamentField: 32,
      playerOut: true,
    },
  },
  {
    id: "championship-semifinal-alive",
    description: "冠军赛半决赛进行中",
    save: tournamentState({ round: 2, fieldSize: 16, game: championshipGame(8) }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: false,
      tournamentRound: 2,
      tournamentField: 16,
      playerOut: false,
    },
  },
  {
    id: "championship-semifinal-out",
    description: "冠军赛半决赛玩家被淘汰",
    save: tournamentState({ round: 2, fieldSize: 16, game: finishGame(championshipGame(8), 1), out: true }),
    expected: {
      mode: "championship",
      heroAlive: false,
      gameDone: true,
      tournamentRound: 2,
      tournamentField: 16,
      playerOut: true,
    },
  },
  {
    id: "final-table-8",
    description: "冠军桌刚开始，八强在桌",
    save: tournamentState({ round: 3, fieldSize: 8, game: championshipGame(8) }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: false,
      tournamentRound: 3,
      tournamentField: 8,
      playerOut: false,
    },
  },
  {
    id: "final-table-seven-eliminated",
    description: "冠军桌一手牌淘汰七人",
    save: tournamentState({
      round: 3,
      fieldSize: 8,
      game: finalSevenOutGame,
      finalEliminated: finalSevenEliminated,
    }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: true,
      tournamentRound: 3,
      tournamentField: 8,
      playerOut: false,
      eliminatedInCurrentHand: 7,
    },
  },
  {
    id: "final-table-6",
    description: "冠军桌剩六人",
    save: tournamentState({ round: 4, fieldSize: 6, game: championshipGame(6) }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: false,
      tournamentRound: 4,
      tournamentField: 6,
      playerOut: false,
    },
  },
  {
    id: "final-table-4",
    description: "冠军桌剩四人",
    save: tournamentState({ round: 5, fieldSize: 4, game: championshipGame(4) }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: false,
      tournamentRound: 5,
      tournamentField: 4,
      playerOut: false,
    },
  },
  {
    id: "final-table-2",
    description: "冠军桌进入单挑",
    save: tournamentState({ round: 6, fieldSize: 2, game: championshipGame(2) }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: false,
      tournamentRound: 6,
      tournamentField: 2,
      playerOut: false,
    },
  },
  {
    id: "final-table-player-out",
    description: "玩家在冠军桌被淘汰，剩余比赛自动模拟",
    save: tournamentState({
      round: 5,
      fieldSize: 4,
      game: finishGame(championshipGame(4), 1),
      out: true,
    }),
    expected: {
      mode: "championship",
      heroAlive: false,
      gameDone: true,
      tournamentRound: 5,
      tournamentField: 4,
      playerOut: true,
    },
  },
  {
    id: "championship-complete",
    description: "冠军赛已产生冠军",
    save: tournamentState({
      round: 6,
      fieldSize: 8,
      game: finishGame(newGame(makeCharacters(2)), 0),
      complete: true,
      background: false,
    }),
    expected: {
      mode: "championship",
      heroAlive: true,
      gameDone: true,
      tournamentRound: 6,
      tournamentField: 8,
      tournamentComplete: true,
      playerOut: false,
    },
  },
];
