"use client";

import { useMemo, useState } from "react";
import { remediationPlan } from "../lib/remediation.js";
import { buildAISnapshot } from "../lib/ai-evidence.js";

const priorities = ["all", "critical", "high", "medium", "low"];

function Card({ item, onCopy, copyState }) {
  return <article className="fix-card">
    <div className="fix-heading">
      <span className={"fix-priority fix-" + item.priority}>{item.priority} priority</span>
      <span className="fix-category">{item.category}</span>
      <span className="fix-status">{item.status?.toUpperCase()}</span>
    </div>
    <h3>{item.title}</h3>
    <p className="fix-why">{item.why}</p>
    <div className="fix-evidence"><span>DETECTED</span><p>{item.detected}</p><small>{item.url}</small></div>
    <div className="fix-action"><strong>RECOMMENDED ACTION</strong><p>{item.action}</p></div>
    {item.snippet && <div className="fix-snippet"><div className="fix-code-head"><span>STARTER TEMPLATE — REVIEW BEFORE USING</span><button type="button" onClick={() => onCopy(item.key, item.snippet)}>{copyState === item.key ? "✓ Copied" : "Copy code ↗"}</button></div><pre><code>{item.snippet}</code></pre></div>}
    {item.caution && <p className="fix-caution">ⓘ {item.caution}</p>}
  </article>;
}

export default function Solutions({ report, accessKey }) {
  const [filter, setFilter] = useState("all");
  const [copyState, setCopyState] = useState("");
  const [term, setTerm] = useState("");
  const [aiBusy, setAIBusy] = useState(false);
  const [aiResult, setAIResult] = useState(null);
  const [aiError, setAIError] = useState("");
  const plan = useMemo(() => remediationPlan(report), [report]);
  const items = useMemo(() => plan.issues.filter((item) =>
    (filter === "all" || item.priority === filter) &&
    (item.title + " " + item.url + " " + item.rule + " " + item.action).toLowerCase().includes(term.toLowerCase())
  ), [plan, filter, term]);

  async function askAI() {
    if (aiBusy) return;
    setAIError("");
    setAIResult(null);
    if (!accessKey) {
      setAIError("Enter your private API key in Server access settings above. AI analysis never runs anonymously.");
      return;
    }
    setAIBusy(true);
    try {
      const snapshot = buildAISnapshot(report);
      const response = await fetch("/api/ai/analyze", {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "x-opengeo-key": accessKey },
        body: JSON.stringify({ snapshot })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "AI analysis request failed.");
      if (!body.analysis || !body.provider) throw new Error("Provider response is incomplete.");
      setAIResult(body);
    } catch (error) { setAIError(error.message || "AI inference unavailable."); }
    finally { setAIBusy(false); }
  }
  async function copyCode(key, code) {
    try { await navigator.clipboard.writeText(code); setCopyState(key); }
    catch { setCopyState(""); }
  }
  function exportPlan() {
    const lines = [
      "# OpenGEO — prioritized fix plan", "",
      "Target: " + report.target, "Scanned: " + (report.scannedAt ?? "Unknown"),
      "Audited pages: " + report.pages.length, "Findings: " + plan.issues.length, "",
      "Important: deterministic recommendations; not automatically applied or verified.", ""
    ];
    for (const item of plan.issues) {
      lines.push("## [" + item.priority.toUpperCase() + "] " + item.title, "",
        "Page: " + item.url, "Rule: " + item.rule, "Evidence: " + item.detected, "",
        "Why: " + item.why, "", "Fix: " + item.action, "", "Caution: " + item.caution, "");
      if (item.snippet) lines.push("~~~html", item.snippet, "~~~", "");
    }
    lines.push("## Additional optimization / verification opportunities", "");
    for (const item of plan.opportunities) lines.push("### " + item.title, "", item.action, "");
    const file = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "opengeo-fix-plan.md";
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  return <section className="solution-page">
    <div className="solution-hero">
      <div><div className="overline">ACTIONABLE AUDIT</div><h2>Optimization & Fix Advisor</h2><p>Rule-based fixes derived from actual audit findings. Review every proposed change before editing your codebase.</p></div>
      <button type="button" className="button-outline" onClick={exportPlan}>↓ Export Fix Plan</button>
    </div>
    <section className="ai-advisor-panel">
      <div className="ai-advisor-head">
        <div className="ai-advisor-symbol">✳</div>
        <div className="ai-advisor-intro"><div className="overline">OPTIONAL CLOUD INFERENCE</div><h3>AI-assisted SEO diagnosis</h3><p>Gemini primary · Groq fallback. Only a bounded summary of audit findings is sent to the provider. No AI calls occur automatically.</p></div>
        <button type="button" className="button-primary" disabled={aiBusy} onClick={askAI}>{aiBusy ? "Analyzing…" : "✦ Analyze with AI"}</button>
      </div>
      {aiError && <div className="ai-advisor-error" role="alert">{aiError}<p>Rule-based recommendations below remain available without any AI API.</p></div>}
      {aiResult && <div className="ai-response">
        <div className="ai-response-meta"><span>PROVIDER: {aiResult.provider.toUpperCase()}</span><span>MODEL: {aiResult.model}</span>{aiResult.fallbackUsed && <span>FALLBACK USED</span>}</div>
        <p className="ai-summary">{aiResult.analysis.summary || "Analysis completed based on the submitted audit evidence."}</p>
        {(aiResult.analysis.fixes || []).map((fix) => <article key={fix.ref} className="ai-fix-card">
          <div className="ai-fix-title"><span className={"fix-priority fix-" + fix.priority}>{fix.priority}</span><strong>{fix.rule.replaceAll("-", " ")}</strong><span className="ai-ref">{fix.ref}</span></div>
          <small className="ai-fix-url">{fix.url}</small>
          <p>{fix.reason}</p>
          {!!fix.steps.length && <ol>{fix.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>}
          {fix.code && <div className="fix-snippet"><div className="fix-code-head"><span>AI SUGGESTION — REVIEW BEFORE APPLYING</span><button type="button" onClick={() => copyCode("ai-" + fix.ref, fix.code)}>{copyState === "ai-" + fix.ref ? "✓ Copied" : "Copy code ↗"}</button></div><pre><code>{fix.code}</code></pre></div>}
          {fix.verify && <div className="ai-verify"><strong>VERIFY:</strong> {fix.verify}</div>}
        </article>)}
        {(aiResult.analysis.caveats || []).map((notice, i) => <p className="ai-caveat" key={i}>ⓘ {notice}</p>)}
        <p className="ai-disclosure">AI answers may be inaccurate. They are derived from user-supplied audit evidence, not live Google indexing, AI citations, or source-code access. Re-run the deterministic scanner to verify fixes.</p>
      </div>}
    </section>
    <div className="solution-metrics">
      {["critical", "high", "medium", "low"].map((priority) => <div className="solution-metric" key={priority}><span className={"fix-priority fix-" + priority}>{priority}</span><strong>{plan.counts[priority]}</strong><small>issue(s)</small></div>)}
    </div>
    <div className="solution-toolbar"><div className="filter-tabs">{priorities.map((priority)=><button key={priority} className={filter===priority?"chosen":""} onClick={()=>setFilter(priority)}>{priority === "all"?"All priorities":priority}</button>)}</div><input className="search-input" aria-label="Search solutions" placeholder="Find a rule or page…" value={term} onChange={(e)=>setTerm(e.target.value)}/></div>
    <div className="solution-count">{items.length} recommended fix(es) · ordered by urgency</div>
    {items.length ? items.map((item)=><Card key={item.key} item={item} onCopy={copyCode} copyState={copyState}/>)
      : <div className="panel fix-empty"><h3>{plan.issues.length ? "No fixes in this filter" : "No failed or warning checks detected"}</h3><p>{plan.issues.length ? "Try another priority or search." : "This means no detected issues within the current scanner rules, not that the site is fully optimized."}</p></div>}
    <div className="opportunity-panel panel">
      <div className="panel-heading"><div><div className="overline">NEXT IMPROVEMENTS</div><h2>Verification & optimization opportunities</h2></div><span className="subtle-badge">{plan.opportunities.length} ideas</span></div>
      <p className="opportunity-intro">These are possible next checks, not confirmed site defects.</p>
      {plan.opportunities.length ? plan.opportunities.map((item)=><div key={item.id} className="opportunity-row"><span className={"fix-priority fix-" + item.priority}>{item.priority}</span><div><strong>{item.title}</strong><p>{item.action}</p></div></div>) : <p className="opportunity-intro">No additional rules triggered for this report.</p>}
    </div>
    <p className="solution-disclaimer">OpenGEO does not modify websites, make Google indexing decisions, or claim verified AI citations. Re-run the audit after applying changes to see whether the original issue disappears.</p>
  </section>;
}
