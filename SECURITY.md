# Security policy

## Responsible disclosure
Please do not open a public issue containing a working exploit or leaked credentials. Contact the repository maintainer privately through their GitHub profile or security advisory mechanism.

## Scanner threat model
The tool fetches untrusted remote pages. Security defenses include:
- Only HTTP(S), default ports, and public IPv4 targets.
- DNS validation and pinning the selected IPv4 for each connection, mitigating DNS rebinding.
- Restricted redirects to the requested site's hostname or its www variant.
- Timeouts, response-size limits, page-count caps, and sequential crawling.
- Reading scripts as text only; never evaluating page JavaScript.
- Respecting common robots.txt Allow/Disallow rules.

Limitations:
- Not a hardened multi-tenant SaaS. Before exposing as a public hosted scanner, add per-user authentication, rate limits, abuse monitoring, queues, network egress isolation, and additional hostname/IP policy hardening.
- IPv6-only targets are not supported in the first release.
- The lightweight robots parser covers common rules, not all edge cases.
- Run only against sites you operate or are authorized to audit. Avoid excessive requests.

## v0.3 browser rendering threat model

The optional --render-js --i-own-this-site mode executes untrusted JavaScript in Chromium. It must only be used for websites the operator owns or is authorized to test, and only within an isolated machine/container with strict OS-level network egress and no credentials. An HTTP request allowlist and DNS pinning reduce but do not eliminate browser execution risks (WebSockets, browser vulnerabilities, popup or non-HTTP schemes can bypass application-level expectations). Never expose this experimental mode in a public multi-tenant scanner. The core CLI remains no-JavaScript by default.


## v0.6 AI inference endpoint

POST /api/ai/analyze is disabled unless OPEN_GEO_AI_ENABLED=true and a private OPEN_GEO_API_KEY (16+ chars) is configured. Only Gemini and Groq fixed official HTTPS endpoints are contacted; provider/model names are server-side configuration, not user-controlled URLs. Audit URLs supplied to AI are only model context: the AI endpoint does not browse them. Payloads are size bounded, sanitized to findings, and AI results are constrained to valid audit issue references.

Prompt injection is reduced by treating all website/report content as untrusted input and filtering model output, but can never be fully prevented. Generated code must be human-reviewed. Provider requests can incur cost and may be subject to provider data-retention policies. Never expose the inference endpoint to anonymous users; require auth, WAF and distributed quotas in any scaled deployment.
