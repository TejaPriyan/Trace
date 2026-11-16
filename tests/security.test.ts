import assert from "node:assert/strict";
import dns from "node:dns";
import { afterEach, describe, it, mock } from "node:test";
import { LIMITS, clampSettings, parseSettingsParams } from "@/lib/trace/limits";
import { acquireJob, checkRate, clientKey, releaseJob } from "@/lib/trace/rate-limit";
import { TraceError, assertPublicDns, assertPublicHostname, isPrivateIp, parseUserUrl } from "@/lib/trace/security";

afterEach(() => {
  mock.restoreAll();
});

describe("SSRF & URL security", () => {
  it("blocks private, loopback, link-local, CGNAT, and mapped IP addresses", () => {
    const blocked = [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.5.4",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "198.18.0.1",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "64:ff9b::10.0.0.1",
      "2002:c0a8:0101::1",
      "not-an-ip",
    ];
    for (const ip of blocked) {
      assert.equal(isPrivateIp(ip), true, `expected ${ip} to be private`);
    }

    const allowed = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "::ffff:93.184.216.34"];
    for (const ip of allowed) {
      assert.equal(isPrivateIp(ip), false, `expected ${ip} to be public`);
    }
  });

  it("rejects internal hostnames and obfuscated numeric/hex hosts", () => {
    for (const host of ["localhost", "api.localhost", "db.internal", "nas.local", "redis", "127.1", "0x7f.1", "169.254.169.254"]) {
      assert.throws(() => assertPublicHostname(host), (err: unknown) => err instanceof TraceError && err.code === "BLOCKED");
    }
    assert.doesNotThrow(() => assertPublicHostname("example.com"));
    assert.doesNotThrow(() => assertPublicHostname("sub.example.org"));
  });

  it("validates DNS resolution results via assertPublicDns", async () => {
    mock.method(dns.promises, "lookup", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await assert.rejects(
      () => assertPublicDns("rebind.example.com"),
      (err: unknown) => err instanceof TraceError && err.code === "BLOCKED",
    );

    mock.restoreAll();
    mock.method(dns.promises, "lookup", async () => []);
    await assert.rejects(
      () => assertPublicDns("missing.example.com"),
      (err: unknown) => err instanceof TraceError && err.code === "UNREACHABLE",
    );

    mock.restoreAll();
    mock.method(dns.promises, "lookup", async () => [{ address: "93.184.216.34", family: 4 }]);
    await assertPublicDns("example.com");
  });

  it("parses, validates, and normalizes user URLs", () => {
    const normalized = parseUserUrl("example.com/docs/?b=2&utm_source=x&a=1#intro");
    assert.equal(normalized.href, "https://example.com/docs?a=1&b=2");

    for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "https://user:pass@example.com/"]) {
      assert.throws(() => parseUserUrl(bad), (err: unknown) => err instanceof TraceError && err.code === "INVALID_URL");
    }
    assert.throws(
      () => parseUserUrl("https://example.com:8443/"),
      (err: unknown) => err instanceof TraceError && err.code === "BLOCKED",
    );
  });

  it("clamps settings and parses stream settings params", () => {
    assert.deepEqual(clampSettings({ maxPages: 999, maxDepth: -5, timeoutSec: 1, jsRendering: "off", analyzeAssets: false }), {
      maxPages: LIMITS.MAX_PAGES,
      maxDepth: 0,
      timeoutSec: LIMITS.MIN_TIMEOUT_SEC,
      jsRendering: "off",
      analyzeAssets: false,
    });

    const fromQuery = parseSettingsParams(
      new URLSearchParams("maxPages=75&maxDepth=5&timeoutSec=25&jsRendering=off&analyzeAssets=false"),
    );
    assert.deepEqual(fromQuery, {
      maxPages: 75,
      maxDepth: 5,
      timeoutSec: 25,
      jsRendering: "off",
      analyzeAssets: false,
    });

    const fromJson = parseSettingsParams(
      new URLSearchParams({ settings: JSON.stringify({ maxPages: 300, maxDepth: 2, timeoutSec: 999, analyzeAssets: false }) }),
    );
    assert.deepEqual(fromJson, {
      maxPages: LIMITS.MAX_PAGES,
      maxDepth: 2,
      timeoutSec: LIMITS.MAX_TIMEOUT_SEC,
      jsRendering: "auto",
      analyzeAssets: false,
    });
  });

  it("enforces clientKey extraction, host locking, and IP rate limits", () => {
    const req = new Request("https://trace.local/api/trace", {
      headers: { "x-forwarded-for": "198.51.100.1, 203.0.113.9" },
    });
    assert.equal(clientKey(req), "203.0.113.9");

    const lock1 = acquireJob("ip-test-1", "lock-host.example");
    assert.equal(lock1.ok, true);
    const lockDup = acquireJob("ip-test-2", "lock-host.example");
    assert.equal(lockDup.ok, false);
    releaseJob("ip-test-1", "lock-host.example");
    const lockAfter = acquireJob("ip-test-2", "lock-host.example");
    assert.equal(lockAfter.ok, true);
    releaseJob("ip-test-2", "lock-host.example");

    const rateIp = "203.0.113.77";
    for (let i = 0; i < LIMITS.TRACES_PER_IP_WINDOW; i++) {
      assert.equal(checkRate(rateIp).ok, true);
    }
    const blocked = checkRate(rateIp);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.retryAfterSec >= 1);
  });
});
