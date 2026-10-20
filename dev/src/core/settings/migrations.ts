// Settings migrations (real users exist: the owner's install). Each migration is a
// pure function of the stored flat settings, run once, in order, by the SW on
// install/update. Add new ones at the end; never edit or reorder old ones.
import type { Flat } from './store.ts';
import { migrateV1 as palette } from '../../features/palette/migrate.ts';
import { migrateType } from '../../features/type/migrate.ts';

export interface MigrationResult {
  /** Keys to write (area chosen from schema.json). */
  set: Flat;
  /** Keys to delete (from both areas). */
  remove: string[];
}

export interface Migration {
  /** Stable id, recorded once applied, e.g. '2026-10-20-palette'. */
  id: string;
  run(stored: Flat): MigrationResult;
}

/** Registered migrations, oldest first. Feature lanes append here. */
export const MIGRATIONS: Migration[] = [];

// palette lane: v1 dark-mode.* → palette.* (two theme slots + "Use dark theme").
MIGRATIONS.push({ id: '2026-10-20-palette', run: palette });

// type: custom-font.* and shape.density → type.* (Design, rice.md: Type = family, scale, density).
MIGRATIONS.push({ id: '2026-10-20-type', run: migrateType });
