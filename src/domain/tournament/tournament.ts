import {
  newGame,
  startHand,
  act,
  decide,
  observe,
  type Game,
  type Character,
  type Observation,
} from "../game/engine";
export type SimulatedTablePlayer = {
  profile: Character;
  chips: number;
  eliminated: boolean;
};
export type TableSimulationProgress = {
  hand: number;
  players: SimulatedTablePlayer[];
  performance: SimulatedTablePerformance;
};
export type SimulatedTablePerformance = {
  handsWon: Record<string, number>;
  highestChips: Record<string, number>;
};
export type SimulatedTableResult = {
  qualified: Character[];
  stacks: Record<string, number>;
};
export type SimulationPlayerStats = {
  handsWon: number;
  highestChips: number;
  advances: number;
  bestPlace: number;
};
export type SimulationPlayerStatsMap = Record<string, SimulationPlayerStats>;
export type ChampionshipSimulationCheckpoint = {
  round: number;
  field: Character[];
  advancing: Character[];
  nextTableIndex: number;
  performance?: SimulationPlayerStatsMap;
};
export type ChampionshipSimulationProgress = {
  round: number;
  completedTables: number;
  totalTables: number;
  activeTable?: TableSimulationProgress;
  checkpoint?: ChampionshipSimulationCheckpoint;
  performance?: SimulationPlayerStatsMap;
};
export const pointsForPlace = (place: number) =>
  place === 1 ? 20 : place === 2 ? 15 : place >= 3 && place <= 8 ? 15 - place : 0;
export function championshipStandings(players: Character[]) {
  return players.slice(0, 8).map((player, index) => ({
    place: index + 1,
    player,
    points: pointsForPlace(index + 1),
  }));
}
export function championshipCareerBonuses(
  records: Array<{
    mode?: "played" | "simulated";
    standings: Array<{ place: number; player: Character; points: number }>;
  }>,
) {
  const bonuses: Record<string, { pointsTenths: number; bestPlace: number }> = {};
  for (const record of records) {
    // Purely simulated championships (no real hand ever played) do not count
    // toward the career score, so it always reflects events you actually took part in.
    if (record.mode === "simulated") continue;
    for (const standing of record.standings) {
      const id = String(standing.player.id);
      const current = bonuses[id] || { pointsTenths: 0, bestPlace: 0 };
      bonuses[id] = {
        pointsTenths: current.pointsTenths + standing.points * 10,
        bestPlace: current.bestPlace
          ? Math.min(current.bestPlace, standing.place)
          : standing.place,
      };
    }
  }
  return bonuses;
}
/** Equal starting stacks at an elimination boundary require a playoff. */
export function qualification(game: Game, slots: number) {
  const ranked = [...game.players].sort(
    (a, b) => b.chips - a.chips || b.start - a.start,
  );
  const boundary = ranked[slots - 1];
  const after = ranked[slots];
  if (
    boundary &&
    after &&
    boundary.chips === 0 &&
    after.chips === 0 &&
    boundary.start === after.start
  ) {
    const locked = ranked
      .filter((p) => p.chips > 0 || p.start > boundary.start)
      .map((p) => p.profile);
    const tied = ranked
      .filter((p) => p.chips === 0 && p.start === boundary.start)
      .map((p) => p.profile);
    return { locked, tied, slots: slots - locked.length };
  }
  return {
    locked: ranked.slice(0, slots).map((p) => p.profile),
    tied: [] as Character[],
    slots: 0,
  };
}

/** Returns players eliminated by this completed hand, in elimination order. */
export function eliminatedProfiles(game: Game): Character[] {
  return game.players
    .map((player, index) => ({ player, startStack: player.start, index }))
    .filter(({ player, startStack }) => startStack > 0 && player.chips === 0)
    .sort((a, b) => a.startStack - b.startStack || a.index - b.index)
    .map(({ player }) => player.profile);
}

export function simulateTable(
  profiles: Character[],
  slots: number,
  pace: number,
  onProgress?: (progress: TableSimulationProgress) => void,
): Character[] {
  return simulateTableWithStacks(profiles, slots, pace, onProgress).qualified;
}
export function simulateTableWithStacks(
  profiles: Character[],
  slots: number,
  pace: number,
  onProgress?: (progress: TableSimulationProgress) => void,
  startingStacks?: number[],
): SimulatedTableResult {
  return simulateTableInternal(profiles, slots, pace, onProgress, {
    handsWon: {},
    highestChips: {},
  }, startingStacks);
}
function simulateTableInternal(
  profiles: Character[],
  slots: number,
  pace: number,
  onProgress: ((progress: TableSimulationProgress) => void) | undefined,
  performance: SimulatedTablePerformance,
  startingStacks?: number[],
): SimulatedTableResult {
  let game = newGame(profiles, 100, startingStacks);
  let actions = 0;
  let lastRecordedHand = 0;
  const recordStackPeaks = () => {
    game.players.forEach((player) => {
      const id = String(player.profile.id);
      const stack = player.chips + (game.done ? 0 : player.total);
      performance.highestChips[id] = Math.max(performance.highestChips[id] || 0, stack);
    });
  };
  const reportProgress = () => {
    recordStackPeaks();
    if (game.done && game.hand > lastRecordedHand) {
      game.winners.forEach((index) => {
        const id = String(game.players[index]?.profile.id);
        if (id !== "undefined") performance.handsWon[id] = (performance.handsWon[id] || 0) + 1;
      });
      lastRecordedHand = game.hand;
    }
    onProgress?.({
      hand: game.hand,
      players: game.players.map((player) => ({
        profile: player.profile,
        chips: player.chips,
        eliminated: player.chips === 0 && (game.done || player.folded),
      })),
      performance: {
        handsWon: { ...performance.handsWon },
        highestChips: { ...performance.highestChips },
      },
    });
  };
  reportProgress();
  while (!game.done || game.players.filter((p) => p.chips > 0).length > slots) {
    if (++actions > 100000) throw new Error("牌局模拟超时");
    if (game.done) {
      game = startHand(
        game,
        Math.min(102400, 100 * 2 ** Math.floor(game.hand / pace)),
      );
      recordStackPeaks();
      if (game.hand % 3 === 0) reportProgress();
    } else {
      const o = observe(game);
      o.qualify = slots;
      game = act(game, simulatedMove(o));
      recordStackPeaks();
      if (game.done || actions % 24 === 0) reportProgress();
    }
  }
  const result = qualification(game, slots);
  const lockedStacks = Object.fromEntries(
    result.locked.map((profile) => [
      String(profile.id),
      game.players.find((player) => player.profile.id === profile.id)?.chips ?? 0,
    ]),
  );
  if (!result.tied.length) {
    return { qualified: result.locked, stacks: lockedStacks };
  }
  const tieResult = simulateTableInternal(
    result.tied,
    result.slots,
    pace,
    onProgress,
    performance,
  );
  return {
    qualified: [...result.locked, ...tieResult.qualified],
    stacks: { ...lockedStacks, ...tieResult.stacks },
  };
}

function simulatedMove(observation: Observation) {
  const move = decide(observation, { fast: true });
  if (
    !observation.canRaise ||
    move.type === "fold" ||
    move.type === "raise" ||
    Math.random() < 0.15
  )
    return move;
  const raiseBy = Math.max(
    observation.bb,
    Math.round(
      ((observation.pot + observation.call) * 0.45) / observation.bb,
    ) * observation.bb,
  );
  return {
    type: "raise" as const,
    amount: Math.min(
      observation.max,
      Math.max(observation.min, observation.min + raiseBy),
    ),
  };
}

/** Returns a full table ranking, including the order players are eliminated. */
export function simulateTableRanking(
  profiles: Character[],
  pace: number,
  onProgress?: (progress: TableSimulationProgress) => void,
): Character[] {
  let game = newGame(profiles);
  const performance: SimulatedTablePerformance = { handsWon: {}, highestChips: {} };
  const eliminated: Character[] = [];
  const eliminatedIds = new Set<number>();
  const recordBlindEliminations = (current: Game) => {
    const busted = current.players
      .filter(
        (player) =>
          player.start > 0 &&
          player.chips === 0 &&
          !eliminatedIds.has(player.profile.id),
      )
      .sort((a, b) => a.start - b.start);
    for (const player of busted) {
      eliminated.push(player.profile);
      eliminatedIds.add(player.profile.id);
    }
  };
  // startHand posts blinds immediately, which can eliminate a short stack
  // before the first action of a hand.
  recordBlindEliminations(game);
  let handStart = game;
  let actions = 0;
  let lastRecordedHand = 0;
  const recordStackPeaks = () => {
    game.players.forEach((player) => {
      const id = String(player.profile.id);
      const stack = player.chips + (game.done ? 0 : player.total);
      performance.highestChips[id] = Math.max(performance.highestChips[id] || 0, stack);
    });
  };
  const reportProgress = () => {
    recordStackPeaks();
    if (game.done && game.hand > lastRecordedHand) {
      game.winners.forEach((index) => {
        const id = String(game.players[index]?.profile.id);
        if (id !== "undefined") performance.handsWon[id] = (performance.handsWon[id] || 0) + 1;
      });
      lastRecordedHand = game.hand;
    }
    onProgress?.({
      hand: game.hand,
      players: game.players.map((player) => ({
        profile: player.profile,
        chips: player.chips,
        eliminated: player.chips === 0 && (game.done || player.folded),
      })),
      performance: {
        handsWon: { ...performance.handsWon },
        highestChips: { ...performance.highestChips },
      },
    });
  };
  reportProgress();

  while (
    !game.done ||
    game.players.filter((player) => player.chips > 0).length > 1
  ) {
    if (++actions > 100000) throw new Error("牌局模拟超时");
    if (game.done) {
      game = startHand(
        game,
        Math.min(102400, 100 * 2 ** Math.floor(game.hand / pace)),
      );
      recordStackPeaks();
      handStart = game;
      recordBlindEliminations(game);
      if (game.hand % 3 === 0) reportProgress();
      continue;
    }

    const previous = game;
    const view = observe(game);
    game = act(game, simulatedMove(view));
    recordStackPeaks();
    if (game.done || actions % 24 === 0) reportProgress();
    if (game.done) {
      const busted = game.players
        .map((player, index) => ({
          player,
          startingStack: handStart.players[index].start,
          chipsAtActionStart: handStart.players[index].chips,
          index,
        }))
        .filter(
          ({ player, chipsAtActionStart }) =>
            chipsAtActionStart > 0 && player.chips === 0,
        )
        .sort((a, b) => a.startingStack - b.startingStack || a.index - b.index);
      for (const { player } of busted) {
        if (!eliminatedIds.has(player.profile.id)) {
          eliminated.push(player.profile);
          eliminatedIds.add(player.profile.id);
        }
      }
    }
    if (previous === game) throw new Error("牌局模拟无进展");
  }

  const winner = game.players.find((player) => player.chips > 0)?.profile;
  const unranked = profiles.filter(
    (player) =>
      player.id !== winner?.id && !eliminatedIds.has(player.id),
  );
  // Keep any defensive fallbacks at the bottom of the ranking.
  const fullEliminationOrder = [...unranked, ...eliminated].reverse();
  return winner ? [winner, ...fullEliminationOrder] : fullEliminationOrder;
}

export type ChampionshipSimulationResult = {
  standings: Character[];
  performance: SimulationPlayerStatsMap;
};

function ensurePlayerStats(stats: SimulationPlayerStatsMap, id: number, bestPlace: number) {
  const key = String(id);
  return stats[key] ?? (stats[key] = {
    handsWon: 0,
    highestChips: 10000,
    advances: 0,
    bestPlace,
  });
}

function mergeTablePerformance(
  totals: SimulationPlayerStatsMap,
  seen: SimulatedTablePerformance,
  latest: SimulatedTablePerformance,
  bestPlace: number,
) {
  for (const [id, handsWon] of Object.entries(latest.handsWon)) {
    const player = ensurePlayerStats(totals, Number(id), bestPlace);
    const delta = handsWon - (seen.handsWon[id] || 0);
    if (delta > 0) player.handsWon += delta;
    seen.handsWon[id] = handsWon;
  }
  for (const [id, chips] of Object.entries(latest.highestChips)) {
    const player = ensurePlayerStats(totals, Number(id), bestPlace);
    player.highestChips = Math.max(player.highestChips, chips);
    seen.highestChips[id] = chips;
  }
}

function cloneSimulationStats(stats: SimulationPlayerStatsMap): SimulationPlayerStatsMap {
  return Object.fromEntries(Object.entries(stats).map(([id, value]) => [id, { ...value }]));
}

/** Simulates a full knockout event and returns the remaining field and accumulated statistics. */
export function simulateChampionship(
  entrants: Character[],
  pace: number,
  onProgress?: (progress: ChampionshipSimulationProgress) => void,
  startingRound = 0,
  resumeFrom?: ChampionshipSimulationCheckpoint,
  startingBestPlace = entrants.length,
): ChampionshipSimulationResult {
  let field = resumeFrom?.field ?? entrants;
  let round = resumeFrom?.round ?? startingRound;
  let advancing = resumeFrom?.advancing ?? [];
  let nextTableIndex = resumeFrom?.nextTableIndex ?? 0;
  const performance = cloneSimulationStats(resumeFrom?.performance || {});
  entrants.forEach((player) => ensurePlayerStats(performance, player.id, startingBestPlace));
  if (resumeFrom?.performance) {
    Object.values(performance).forEach((player) => {
      player.highestChips = Math.max(player.highestChips, 10000);
    });
  }

  while (field.length > 8) {
    const totalTables = Math.ceil(field.length / 8);
    for (let tableIndex = nextTableIndex; tableIndex < totalTables; tableIndex++) {
      const offset = tableIndex * 8;
      const table = field.slice(offset, offset + 8);
      const completedTables = tableIndex;
      const seen: SimulatedTablePerformance = { handsWon: {}, highestChips: {} };
      onProgress?.({
        round: round + 1,
        completedTables,
        totalTables,
        activeTable: {
          hand: 0,
          players: table.map((profile) => ({ profile, chips: 10000, eliminated: false })),
          performance: { handsWon: {}, highestChips: {} },
        },
      });
      const qualifiers = simulateTable(table, 4, pace, (activeTable) => {
        mergeTablePerformance(performance, seen, activeTable.performance, field.length);
        onProgress?.({
          round: round + 1,
          completedTables,
          totalTables,
          activeTable,
        });
      });
      advancing.push(...qualifiers);
      qualifiers.forEach((player) => {
        ensurePlayerStats(performance, player.id, field.length).advances++;
      });
      const checkpointPerformance = cloneSimulationStats(performance);
      onProgress?.({
        round: round + 1,
        completedTables: tableIndex + 1,
        totalTables,
        checkpoint: {
          round,
          field,
          advancing: [...advancing],
          nextTableIndex: tableIndex + 1,
          performance: checkpointPerformance,
        },
        performance: checkpointPerformance,
      });
    }
    field = advancing;
    field.forEach((player) => {
      const stats = ensurePlayerStats(performance, player.id, field.length);
      stats.bestPlace = Math.min(stats.bestPlace, field.length);
    });
    round++;
    advancing = [];
    nextTableIndex = 0;
  }

  onProgress?.({
    round: round + 1,
    completedTables: 0,
    totalTables: 1,
    activeTable: {
      hand: 0,
      players: field.map((profile) => ({ profile, chips: 10000, eliminated: false })),
      performance: { handsWon: {}, highestChips: {} },
    },
  });
  const seenFinal: SimulatedTablePerformance = { handsWon: {}, highestChips: {} };
  const finalTable = simulateTableRanking(field, pace, (activeTable) => {
    mergeTablePerformance(performance, seenFinal, activeTable.performance, field.length);
    onProgress?.({
      round: round + 1,
      completedTables: 0,
      totalTables: 1,
      activeTable,
    });
  });
  finalTable.forEach((player, index) => {
    const stats = ensurePlayerStats(performance, player.id, field.length);
    let remainingField = field.length;
    for (const cutoff of [6, 4, 2]) {
      if (remainingField > cutoff && index + 1 <= cutoff) {
        stats.advances++;
        remainingField = cutoff;
      }
    }
    stats.bestPlace = Math.min(stats.bestPlace, index + 1);
  });
  const finalPerformance = cloneSimulationStats(performance);
  onProgress?.({
    round: round + 1,
    completedTables: 1,
    totalTables: 1,
    performance: finalPerformance,
  });
  return { standings: finalTable, performance: finalPerformance };
}
