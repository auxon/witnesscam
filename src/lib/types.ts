export type MediaKind = "still" | "video";

export type CustodyEventType =
  | "CAPTURED"
  | "ENCRYPTED"
  | "HASHED"
  | "TIMESTAMPED"
  | "TRANSFERRED";

export type CustodyEvent = {
  prevHash: string;
  type: CustodyEventType;
  at: string;
  actorId: string;
  actorName: string;
  contentHash: string;
  meta: Record<string, string>;
  eventHash: string;
};

export type ChainNetwork = "bsv" | "bsv-test" | "bsv-demo";
export type ChainSource = "yours" | "yours-agent" | "demo";

export type ChainAnchor = {
  network: ChainNetwork;
  source?: ChainSource;
  opReturnHex: string;
  payloadAsciiPrefix: string;
  txid: string;
  blockHeight: number;
  anchoredAt: string;
  address?: string;
};

export type EvidenceBag = {
  id: string;
  kind: MediaKind;
  mimeType: string;
  byteLength: number;
  capturedAt: string;
  contentHash: string;
  ciphertextHash: string;
  ivHex: string;
  deviceId: string;
  deviceLabel: string;
  holderId: string;
  holderName: string;
  events: CustodyEvent[];
  chainTip: string;
  anchor: ChainAnchor;
  filename: string;
};

export type HolderKey = {
  bagId: string;
  keyB64: string;
};

export type PublicProof = {
  bagId: string;
  contentHash: string;
  kind: MediaKind;
  capturedAt: string;
  deviceId: string;
  holderName: string;
  events: CustodyEvent[];
  chainTip: string;
  anchor: ChainAnchor;
};

export type LedgerEntry = {
  bagId: string;
  contentHash: string;
  chainTip: string;
  anchor: ChainAnchor;
};

export type Route =
  | { name: "studio" }
  | { name: "bags" }
  | { name: "bag"; id: string }
  | { name: "verify"; hash?: string }
  | { name: "ledger" }
  | { name: "about" };
