import { test } from "node:test";
import assert from "node:assert/strict";
import { aiMove, reshape, requestAI } from "../domain/game/ai";
import { defaults } from "../domain/storage/storage";
import { hero, newGame, observe } from "../domain/game/engine";
test("AI adapter uses only observation and validates action and character results", async () => {
  const original = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (_input, init) => {
    body = String(init?.body);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '<think>reasoning</think>{"type":"call"}' } }],
      }),
      { status: 200 },
    );
  };
  try {
    const settings = {
      ...defaults,
      endpoint: "https://example.test/v1",
      model: "test",
    };
    const o = observe(newGame([hero, { ...hero, id: 1, name: "对手" }]));
    assert.deepEqual(
      await aiMove(settings, "", o, new AbortController().signal),
      { type: "call" },
    );
    assert.ok(!body.includes('"deck"'));
    assert.ok(!body.includes('"temperature"'));
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ...hero,
                  id: 999,
                  name: "被修改",
                  level: 5,
                  aggression: 0.8,
                  bluff: 0.2,
                  style: "松手激进",
                }),
              },
            },
          ],
        }),
      );
    const p = await reshape(settings, "", hero, "更激进");
    assert.equal(p.id, hero.id);
    assert.equal(p.name, hero.name);
    assert.equal(p.level, hero.level);
    assert.equal(p.aggression, 0.8);
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"type":"cheat"}' } }],
        }),
      );
    await assert.rejects(() =>
      aiMove(settings, "", o, new AbortController().signal),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("MiniMax requests separate reasoning from the final JSON response", async () => {
  const original = globalThis.fetch;
  let body = "";
  globalThis.fetch = async (_input, init) => {
    body = String(init?.body);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
      { status: 200 },
    );
  };
  try {
    await requestAI(
      { ...defaults, endpoint: "https://api.minimax.io/v1", model: "MiniMax-M3" },
      "",
      'return {"ok":true}',
    );
    assert.equal(JSON.parse(body).reasoning_split, true);
  } finally {
    globalThis.fetch = original;
  }
});
