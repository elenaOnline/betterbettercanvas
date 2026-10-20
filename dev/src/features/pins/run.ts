// pins runtime (lazy chunk `chunks/pins.js`): loaded by index.ts only where
// the dock shows, or when a ⌘K command or search needs it.
export { startDock } from './dock.ts';
export { dispose, pinHere, searchPins } from './store.ts';
