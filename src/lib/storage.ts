import type { EvidenceBag, HolderKey, LedgerEntry, PublicProof } from "./types";

const DB_NAME = "witnesscam";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("bags")) {
        db.createObjectStore("bags", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs");
      }
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys", { keyPath: "bagId" });
      }
      if (!db.objectStoreNames.contains("ledger")) {
        db.createObjectStore("ledger", { keyPath: "bagId" });
      }
    };
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBag(
  bag: EvidenceBag,
  ciphertext: ArrayBuffer,
  key: HolderKey,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["bags", "blobs", "keys", "ledger"], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore("bags").put(bag);
    tx.objectStore("blobs").put(ciphertext, bag.id);
    tx.objectStore("keys").put(key);
    const entry: LedgerEntry = {
      bagId: bag.id,
      contentHash: bag.contentHash,
      chainTip: bag.chainTip,
      anchor: bag.anchor,
    };
    tx.objectStore("ledger").put(entry);
  });
}

export async function updateBag(bag: EvidenceBag): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["bags", "ledger"], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore("bags").put(bag);
    tx.objectStore("ledger").put({
      bagId: bag.id,
      contentHash: bag.contentHash,
      chainTip: bag.chainTip,
      anchor: bag.anchor,
    } satisfies LedgerEntry);
  });
}

export async function listBags(): Promise<EvidenceBag[]> {
  const db = await openDb();
  const bags = await reqToPromise(
    db.transaction("bags").objectStore("bags").getAll(),
  );
  return bags.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function getBag(id: string): Promise<EvidenceBag | undefined> {
  const db = await openDb();
  return reqToPromise(db.transaction("bags").objectStore("bags").get(id));
}

export async function getBagByHash(
  contentHash: string,
): Promise<EvidenceBag | undefined> {
  const bags = await listBags();
  return bags.find((b) => b.contentHash === contentHash.toLowerCase());
}

export async function getCiphertext(id: string): Promise<ArrayBuffer | undefined> {
  const db = await openDb();
  return reqToPromise(db.transaction("blobs").objectStore("blobs").get(id));
}

export async function getKey(bagId: string): Promise<HolderKey | undefined> {
  const db = await openDb();
  return reqToPromise(db.transaction("keys").objectStore("keys").get(bagId));
}

export async function listLedger(): Promise<LedgerEntry[]> {
  const db = await openDb();
  const rows = await reqToPromise(
    db.transaction("ledger").objectStore("ledger").getAll(),
  );
  return rows.sort((a, b) =>
    b.anchor.anchoredAt.localeCompare(a.anchor.anchoredAt),
  );
}

export function toProof(bag: EvidenceBag): PublicProof {
  return {
    bagId: bag.id,
    contentHash: bag.contentHash,
    kind: bag.kind,
    capturedAt: bag.capturedAt,
    deviceId: bag.deviceId,
    holderName: bag.holderName,
    orgName: bag.orgName,
    events: bag.events,
    chainTip: bag.chainTip,
    anchor: bag.anchor,
    rfc3161: bag.rfc3161,
  };
}

export function proofFromSearchParam(raw: string): PublicProof | null {
  try {
    const json = JSON.parse(decodeURIComponent(raw)) as PublicProof;
    if (!json.bagId || !json.contentHash || !json.events) return null;
    return json;
  } catch {
    return null;
  }
}
