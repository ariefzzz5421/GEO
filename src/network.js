import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const USER_AGENT = "OpenGEOAudit/0.3 (+https://github.com/ariefzzz5421/GEO)";
const DEFAULT_MAX_BYTES = 1_000_000;

export function isPublicIPv4(ip) {
  if (isIP(ip) !== 4) return false;
  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function validateUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("Provide an absolute http(s) URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP and HTTPS are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not allowed.");
  if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) {
    throw new Error("Non-default ports are not allowed.");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) {
    throw new Error("Local or internal hostnames are not allowed.");
  }
  if (isIP(url.hostname) === 6 || url.hostname.startsWith("[")) throw new Error("IPv6 URLs are not supported in this MVP.");
  if (isIP(url.hostname) === 4 && !isPublicIPv4(url.hostname)) throw new Error("Private or reserved addresses are not allowed.");
  url.hash = "";
  return url;
}

function siteHost(hostname) { return hostname.toLowerCase().replace(/^www\./, ""); }

async function resolveSafeIPv4(hostname) {
  const records = await lookup(hostname, { family: 4, all: true });
  if (!records.length || records.some((record) => !isPublicIPv4(record.address))) {
    throw new Error("DNS returned a private/reserved IP address or no public IPv4 address.");
  }
  return records[0].address;
}

export function createPinnedIPv4Lookup(ip) {
  // Node.js may request the full address list (options.all=true) when
  // autoSelectFamily is enabled. In that case the callback MUST return
  // [{ address, family }] instead of (address, family).
  // The returned address remains pinned to the pre-validated DNS result.
  return (_hostname, options, callback) => {
    if (options?.all) {
      callback(null, [{ address: ip, family: 4 }]);
    } else {
      callback(null, ip, 4);
    }
  };
}

async function requestOnce(url, maxBytes) {
  const ip = await resolveSafeIPv4(url.hostname);
  const client = url.protocol === "https:" ? https : http;
  return await new Promise((resolve, reject) => {
    const req = client.request(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5", "Accept-Encoding": "identity" },
      lookup: createPinnedIPv4Lookup(ip)
    }, (res) => {
      const chunks = [];
      let total = 0;
      res.on("data", (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy(new Error("Response exceeds maximum allowed size."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve({
        url: url.toString(),
        status: res.statusCode ?? 0,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8")
      }));
      res.on("error", reject);
    });
    req.setTimeout(10_000, () => req.destroy(new Error("Request timed out.")));
    req.on("error", reject);
    req.end();
  });
}

export async function fetchPublic(raw, { maxBytes = DEFAULT_MAX_BYTES, maxRedirects = 3 } = {}) {
  const first = validateUrl(raw);
  let current = first;
  for (let n = 0; n <= maxRedirects; n++) {
    const response = await requestOnce(current, maxBytes);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.location;
    if (!location) throw new Error("Redirect response has no Location header.");
    const next = validateUrl(new URL(location, current).toString());
    if (siteHost(next.hostname) !== siteHost(first.hostname)) {
      throw new Error("Cross-site redirects are blocked.");
    }
    current = next;
  }
  throw new Error("Too many redirects.");
}

export function isSameSite(url, origin) {
  return ["http:", "https:"].includes(url.protocol) && siteHost(url.hostname) === siteHost(origin.hostname) && !url.username && !url.password && !url.port;
}
