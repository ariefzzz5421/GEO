import test from "node:test";
import assert from "node:assert/strict";
import { checkAuditAccess } from "../lib/audit-access.js";

const key = "secret-for-admin-only";
test("public-host mode defaults disabled, even with a key", () => {
  assert.throws(() => checkAuditAccess({
    url: "https://another-public-site.example", key,
    expectedKey: key, allowedHosts: "www.msbproject.my.id", production: true
  }), (error) => error.status === 403);
});
test("authenticated public-host mode must be explicitly enabled and keyed", () => {
  const options = {
    url: "https://another-public-site.example", expectedKey: key,
    allowedHosts: "", allowAuthenticatedPublicHosts: true, production: true
  };
  assert.equal(checkAuditAccess({ ...options, key }).hostname, "another-public-site.example");
  assert.throws(() => checkAuditAccess({ ...options, key: "bad" }), (error) => error.status === 401);
  assert.throws(() => checkAuditAccess({ ...options, expectedKey: "" }), (error) => error.status === 503);
});
test("authenticated public mode still prohibits private and non-HTTP URLs", () => {
  const options = {
    expectedKey: key, key, allowedHosts: "", allowAuthenticatedPublicHosts: true, production: true
  };
  assert.throws(() => checkAuditAccess({ ...options, url: "http://127.0.0.1" }));
  assert.throws(() => checkAuditAccess({ ...options, url: "http://192.168.1.4/" }));
  assert.throws(() => checkAuditAccess({ ...options, url: "file:///etc/passwd" }));
  assert.throws(() => checkAuditAccess({ ...options, url: "https://localhost" }));
});
