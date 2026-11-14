interface FreeEnv {
  ASSETS: Fetcher;
  API_URL?: string;
  API_PROXY_SECRET?: string;
}

function unavailable(): Response {
  return Response.json(
    {
      error: {
        message:
          "The server is temporarily unavailable. Please try again shortly.",
      },
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "30" },
    },
  );
}

export default {
  async fetch(request: Request, env: FreeEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/")
      return Response.redirect(url.origin + "/dashboard", 302);
    if (
      url.pathname === "/products" ||
      url.pathname.startsWith("/products/") ||
      url.pathname.startsWith("/inventory/")
    ) {
      return Response.redirect(url.origin + "/inventory" + url.search, 302);
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!url.pathname.startsWith("/api/v1/")) {
      return Response.json(
        { error: { message: "Not found." } },
        { status: 404 },
      );
    }
    if (!env.API_URL || !env.API_PROXY_SECRET) return unavailable();
    let backend: URL;
    try {
      backend = new URL(env.API_URL);
    } catch {
      return unavailable();
    }
    if (backend.protocol !== "https:") return unavailable();
    const upstream = new URL(url.pathname + url.search, backend.origin);
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("forwarded");
    headers.delete("x-forwarded-for");
    headers.set("X-ERP-Proxy-Secret", env.API_PROXY_SECRET);
    headers.set(
      "X-ERP-Client-IP",
      request.headers.get("CF-Connecting-IP") ?? "",
    );
    headers.set("X-Forwarded-Host", url.host);
    headers.set("X-Forwarded-Proto", "https");
    try {
      // Never replay writes: a lost response can follow a successful posting.
      const response = await fetch(upstream, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method)
          ? undefined
          : request.body,
        redirect: "manual",
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.headers.get("Content-Type")?.includes("application/json")) {
        await response.body?.cancel();
        return unavailable();
      }
      const result = new Response(response.body, response);
      result.headers.set("Cache-Control", "private, no-store");
      return result;
    } catch {
      return unavailable();
    }
  },
} satisfies ExportedHandler<FreeEnv>;
