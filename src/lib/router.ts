import type { Route } from "./types";

export function parseHash(hash: string): Route {
  const path = (hash.replace(/^#/, "") || "/").split("?")[0];
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return { name: "studio" };
  switch (parts[0]) {
    case "bags":
      return { name: "bags" };
    case "bag":
      return parts[1] ? { name: "bag", id: parts[1] } : { name: "bags" };
    case "verify":
      return { name: "verify", hash: parts[1] };
    case "ledger":
      return { name: "ledger" };
    case "about":
      return { name: "about" };
    default:
      return { name: "studio" };
  }
}

export function toHash(route: Route): string {
  switch (route.name) {
    case "studio":
      return "#/";
    case "bags":
      return "#/bags";
    case "bag":
      return `#/bag/${route.id}`;
    case "verify":
      return route.hash ? `#/verify/${route.hash}` : "#/verify";
    case "ledger":
      return "#/ledger";
    case "about":
      return "#/about";
  }
}

export function navigate(route: Route): void {
  window.location.hash = toHash(route);
}
