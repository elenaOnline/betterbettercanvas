// The ⌘K command and result registry, shared by every feature through ctx (so
// it's one instance even though feature runtimes load as separate chunks).
// search renders it; pins, settings, dark mode… contribute to it.

export interface Command {
  /** Stable id, e.g. 'pins.pin-this-page'. */
  id: string;
  title: string;
  /** Extra words to match on. */
  keywords?: string[];
  /** Short right-aligned hint (shortcut, current state). */
  hint?: string;
  run(): void | Promise<void>;
}

export interface Result {
  id: string;
  title: string;
  detail?: string;
  href: string;
  /** For grouping in the palette ('Pins', 'Assignments', …). */
  group?: string;
}

/** A provider of results the palette merges with its own index (e.g. pins). */
export interface ResultSource {
  id: string;
  group: string;
  search(query: string): Result[] | Promise<Result[]>;
}

export function createCommands() {
  const commands = new Map<string, Command>();
  const sources = new Map<string, ResultSource>();
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach(l => l());
  return {
    /** Register a command; returns an unregister function (call it in stop()). */
    register(c: Command): () => void {
      commands.set(c.id, c);
      changed();
      return () => {
        if (commands.get(c.id) === c) commands.delete(c.id);
        changed();
      };
    },
    /** Register a result source; returns an unregister function. */
    source(s: ResultSource): () => void {
      sources.set(s.id, s);
      changed();
      return () => {
        if (sources.get(s.id) === s) sources.delete(s.id);
        changed();
      };
    },
    commands: (): Command[] => [...commands.values()],
    sources: (): ResultSource[] => [...sources.values()],
    onChange(l: () => void): () => void {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export type Commands = ReturnType<typeof createCommands>;
