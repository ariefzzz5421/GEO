import { makeModelPrompt, parseModelAnswer, validateAISnapshot } from "./ai-evidence.js";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
const MAX_PROVIDER_RESPONSE = 60_000;
function validModelId(model) {
  if (typeof model !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.\/-]{1,90}$/.test(model)) throw new Error("Invalid AI model ID in server configuration.");
  return model;
}
async function requestJSON(fetchImpl, url, opts) {
  let res;
  try {
    res = await fetchImpl(url, { ...opts, signal: AbortSignal.timeout(18_000), cache: "no-store" });
  } catch {
    throw new Error("Inference connection failed or timed out.");
  }
  if (!res.ok) throw new Error("Provider returned HTTP " + res.status);
  const raw = await res.text();
  if (raw.length > MAX_PROVIDER_RESPONSE) throw new Error("Provider response exceeds size limit.");
  try { return JSON.parse(raw); }
  catch { throw new Error("Provider returned unreadable response JSON."); }
}

export async function analyzeWithGemini(snapshot, { key, model = DEFAULT_GEMINI_MODEL, fetchImpl = fetch } = {}) {
  if (!key) throw new Error("Gemini key not configured.");
  validateAISnapshot(snapshot);
  const prompt = makeModelPrompt(snapshot);
  const id = validModelId(model);
  const payload = {
    systemInstruction: { parts: [{ text: prompt.system }] },
    contents: [{ role: "user", parts: [{ text: prompt.user }] }],
    generationConfig: { responseMimeType: "application/json", maxOutputTokens: 2400 }
  };
  const response = await requestJSON(fetchImpl,
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(id) + ":generateContent",
    { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(payload) });
  const output = response.candidates?.[0]?.content?.parts?.filter((p) => typeof p.text === "string").map((p) => p.text).join("") || "";
  return { provider: "gemini", model: id, analysis: parseModelAnswer(output, snapshot) };
}

export async function analyzeWithGroq(snapshot, { key, model = DEFAULT_GROQ_MODEL, fetchImpl = fetch } = {}) {
  if (!key) throw new Error("Groq key not configured.");
  validateAISnapshot(snapshot);
  const prompt = makeModelPrompt(snapshot);
  const id = validModelId(model);
  const payload = {
    model: id,
    messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2400
  };
  const response = await requestJSON(fetchImpl, "https://api.groq.com/openai/v1/chat/completions",
    { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key }, body: JSON.stringify(payload) });
  const output = response.choices?.[0]?.message?.content || "";
  return { provider: "groq", model: id, analysis: parseModelAnswer(output, snapshot) };
}

// Provider fallback is only attempted when the first call fails. The API does
// not silently generate an AI answer from static rules and label it inference.
export async function runHybridAnalysis(snapshot, {
  geminiKey = "", groqKey = "", preferred = "gemini",
  geminiModel = DEFAULT_GEMINI_MODEL, groqModel = DEFAULT_GROQ_MODEL,
  fetchImpl = fetch
} = {}) {
  validateAISnapshot(snapshot);
  const handlers = {
    gemini: () => analyzeWithGemini(snapshot, { key: geminiKey, model: geminiModel, fetchImpl }),
    groq: () => analyzeWithGroq(snapshot, { key: groqKey, model: groqModel, fetchImpl })
  };
  const keys = { gemini: Boolean(geminiKey), groq: Boolean(groqKey) };
  if (!keys.gemini && !keys.groq) throw Object.assign(new Error("No inference provider configured. Set GEMINI_API_KEY or GROQ_API_KEY on the server."), { status: 503 });
  const order = preferred === "groq" ? ["groq", "gemini"] : ["gemini", "groq"];
  const failures = [];
  for (const name of order) {
    if (!keys[name]) continue;
    try {
      const result = await handlers[name]();
      return { ...result, fallbackUsed: failures.length > 0, userProvidedEvidence: true };
    } catch (error) {
      // Key value, full model payload and provider error body are never logged
      // or forwarded to the client. Only the provider name is disclosed.
      failures.push(name);
    }
  }
  throw Object.assign(new Error("AI providers unavailable or returned an invalid response. Rule-based Fix Advisor still works. Check server provider settings."), { status: 502 });
}
