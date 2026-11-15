/**
 * Builds a ready-made city away from the page. The larger ones live through years of history
 * before they are handed over, which takes many seconds; done here, the page stays alive
 * meanwhile. Send it the size; it answers with the city as a save.
 */
import { SimulationEngine } from '../simulation/SimulationEngine';
import { demoCity, type DemoSize } from './demoCity';

self.onmessage = (event: MessageEvent<DemoSize>) => {
  const sample = new SimulationEngine({ version: 1, seed: 42, tick: 0 });
  demoCity(sample, event.data);
  postMessage(sample.save());
};
