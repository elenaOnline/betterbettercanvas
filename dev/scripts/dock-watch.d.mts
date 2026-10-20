export interface DockHit { name: string; pid: string | undefined; at: string }
export function dockWatch(opts?: { ms?: number; ignorePids?: string[] }): { stop(): DockHit[]; samples(): number };
export function foregroundNow(): Promise<(string | undefined)[]>;
