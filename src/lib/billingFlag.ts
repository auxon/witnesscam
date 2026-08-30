/** Read ?billing= from the URL search or from a hash query (`#/?billing=pro`). */
export function readBillingFlag(search: string, hash: string): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  const fromSearch = new URLSearchParams(query).get("billing");
  if (fromSearch) return fromSearch;
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return null;
  return new URLSearchParams(hash.slice(qIdx + 1)).get("billing");
}
