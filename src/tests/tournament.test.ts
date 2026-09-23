import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, hero, startHand, type Character } from "../domain/game/engine";
import {
  championshipCareerBonuses,
  championshipStandings,
  eliminatedProfiles,
  pointsForPlace,
  qualification,
  simulateTable,
  simulateTableWithStacks,
} from "../domain/tournament/tournament";
test("equal starting stacks on qualification boundary produce a playoff", () => {
  const g = newGame(Array.from({ length: 8 }, (_, id) => ({ ...hero, id })));
  g.players.forEach((p, i) => {
    p.chips = i < 3 ? 20000 : 0;
    p.start = i < 6 ? 10000 : 0;
  });
  const result = qualification(g, 4);
  assert.equal(result.locked.length, 3);
  assert.equal(result.tied.length, 3);
  assert.equal(result.slots, 1);
});

test("qualification never advances players who have already been eliminated", () => {
  const g = newGame(Array.from({ length: 8 }, (_, id) => ({ ...hero, id })));
  g.players.forEach((p, i) => {
    p.chips = i < 4 ? 20000 - i * 1000 : 0;
    p.start = 10000;
  });

  const result = qualification(g, 4);

  assert.deepEqual(result.locked.map((player) => player.id), [0, 1, 2, 3]);
  assert.deepEqual(result.tied, []);
});

test("debug hands preserve chronological elimination order for final standings", () => {
  const profiles = [
    hero,
    ...Array.from({ length: 7 }, (_, id) => ({ ...hero, id, name: `P${id}` })),
  ];
  let game = newGame(profiles, 100, undefined, { debugFast: true });
  const eliminated: Character[] = [];
  const record = (current: typeof game) => eliminated.push(...eliminatedProfiles(current));

  record(game);
  while (game.players.filter((player) => player.chips > 0).length > 1) {
    game = startHand(game, 100, { debugFast: true });
    record(game);
  }

  assert.deepEqual(eliminated.map((player) => player.name), [
    "P0", "P1", "P2", "P3", "P4", "P5", "P6",
  ]);
  assert.deepEqual([
    game.players.find((player) => player.chips > 0)?.profile,
    ...eliminated.slice().reverse(),
  ].map((player) => player?.name), [
    "你", "P6", "P5", "P4", "P3", "P2", "P1", "P0",
  ]);
});

test("a simulated table yields distinct qualified players", () => {
  const profiles = Array.from({ length: 8 }, (_, id) => ({ ...hero, id }));
  const winners = simulateTable(profiles, 4, 5);
  assert.equal(winners.length, 4);
  assert.equal(new Set(winners.map((p) => p.id)).size, 4);
});

test("a simulated table returns the qualified players' ending stacks", () => {
  const profiles = Array.from({ length: 8 }, (_, id) => ({ ...hero, id }));
  const startingStacks = profiles.map((_, index) => 9000 + index * 250);
  const result = simulateTableWithStacks(profiles, 8, 5, undefined, startingStacks);

  assert.equal(result.qualified.length, profiles.length);
  assert.equal(
    result.qualified.every((player) => Number.isInteger(result.stacks[String(player.id)])),
    true,
  );
  assert.equal(
    Object.values(result.stacks).reduce((sum, chips) => sum + chips, 0),
    startingStacks.reduce((sum, chips) => sum + chips, 0),
  );
});

test("championship points award the top eight and no points below eighth", () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => pointsForPlace(index + 1)),
    [20, 15, 12, 11, 10, 9, 8, 7],
  );
  assert.equal(pointsForPlace(9), 0);
});

test("championship standings keep the top eight and award the configured points", () => {
  const profiles = Array.from({ length: 10 }, (_, id) => ({ ...hero, id }));
  const standings = championshipStandings(profiles);
  assert.equal(standings.length, 8);
  assert.deepEqual(standings.map(({ place, points }) => [place, points]), [
    [1, 20], [2, 15], [3, 12], [4, 11],
    [5, 10], [6, 9], [7, 8], [8, 7],
  ]);
  assert.equal(new Set(standings.map(({ player }) => player.id)).size, 8);
});

test("championship record points accumulate with the best recorded place", () => {
  const first = Array.from({ length: 8 }, (_, id) => ({ ...hero, id }));
  const second = [first[1], first[0], ...first.slice(2)];
  const bonuses = championshipCareerBonuses([
    { standings: championshipStandings(first) },
    { standings: championshipStandings(second) },
  ]);

  assert.deepEqual(bonuses["0"], { pointsTenths: 350, bestPlace: 1 });
  assert.deepEqual(bonuses["1"], { pointsTenths: 350, bestPlace: 1 });
  assert.deepEqual(bonuses["7"], { pointsTenths: 140, bestPlace: 8 });
});
