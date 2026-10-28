import { auditSite } from "../../../src/audit.js";
import { checkAuditAccess } from "../../../lib/audit-access.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_CACHE = { "Cache-Control": "no-store, private", "Content-Type": "application/json" };
function response(body, status) { return Response.json(body, { status, headers: NO_CACHE }); }

// Local process throttle is only defense-in-depth; stateless hosts must also
// use platform WAF/rate limiting. Production scans require an API key.
const started = new Map();
function throttle(id) {
  const now = Date.now();
  if (started.size > 500) for (const [k, v] of started) if (now - v > 120_000) started.delete(k);
  const previous = started.get(id);
  if (previous && now - previous < 15_000) return false;
  started.set(id, now);
  return true;
}

export async function POST(request) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 8_192) return response({ error: "Request body is too large." }, 413);
    const bodyText = await request.text();
    if (bodyText.length > 8_192) return response({ error: "Request body is too large." }, 413);
    const payload = JSON.parse(bodyText);
    const url = String(payload.url || "");
    const maxPages = payload.maxPages == null ? 3 : Number(payload.maxPages);
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) return response({ error: "Select 1–5 pages for dashboard scans. The CLI supports up to 20." }, 400);
    const key = request.headers.get("x-opengeo-key") || "";
    const target = checkAuditAccess({
      url, key, allowedHosts: process.env.OPEN_GEO_ALLOWED_HOSTS,
      expectedKey: process.env.OPEN_GEO_API_KEY,
      production: process.env.NODE_ENV === "production",
      allowAuthenticatedPublicHosts: process.env.OPEN_GEO_ALLOW_AUTHENTICATED_PUBLIC_HOSTS === "true"
    });
    const token = [target.hostname, "authorized"].join(":");
    if (!throttle(token)) return response({ error: "Wait 15 seconds before starting another scan." }, 429);
    // No Playwright on serverless API, no cross-domain canonical probes.
    const report = await auditSite(target.href, { maxPages, renderJs: false, verifyCanonical: false });
    return response(report, 200);
  } catch (error) {
    const status = Number(error.status) || (/URL|address|hostname|HTTP|protocol|port/i.test(error.message) ? 400 : 500);
    return response({ error: status === 500 ? "Audit failed. Check server logs and website availability." : error.message }, status);
  }
}
