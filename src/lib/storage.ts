
// --- Autosave storage (tiny IndexedDB key-value store) ---

export const AUTOSAVE_KEY = "current-course";
// One connection for the page, closed when the page goes (a reload then opens the store at once;
// a connection per call left dozens open, and the next page's first read could wait on them)
let connection: Promise<IDBDatabase> | null = null;
export const openAutosaveDb = () =>
  (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    // The app's earlier name, kept: renaming the database would leave saved courses behind
    const req = indexedDB.open("disc-golf-course-designer", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); connection = null; };
      db.onclose = () => { connection = null; };
      resolve(db);
    };
    req.onerror = () => { connection = null; reject(req.error); };
  }));
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    void connection?.then(db => db.close());
    connection = null;
  });
}
export const idbGet = async (key: string) => {
  const db = await openAutosaveDb();
  return new Promise<any>((resolve, reject) => {
    const req = db.transaction("kv", "readonly").objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};
export const idbSet = async (key: string, value: unknown) => {
  const db = await openAutosaveDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
export const idbDelete = async (key: string) => {
  const db = await openAutosaveDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// --- A cache of big pictures (the painted ground), in a database of its own ---
// (apart from the course: writing a picture of several MB in the course's store held the course's
// own save up behind it, and a reload then lost the last change)
let cacheConnection: Promise<IDBDatabase> | null = null;
const openCache = () =>
  (cacheConnection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("hyzerlab-cache", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); cacheConnection = null; };
      db.onclose = () => { cacheConnection = null; };
      resolve(db);
    };
    req.onerror = () => { cacheConnection = null; reject(req.error); };
  }));
const cacheTx = async <T,>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void): Promise<T> => {
  const db = await openCache();
  return new Promise<T>((resolve, reject) => {
    // (a cache: kept when the browser gets to it, never holding anything up)
    const tx = db.transaction("kv", mode, { durability: "relaxed" });
    const req = run(tx.objectStore("kv"));
    tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
    tx.onerror = () => reject(tx.error);
  });
};
export const cacheGet = (key: string) => cacheTx<unknown>("readonly", s => s.get(key));
export const cacheSet = (key: string, value: unknown) => cacheTx<void>("readwrite", s => { s.put(value, key); });
export const cacheDelete = (key: string) => cacheTx<void>("readwrite", s => { s.delete(key); });

// --- Course library: earlier courses, kept when you start a new one or open another ---
// The open course lives under AUTOSAVE_KEY; the others under "plan:<id>", listed (newest first) in PLANS_KEY.

export type PlanMeta = { id: string; name: string; updatedAt: number; holes: number };
const PLANS_KEY = "plans";
const planKey = (id: string) => `plan:${id}`;

export const listPlans = async (): Promise<PlanMeta[]> => {
  const list = await idbGet(PLANS_KEY);
  return Array.isArray(list) ? list : [];
};
export const storePlan = async (meta: PlanMeta, data: unknown) => {
  await idbSet(planKey(meta.id), data);
  const list = (await listPlans()).filter(p => p.id !== meta.id);
  await idbSet(PLANS_KEY, [meta, ...list].sort((a, b) => b.updatedAt - a.updatedAt));
};
export const loadPlan = (id: string) => idbGet(planKey(id));
export const removePlan = async (id: string) => {
  await idbDelete(planKey(id));
  await idbSet(PLANS_KEY, (await listPlans()).filter(p => p.id !== id));
};
