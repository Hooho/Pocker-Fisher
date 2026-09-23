import { decide, type Observation } from "../domain/game/engine";
self.onmessage = (e: MessageEvent<Observation>) => {
  self.postMessage(decide(e.data));
};
