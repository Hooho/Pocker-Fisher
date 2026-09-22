import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, hero } from "./engine";
import { championshipCareerBonuses, championshipStandings, pointsForPlace, qualification, simulateTable } from "./tournament";
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
test("a simulated table yields distinct qualified players", () => {
  const profiles = Array.from({ length: 8 }, (_, id) => ({ ...hero, id }));
  const winners = simulateTable(profiles, 4, 5);
  assert.equal(winners.length, 4);
  assert.equal(new Set(winners.map((p) => p.id)).size, 4);
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
