import { timingSafeEqual } from "node:crypto";

// Used only on the server. This key authorizes inference spending, not crawling.
export function authorizeAIRequest(providedKey, configuredKey, enabled) {
  if (!enabled) throw Object.assign(new Error("AI analysis is disabled. Set OPEN_GEO_AI_ENABLED=true on the server."), { status: 503 });
  if (!configuredKey || configuredKey.length < 16) throw Object.assign(new Error("Set a private OPEN_GEO_API_KEY (at least 16 characters) to enable AI requests."), { status: 503 });
  const left = Buffer.from(String(providedKey ?? ""));
  const right = Buffer.from(configuredKey);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw Object.assign(new Error("Invalid AI access key. Enter the owner API key in Server access settings."), { status: 401 });
  }
  return true;
}
