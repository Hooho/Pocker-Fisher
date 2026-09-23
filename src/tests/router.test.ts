import { test } from "node:test";
import assert from "node:assert/strict";
import { pathForPage, resolvePage } from "../app/router";

test("app routes resolve clean paths and query strings", () => {
  assert.equal(resolvePage("/"), "lobby");
  assert.equal(resolvePage("/table"), "table");
  assert.equal(resolvePage("/settings?section=profile"), "settings");
  assert.equal(resolvePage("/leaderboard/"), "leaderboard");
});

test("app routes accept hash fallback and unknown paths return to the lobby", () => {
  assert.equal(resolvePage("/", "#/players"), "players");
  assert.equal(resolvePage("/unknown", "#/players"), "players");
  assert.equal(resolvePage("/unknown"), "lobby");
  assert.equal(pathForPage("tournament"), "/tournament");
});
