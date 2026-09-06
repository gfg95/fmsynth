// bus.js — dans chaque app
import { TabBus } from "./tab-bus.js";

export const bus = new TabBus(
  //import.meta.env.DEV
  //  ? { mode: "extension" }
  //  : { mode: "iframe", routerUrl: "https://router.appmidi.app/bridge" }
  { mode: "iframe", routerUrl: "https://router.tabmidi.app/bridge" }
);