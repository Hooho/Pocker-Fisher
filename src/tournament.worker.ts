import type { Character } from "./engine";
import { simulateTable, type SimulatedTablePerformance } from "./tournament";
type Message =
  | { type: "start"; field: Character[]; size: number; qualify: number; pace: number }
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
    const tieQualified = simulateTable(
      event.data.field,
      event.data.slots,
      event.data.pace,
      (progress) => { performance = progress.performance; },
    );
    self.postMessage({ tieQualified, performance });
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
  const qualified = simulateTable(table, config.qualify, config.pace, (progress) => {
    performance = progress.performance;
  });
  offset += config.size;
  self.postMessage({
    table: { entrants: table, qualified, performance },
    progress: Math.min(config.field.length, offset),
    total: config.field.length,
  });
  running = false;
  schedule();
}
