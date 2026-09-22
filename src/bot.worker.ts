import { decide, type Observation } from "./engine";
self.onmessage = (e: MessageEvent<Observation>) => {
  self.postMessage(decide(e.data));
};
