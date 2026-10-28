import { authorizeAIRequest } from "../../../../lib/ai-access.js";
import { validateAISnapshot } from "../../../../lib/ai-evidence.js";
import { runHybridAnalysis } from "../../../../lib/ai-providers.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" };
const MAX_REQUEST_BYTES = 18_000;
let lastStarted = 0;

function respond(data, status) {
  return Response.json(data, { status, headers: NO_STORE });
}
export async function POST(request) {
  try {
    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > MAX_REQUEST_BYTES) return respond({ error: "AI request exceeds 18 KB." }, 413);
    const key = request.headers.get("x-opengeo-key");
    authorizeAIRequest(key, process.env.OPEN_GEO_API_KEY, process.env.OPEN_GEO_AI_ENABLED === "true");
    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_REQUEST_BYTES) return respond({ error: "AI request exceeds 18 KB." }, 413);
    let payload;
    try { payload = JSON.parse(raw); }
    catch { return respond({ error: "Invalid JSON request." }, 400); }
    try { validateAISnapshot(payload?.snapshot); }
    catch (error) { return respond({ error: error.message }, 400); }

    // Defense in depth only: a production deployment also needs identity-bound
    // quotas, hosting WAF and billing alert/limits. Key is never in the cache ID.
    const now = Date.now();
    if (now - lastStarted < 30_000) return respond({ error: "AI cooldown active. Retry after 30 seconds." }, 429);
    lastStarted = now;

    const result = await runHybridAnalysis(payload.snapshot, {
      geminiKey: process.env.GEMINI_API_KEY,
      groqKey: process.env.GROQ_API_KEY,
      preferred: process.env.OPEN_GEO_AI_PROVIDER,
      geminiModel: process.env.OPEN_GEO_GEMINI_MODEL || "gemini-3.5-flash-lite",
      groqModel: process.env.OPEN_GEO_GROQ_MODEL || "openai/gpt-oss-20b"
    });
    return respond(result, 200);
  } catch (error) {
    const status = [400, 401, 413, 429, 502, 503].includes(error?.status) ? error.status : 502;
    const message = status === 502 && error?.status !== 502
      ? "AI analysis failed; use the offline Fix Advisor and check server settings."
      : error.message;
    return respond({ error: message }, status);
  }
}
