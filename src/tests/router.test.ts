import { test } from "node:test";
import assert from "node:assert/strict";
import { pathForPage, resolvePage, usesHashRouting } from "../app/router";

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

test("subdirectory builds use hash routing without changing root deployments", () => {
  assert.equal(usesHashRouting("/pocker/"), true);
  assert.equal(usesHashRouting("/"), false);
  assert.equal(usesHashRouting("./"), false);
  assert.equal(resolvePage("/pocker/", "#/table"), "table");
});
