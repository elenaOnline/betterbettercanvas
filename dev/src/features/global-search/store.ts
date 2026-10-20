// The search index on disk: IndexedDB on the Canvas origin, one database per
// Canvas user, one record per course (with its refresh time), plus a meta
// store (course list, recently opened). Nothing here leaves the device.
//
// One *record* per course rather than one object store per course: stores can
// only be created in a version upgrade, and a record replaces atomically.

import type { CourseInfo, Doc } from './model.ts';

export interface CourseRecord {
  id: string;
  /** When this course's lists were last fetched (ms). */
  t: number;
  docs: Doc[];
}

export interface Meta {
  courses: CourseInfo[];
  /** Last complete refresh (ms). */
  t: number;
}

const VERSION = 1;
export const dbName = (userId: string) => `b2c-search:${userId}`;

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export interface IndexStore {
  load(): Promise<{ meta: Meta | null; courses: CourseRecord[]; recent: string[] }>;
  putCourse(rec: CourseRecord): Promise<void>;
  dropCourses(ids: string[]): Promise<void>;
  putMeta(meta: Meta): Promise<void>;
  putRecent(keys: string[]): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

export async function openStore(userId: string): Promise<IndexStore> {
  const open = indexedDB.open(dbName(userId), VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('courses')) db.createObjectStore('courses', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
  };
  const db = await req(open);
  // Another tab upgrading later must not be blocked by us.
  db.onversionchange = () => db.close();

  const tx = (stores: string[], mode: IDBTransactionMode) => db.transaction(stores, mode);
  const done = (t: IDBTransaction) =>
    new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });

  return {
    async load() {
      const t = tx(['courses', 'meta'], 'readonly');
      const [courses, meta, recent] = await Promise.all([
        req(t.objectStore('courses').getAll() as IDBRequest<CourseRecord[]>),
        req(t.objectStore('meta').get('meta') as IDBRequest<Meta | undefined>),
        req(t.objectStore('meta').get('recent') as IDBRequest<string[] | undefined>),
      ]);
      return { meta: meta ?? null, courses, recent: Array.isArray(recent) ? recent : [] };
    },
    async putCourse(rec) {
      const t = tx(['courses'], 'readwrite');
      t.objectStore('courses').put(rec);
      await done(t);
    },
    async dropCourses(ids) {
      if (!ids.length) return;
      const t = tx(['courses'], 'readwrite');
      for (const id of ids) t.objectStore('courses').delete(id);
      await done(t);
    },
    async putMeta(meta) {
      const t = tx(['meta'], 'readwrite');
      t.objectStore('meta').put(meta, 'meta');
      await done(t);
    },
    async putRecent(keys) {
      const t = tx(['meta'], 'readwrite');
      t.objectStore('meta').put(keys, 'recent');
      await done(t);
    },
    async clear() {
      const t = tx(['courses', 'meta'], 'readwrite');
      t.objectStore('courses').clear();
      t.objectStore('meta').clear();
      await done(t);
    },
    close: () => db.close(),
  };
}
