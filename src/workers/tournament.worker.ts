import type { Character } from "../domain/game/engine";
import { simulateTableWithStacks, type SimulatedTablePerformance } from "../domain/tournament/tournament";
type Message =
  | { type: "start"; field: Character[]; stacks: Record<string, number>; size: number; qualify: number; pace: number }
  | { type: "tie"; field: Character[]; slots: number; pace: number }
  | { type: "pause" }
  | { type: "resume" };

let paused = false;
let running = false;
let config: Extract<Message, { type: "start" }> | null = null;
let offset = 0;

self.onmessage = (event: MessageEvent<Message>) => {
  if (event.data.type === "pause") {
    paused = true;
    return;
  }
  if (event.data.type === "resume") {
    paused = false;
    schedule();
    return;
  }
  if (event.data.type === "tie") {
    let performance: SimulatedTablePerformance = { handsWon: {}, highestChips: {} };
    const result = simulateTableWithStacks(
      event.data.field,
      event.data.slots,
      event.data.pace,
      (progress) => { performance = progress.performance; },
    );
    self.postMessage({ tieQualified: result.qualified, qualifiedStacks: result.stacks, performance });
    return;
  }
  config = event.data;
  offset = 0;
  paused = false;
  schedule();
};

function schedule() {
  if (running || paused || !config) return;
  running = true;
  setTimeout(runOneTable, 0);
}

function runOneTable() {
  if (!config || paused) {
    running = false;
    return;
  }
  const table = config.field.slice(offset, offset + config.size);
  if (!table.length) {
    running = false;
    self.postMessage({ done: true });
    return;
  }
  let performance: SimulatedTablePerformance = { handsWon: {}, highestChips: {} };
  const startingStacks = table.map((player) => config?.stacks[String(player.id)] ?? 10000);
  const result = simulateTableWithStacks(
    table,
    config.qualify,
    config.pace,
    (progress) => {
      performance = progress.performance;
    },
    startingStacks,
  );
  offset += config.size;
  self.postMessage({
    table: { entrants: table, qualified: result.qualified, qualifiedStacks: result.stacks, performance },
    progress: Math.min(config.field.length, offset),
    total: config.field.length,
  });
  running = false;
  schedule();
}
