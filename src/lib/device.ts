const DEVICE_KEY = "witnesscam.device";

export type DeviceIdentity = {
  id: string;
  label: string;
  createdAt: string;
};

function randomId(bytes = 4): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function getDevice(): DeviceIdentity {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return JSON.parse(existing) as DeviceIdentity;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/\//g, "-");
  const device: DeviceIdentity = {
    id: `DEV-${randomId(3)}`,
    label: `${tz} · ${navigator.platform || "web"}`,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  return device;
}

export function holderFromDevice(device: DeviceIdentity): {
  holderId: string;
  holderName: string;
} {
  const storedName = localStorage.getItem("witnesscam.holderName");
  return {
    holderId: `HLD-${device.id.slice(4)}`,
    holderName: storedName || "Original holder",
  };
}

export function setHolderName(name: string): void {
  localStorage.setItem("witnesscam.holderName", name.trim());
}

export function nextBagId(contentHash: string): string {
  return `WC-${contentHash.slice(0, 4).toUpperCase()}-${contentHash.slice(-4).toUpperCase()}`;
}

export function nextBlockHeight(): number {
  const key = "witnesscam.blockHeight";
  const current = Number(localStorage.getItem(key) || "914400");
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return next;
}
