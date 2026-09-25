import { test } from "node:test";
import assert from "node:assert/strict";
import { act } from "../domain/game/engine";
import { areSaveContentsEqual, parseSave } from "../domain/storage/storage";
import { gameplayFixtures } from "./fixtures/gameplay";

test("gameplay fixtures are valid saves and preserve their intended state", () => {
  for (const fixture of gameplayFixtures) {
    const parsed = parseSave(JSON.parse(JSON.stringify(fixture.save)));
    const game = parsed.game;
    assert.equal(areSaveContentsEqual(parsed, fixture.save), true, fixture.id);
    assert.ok(game, fixture.id);
    assert.equal(game.done, fixture.expected.gameDone, fixture.id);
    assert.equal(game.players[0].chips > 0, fixture.expected.heroAlive, fixture.id);

    if (fixture.expected.mode === "cash") {
      assert.equal(parsed.tournament, null, fixture.id);
      continue;
    }

    assert.ok(parsed.tournament, fixture.id);
    assert.equal(parsed.tournament.round, fixture.expected.tournamentRound, fixture.id);
    assert.equal(parsed.tournament.field.length, fixture.expected.tournamentField, fixture.id);
    assert.equal(parsed.tournament.complete, fixture.expected.tournamentComplete ?? false, fixture.id);
    assert.equal(parsed.tournament.out, fixture.expected.playerOut, fixture.id);
    if (fixture.expected.eliminatedInCurrentHand !== undefined) {
      assert.equal(
        game.players.filter((player) => player.chips === 0).length,
        fixture.expected.eliminatedInCurrentHand,
        fixture.id,
      );
    }
  }
});

test("active gameplay fixtures can continue with a legal action", () => {
  for (const fixture of gameplayFixtures) {
    const game = fixture.save.game;
    if (!game || game.done || fixture.expected.playerOut) continue;

    let current = game;
    for (let action = 0; action < 2_000 && !current.done; action += 1) {
      const next = act(current, { type: "call" });
      assert.notEqual(next, current, fixture.id);
      current = next;
    }
    assert.equal(current.done, true, fixture.id);
  }
});
