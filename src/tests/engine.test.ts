import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluate,
  currentHandName,
  newGame,
  startHand,
  act,
  decide,
  observe,
  pot,
  hero,
  settle,
  previewBoard,
  type Character,
} from "../domain/game/engine";
const profiles: Character[] = Array.from({ length: 8 }, (_, i) => ({
  ...hero,
  id: i,
  name: `P${i}`,
}));
test("royal flush outranks four of a kind; wheel straight handles ace low", () => {
  assert.ok(
    evaluate([8, 9, 10, 11, 12]).score > evaluate([12, 25, 38, 51, 11]).score,
  );
  assert.equal(evaluate([12, 0, 14, 28, 42]).name, "顺子");
  assert.equal(evaluate([0, 13, 26, 1, 14]).name, "葫芦");
});
test("best five ignores unused kickers", () => {
  assert.equal(
    evaluate([8, 9, 10, 11, 12, 13, 14]).score,
    evaluate([8, 9, 10, 11, 12, 40, 41]).score,
  );
});
test("current hand name works before and after the flop", () => {
  assert.equal(currentHandName([12, 25]), "一对");
  assert.equal(currentHandName([12, 24]), "A 高牌");
  assert.equal(currentHandName([0, 13, 26, 1, 14]), "葫芦");
});
test("heads up dealer posts small blind and acts first", () => {
  const g = newGame(profiles.slice(0, 2));
  assert.equal(g.turn, g.dealer);
  assert.equal(g.players[g.dealer].bet, 50);
});
test("a new hand keeps normal dealing and hand flow", () => {
  const debugProfiles = [
    hero,
    { ...hero, id: 100, name: "对手" },
    { ...hero, id: 101, name: "对手 2" },
  ];
  const g = newGame(debugProfiles);

  assert.equal(g.done, false);
  assert.equal(g.board.length, 0);
  assert.equal(g.deck.length + g.board.length + g.players.flatMap((player) => player.cards).length, 52);
  assert.equal(g.players.slice(1).filter((player) => player.chips === 0).length, 0);
  assert.equal(g.winners.length, 0);

  const next = startHand(g, 100);
  assert.equal(next.done, false);
  assert.equal(next.board.length, 0);
});
test("previewBoard reveals future community cards without mutating the hand", () => {
  const g = newGame(profiles.slice(0, 3));
  const deckBefore = [...g.deck];
  const preview = previewBoard(g);

  assert.equal(preview.length, 5);
  assert.deepEqual(g.board, []);
  assert.deepEqual(g.deck, deckBefore);
});
test("fold awards pot and preserves chips", () => {
  let g = newGame(profiles.slice(0, 2));
  g = act(g, { type: "fold" });
  assert.ok(g.done);
  assert.equal(
    g.players.reduce((s, p) => s + p.chips, 0),
    20000,
  );
});
test("side pots allocated only to eligible contributors", () => {
  const g = newGame(profiles.slice(0, 3));
  g.board = [0, 18, 28, 42, 7];
  g.players.forEach((p, i) => {
    p.chips = 0;
    p.total = [100, 200, 300][i];
    p.folded = false;
  });
  g.players[0].cards = [3, 16];
  g.players[1].cards = [12, 25];
  g.players[2].cards = [11, 24];
  settle(g);
  assert.equal(
    g.players.reduce((s, p) => s + p.chips, 0),
    600,
  );
  assert.equal(g.players[2].chips, 100);
  assert.equal(g.players[0].chips, 300);
  assert.equal(g.players[1].chips, 200);
});
test("observation never includes other hole cards or future deck", () => {
  const o = observe(newGame(profiles));
  assert.equal(o.cards.length, 2);
  assert.equal("deck" in o, false);
  assert.equal("players" in o, false);
});
test("a tournament table can start with the player's carried stack", () => {
  const g = newGame(profiles.slice(0, 2), 100, [4250, 10000]);
  assert.equal(g.players[0].start, 4250);
  assert.equal(g.players[0].chips, 4250 - g.players[0].total);
  assert.equal(g.players.reduce((sum, player) => sum + player.start, 0), 14250);
  assert.equal(g.players.reduce((sum, player) => sum + player.chips + player.total, 0), 14250);
});
test("short all-in does not reopen raise for a player who already acted", () => {
  let g = newGame(profiles.slice(0, 3));
  g = act(g, { type: "raise", amount: 300 });
  const i = g.turn;
  g.players[i].chips = 350 - g.players[i].bet;
  g = act(g, { type: "raise", amount: 350 });
  assert.equal(g.minRaise, 200);
  assert.equal(g.current, 350);
});
test("100 full hands conserve all chips and never get stuck", () => {
  let g = newGame(profiles.slice(0, 6));
  for (let h = 0; h < 100; h++) {
    let actions = 0;
    while (!g.done && actions++ < 300) {
      const o = observe(g);
      let move = decide(o);
      if (actions > 240) move = { type: "call" };
      g = act(g, move);
    }
    assert.ok(g.done, `hand ${h} did not end`);
    assert.equal(
      g.players.reduce((s, p) => s + p.chips, 0),
      60000,
    );
    assert.ok(pot(g) >= 0);
    if (g.players.filter((p) => p.chips > 0).length < 2)
      g = newGame(profiles.slice(0, 6));
    else g = startHand(g);
  }
});
