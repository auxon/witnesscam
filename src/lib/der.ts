import { concatBytes } from "./bytes";

export type DerNode = {
  tag: number;
  constructed: boolean;
  bytes: Uint8Array;
  children: DerNode[];
};

export function encodeLength(n: number): Uint8Array {
  if (n < 0x80) return new Uint8Array([n]);
  if (n < 0x100) return new Uint8Array([0x81, n]);
  if (n < 0x10000) return new Uint8Array([0x82, (n >> 8) & 0xff, n & 0xff]);
  throw new Error("DER length too large");
}

export function encodeTlv(tag: number, content: Uint8Array): Uint8Array {
  return concatBytes(new Uint8Array([tag]), encodeLength(content.length), content);
}

export function encodeIntegerBytes(value: Uint8Array): Uint8Array {
  let bytes = value;
  while (bytes.length > 1 && bytes[0] === 0 && (bytes[1] & 0x80) === 0) {
    bytes = bytes.slice(1);
  }
  if (bytes[0] & 0x80) bytes = concatBytes(new Uint8Array([0]), bytes);
  return encodeTlv(0x02, bytes);
}

export function encodeInteger(n: number): Uint8Array {
  if (n < 0) throw new Error("negative INTEGER");
  if (n === 0) return encodeTlv(0x02, new Uint8Array([0]));
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return encodeIntegerBytes(new Uint8Array(bytes));
}

export function encodeOid(oid: string): Uint8Array {
  const parts = oid.split(".").map((p) => Number(p));
  if (parts.length < 2) throw new Error("invalid OID");
  const body: number[] = [40 * parts[0] + parts[1]];
  for (const part of parts.slice(2)) {
    if (part < 0) throw new Error("invalid OID arc");
    const stack: number[] = [];
    let n = part;
    stack.push(n & 0x7f);
    n >>= 7;
    while (n > 0) {
      stack.push(0x80 | (n & 0x7f));
      n >>= 7;
    }
    for (let i = stack.length - 1; i >= 0; i--) body.push(stack[i]);
  }
  return encodeTlv(0x06, new Uint8Array(body));
}

export function encodeOctetString(bytes: Uint8Array): Uint8Array {
  return encodeTlv(0x04, bytes);
}

export function encodeNull(): Uint8Array {
  return new Uint8Array([0x05, 0x00]);
}

export function encodeBool(value: boolean): Uint8Array {
  return encodeTlv(0x01, new Uint8Array([value ? 0xff : 0x00]));
}

export function encodeSequence(...parts: Uint8Array[]): Uint8Array {
  return encodeTlv(0x30, concatBytes(...parts));
}

function readLength(
  data: Uint8Array,
  offset: number,
): { length: number; next: number } {
  if (offset >= data.length) throw new Error("truncated DER length");
  const first = data[offset];
  if (first < 0x80) return { length: first, next: offset + 1 };
  const count = first & 0x7f;
  if (count === 0 || count > 3) throw new Error("unsupported DER length");
  let length = 0;
  for (let i = 0; i < count; i++) {
    length = (length << 8) | data[offset + 1 + i];
  }
  return { length, next: offset + 1 + count };
}

export function parseDer(data: Uint8Array, offset = 0): { node: DerNode; next: number } {
  if (offset >= data.length) throw new Error("truncated DER");
  const tag = data[offset];
  const constructed = (tag & 0x20) !== 0;
  const len = readLength(data, offset + 1);
  const start = len.next;
  const end = start + len.length;
  if (end > data.length) throw new Error("truncated DER content");
  const bytes = data.slice(start, end);
  const children: DerNode[] = [];
  if (constructed) {
    let i = 0;
    while (i < bytes.length) {
      const inner = parseDer(bytes, i);
      children.push(inner.node);
      i = inner.next;
    }
  }
  return {
    node: { tag: tag & 0x1f, constructed, bytes, children },
    next: end,
  };
}

export function parseDerRoot(data: Uint8Array): DerNode {
  return parseDer(data, 0).node;
}

export function oidToString(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const first = bytes[0];
  const arcs = [Math.floor(first / 40), first % 40];
  let n = 0;
  for (let i = 1; i < bytes.length; i++) {
    n = (n << 7) | (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) {
      arcs.push(n);
      n = 0;
    }
  }
  return arcs.join(".");
}

export function integerToHex(bytes: Uint8Array): string {
  let start = 0;
  if (bytes.length > 1 && bytes[0] === 0) start = 1;
  return Array.from(bytes.slice(start), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function findOid(node: DerNode, oid: string): DerNode | null {
  if (node.tag === 0x06 && oidToString(node.bytes) === oid) return node;
  for (const child of node.children) {
    const hit = findOid(child, oid);
    if (hit) return hit;
  }
  return null;
}

export function walk(node: DerNode, visit: (n: DerNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}
