
// --- Autosave storage (tiny IndexedDB key-value store) ---

export const AUTOSAVE_KEY = "current-course";
// One connection for the page, closed when the page goes (a reload then opens the store at once;
// a connection per call left dozens open, and the next page's first read could wait on them)
let connection: Promise<IDBDatabase> | null = null;
export const openAutosaveDb = () =>
  (connection ??= new Promise<IDBDatabase>((resolve, reject) => {
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
