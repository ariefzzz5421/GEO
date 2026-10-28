import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWithGemini, analyzeWithGroq, runHybridAnalysis } from "../lib/ai-providers.js";
import { authorizeAIRequest } from "../lib/ai-access.js";

const snapshot = {
  target: "https://example.com/", scannedAt: "2026-10-28", pagesScanned: 1,
  technicalScore: 65, evidenceCoverage: 80,
  issues: [{ ref: "F1", status: "warn", priority: "medium", rule: "h1",
    url: "https://example.com/", detected: "0 H1 tags", proposedFix: "Write an H1" }],
  opportunities: []
};
const answer = JSON.stringify({summary:"A heading is missing",fixes:[{ref:"F1",reason:"Clear hierarchy",steps:["Add one H1"],code:"<h1>Page</h1>",verify:"Rescan"}],caveats:[]});

test("owner authorization requires feature toggle and strong secret", () => {
  assert.throws(() => authorizeAIRequest("secret-long-enough", "secret-long-enough", false), (e) => e.status===503);
  assert.throws(() => authorizeAIRequest("bad", "secret-long-enough", true), (e) => e.status===401);
  assert.throws(() => authorizeAIRequest("x", "", true), (e) => e.status===503);
  assert.equal(authorizeAIRequest("secret-long-enough", "secret-long-enough", true), true);
});

test("Gemini request uses REST JSON mode and key header; never sends API key in prompt", async () => {
  const calls = [];
  const fake = async (url, opts) => {
    calls.push({url,opts});
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{text:answer}] } }] }), {status:200});
  };
  const r = await analyzeWithGemini(snapshot,{key:"private-gemini-key",fetchImpl:fake});
  assert.equal(r.provider,"gemini");
  assert.equal(r.model,"gemini-3.5-flash-lite");
  assert.equal(r.analysis.fixes.length,1);
  assert.equal(calls[0].opts.headers["x-goog-api-key"],"private-gemini-key");
  assert.equal(calls[0].opts.body.includes("private-gemini-key"),false);
  assert.equal(JSON.parse(calls[0].opts.body).generationConfig.responseMimeType,"application/json");
});

test("Groq fallback uses chat completions only if Gemini fails", async () => {
  const called = [];
  const fake = async (url, opts) => {
    called.push(url);
    if (url.includes("googleapis")) return new Response('{"error":"rate limited"}',{status:429});
    assert.equal(opts.headers.Authorization, "Bearer private-groq-key");
    return new Response(JSON.stringify({choices:[{message:{content:answer}}]}),{status:200});
  };
  const result = await runHybridAnalysis(snapshot,{geminiKey:"gemini-key",groqKey:"private-groq-key",fetchImpl:fake});
  assert.equal(result.provider,"groq");
  assert.equal(result.fallbackUsed,true);
  assert.equal(called.length,2);
  assert.ok(called[1].includes("/chat/completions"));
});

test("Groq can be the primary provider", async () => {
  const fake = async () => new Response(JSON.stringify({choices:[{message:{content:answer}}]}),{status:200});
  const result = await analyzeWithGroq(snapshot,{key:"test-groq",fetchImpl:fake});
  assert.equal(result.analysis.summary,"A heading is missing");
});

test("unavailable providers return a clear error rather than fabricated output", async () => {
  await assert.rejects(runHybridAnalysis(snapshot,{}), /No inference provider/);
  const fake = async () => new Response("{}",{status:500});
  await assert.rejects(runHybridAnalysis(snapshot,{geminiKey:"k",groqKey:"k",fetchImpl:fake}), /providers unavailable/);
});
