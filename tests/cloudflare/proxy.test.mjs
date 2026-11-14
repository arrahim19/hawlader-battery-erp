import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../../apps/cloudflare/src/free.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { default: worker } = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
const env = {
  API_URL: "https://test-api.onrender.com",
  API_PROXY_SECRET: "test-proxy-secret-that-is-at-least-32-characters",
  ASSETS: { fetch: () => new Response("static page") },
};

test("static pages and legacy links need no API or paid services", async () => {
  const staticPage = await worker.fetch(new Request("https://erp.example/login"), { ASSETS: env.ASSETS });
  assert.equal(await staticPage.text(), "static page");
  for (const [path, expected] of [["/", "/dashboard"], ["/products/new", "/inventory"], ["/inventory/new", "/inventory"]]) {
    const response = await worker.fetch(new Request("https://erp.example" + path), env);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), "https://erp.example" + expected);
  }
});

test("missing or malformed backend settings return JSON 503, not a static page", async () => {
  for (const settings of [{}, { ...env, API_URL: "invalid" }, { ...env, API_URL: "http://api.example" }]) {
    const response = await worker.fetch(new Request("https://erp.example/api/v1/auth/me"), settings);
    assert.equal(response.status, 503);
    assert((await response.json()).error.message);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  const response = await worker.fetch(new Request("https://erp.example/api/unknown"), env);
  assert.equal(response.status, 404);
});

test("proxy preserves write payload, CSRF, session cookies and all response cookies", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(String(url), "https://test-api.onrender.com/api/v1/sales/complete?test=1");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.get("Origin"), "https://erp.example");
      assert.equal(init.headers.get("X-CSRF-Token"), "csrf-value");
      assert.equal(init.headers.get("Cookie"), "__Host-hb_session=session");
      assert.equal(init.headers.get("X-ERP-Proxy-Secret"), env.API_PROXY_SECRET);
      assert.equal(init.headers.get("X-ERP-Client-IP"), "192.0.2.10");
      assert.equal(init.headers.get("X-Forwarded-For"), null);
      assert.equal(init.redirect, "manual");
      assert.equal(await new Response(init.body).text(), '{"quantity":2}');
      const headers = new Headers({ "Content-Type": "application/json" });
      headers.append("Set-Cookie", "__Host-hb_session=new; Secure; HttpOnly; Path=/");
      headers.append("Set-Cookie", "__Host-hb_pre_csrf=; Max-Age=0; Secure; Path=/");
      return new Response('{"data":{"saved":true}}', { status: 201, headers });
    };
    const request = new Request("https://erp.example/api/v1/sales/complete?test=1", {
      method: "POST", body: '{"quantity":2}',
      headers: {
        Origin: "https://erp.example", "X-CSRF-Token": "csrf-value",
        Cookie: "__Host-hb_session=session", "CF-Connecting-IP": "192.0.2.10",
        "X-ERP-Proxy-Secret": "spoofed", "X-ERP-Client-IP": "spoofed",
        "X-Forwarded-For": "spoofed",
      },
    });
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 201);
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), { data: { saved: true } });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});

test("failed or waking backends never cause automatic retries of a sale", async () => {
  const previous = globalThis.fetch;
  try {
    for (const mode of ["network-error", "waking-html", "unauthorized"]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        if (mode === "network-error") throw new Error("Connection lost after posting");
        if (mode === "waking-html") return new Response("Starting server", { headers: { "Content-Type": "text/html" } });
        return Response.json({ error: { message: "Sign in" } }, { status: 401 });
      };
      const response = await worker.fetch(new Request("https://erp.example/api/v1/sales/complete", { method: "POST", body: "{}" }), env);
      assert.equal(response.status, mode === "unauthorized" ? 401 : 503);
      assert.equal(calls, 1);
      assert((await response.json()).error.message);
    }
  } finally { globalThis.fetch = previous; }
});
