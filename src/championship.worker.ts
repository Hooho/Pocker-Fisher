import type { Character } from "./engine";
import {
  simulateChampionship,
  type ChampionshipSimulationCheckpoint,
  type ChampionshipSimulationProgress,
} from "./tournament";

self.onmessage = (
  event: MessageEvent<{
    entrants: Character[];
    pace: number;
    startingRound?: number;
    startingBestPlace?: number;
    checkpoint?: ChampionshipSimulationCheckpoint;
  }>,
) => {
  try {
    const result = simulateChampionship(
      event.data.entrants,
      event.data.pace,
      (progress: ChampionshipSimulationProgress) =>
        self.postMessage({ progress }),
      event.data.startingRound,
      event.data.checkpoint,
      event.data.startingBestPlace,
    );
    self.postMessage({ standings: result.standings, performance: result.performance });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "模拟失败",
    });
  }
};
