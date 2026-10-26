import { timingSafeEqual } from "node:crypto";
import { validateUrl } from "../src/network.js";

export function allowedDomains(config) {
  return new Set((config ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));
}
export function checkAuditAccess({ url, key, allowedHosts, expectedKey, production = true }) {
  const target = validateUrl(url);
  const hosts = allowedDomains(allowedHosts);
  if (!hosts.size) throw Object.assign(new Error("Server auditing is not configured; import a JSON report instead."), { status: 503 });
  if (!hosts.has(target.hostname.toLowerCase())) throw Object.assign(new Error("This hostname is not enabled for server auditing."), { status: 403 });
  if (production && !expectedKey) throw Object.assign(new Error("Set OPEN_GEO_API_KEY on the server before enabling scans."), { status: 503 });
  if (expectedKey) {
    const provided = Buffer.from(String(key || ""));
    const actual = Buffer.from(expectedKey);
    if (provided.length !== actual.length || !timingSafeEqual(provided, actual)) throw Object.assign(new Error("Invalid audit access key."), { status: 401 });
  }
  return target;
}
