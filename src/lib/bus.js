// bus.js — dans chaque app
import { TabBus } from "./tab-bus.js";

export const bus = new TabBus(
  //{ mode: "iframe", routerUrl: "https://router.tabmidi.app/bridge" }
  { mode: "extension"}
);