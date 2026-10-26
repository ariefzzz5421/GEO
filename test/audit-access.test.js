import test from "node:test";
import assert from "node:assert/strict";
import { allowedDomains, checkAuditAccess } from "../lib/audit-access.js";

const options = { url: "https://www.msbproject.my.id/katalog", expectedKey: "very-long-private-audit-key", allowedHosts: "www.msbproject.my.id,msbproject.my.id", production: true };
test("host allowlist trims domain names", () => {
  assert.deepEqual([...allowedDomains(" A.EXAMPLE.COM, b.example.com , ")], ["a.example.com","b.example.com"]);
});
test("server requires allowlist and production key", () => {
  assert.throws(() => checkAuditAccess({ ...options, allowedHosts: "" }), (err) => err.status === 503);
  assert.throws(() => checkAuditAccess({ ...options, expectedKey: "" }), (err) => err.status === 503);
});
test("server rejects missing/wrong key and unauthorized host", () => {
  assert.throws(() => checkAuditAccess({ ...options, key: "bad" }), (err) => err.status === 401);
  assert.throws(() => checkAuditAccess({ ...options, url: "https://other.example.net/", key: options.expectedKey }), (err) => err.status === 403);
  assert.throws(() => checkAuditAccess({ ...options, url: "http://127.0.0.1", key: options.expectedKey }));
});
test("server permits exact allowed host only", () => {
  assert.equal(checkAuditAccess({ ...options, key: options.expectedKey }).hostname, "www.msbproject.my.id");
  assert.throws(() => checkAuditAccess({ ...options, url: "https://sub.www.msbproject.my.id", key: options.expectedKey }));
  assert.throws(() => checkAuditAccess({ ...options, url: "https://www.msbproject.my.id.evil.test", key: options.expectedKey }));
});
