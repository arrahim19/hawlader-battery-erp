import { DurableObject } from "cloudflare:workers";

interface Env {
  ERP: DurableObjectNamespace<HawladerERP>;
  DATABASE_URL: string;
  CSRF_SECRET: string;
  APP_ORIGIN: string;
}

const PORT = 8080;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export class HawladerERP extends DurableObject<Env> {
  private starting: Promise<void> | undefined;
  private monitoring: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() =>
        ctx.container!.setInactivityTimeout(IDLE_TIMEOUT_MS),
      );
      this.observeExit();
    }
  }

  async fetch(request: Request): Promise<Response> {
    this.starting ??= this.ensureReady().finally(() => {
      this.starting = undefined;
    });
    await this.starting;

    const external = new URL(request.url);
    const internal = new URL(request.url);
    internal.protocol = "http:";
    internal.host = "container";
    const forwarded = new Request(internal, request);
    forwarded.headers.delete("host");
    forwarded.headers.set("X-Forwarded-Host", external.host);
    forwarded.headers.set("X-Forwarded-Proto", "https");
    // Forward exactly once: retrying a failed POST could repeat a business write.
    return this.ctx.container!.getTcpPort(PORT).fetch(forwarded);
  }

  private async ensureReady(): Promise<void> {
    const container = this.ctx.container!;
    if (!container.running) {
      container.start({
        image: container.images.base,
        instance: "lite",
        enableInternet: true,
        env: {
          DATABASE_URL: this.env.DATABASE_URL,
          CSRF_SECRET: this.env.CSRF_SECRET,
          APP_ORIGIN: this.env.APP_ORIGIN,
        },
      });
    }
    this.observeExit();
    await container.setInactivityTimeout(IDLE_TIMEOUT_MS);
    const port = container.getTcpPort(PORT);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      try {
        const response = await port.fetch("http://container/api/v1/health", {
          signal: AbortSignal.timeout(2000),
        });
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        // Retry only the read-only readiness probe while Node and Neon start.
      }
      await scheduler.wait(250);
    }
    throw new Error("ERP container readiness timed out.");
  }

  private observeExit() {
    if (this.monitoring) return;
    this.monitoring = this.ctx
      .container!.monitor()
      .catch(() => console.error("ERP container stopped unexpectedly."))
      .finally(() => {
        this.monitoring = undefined;
      });
    this.ctx.waitUntil(this.monitoring);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.DATABASE_URL || !env.CSRF_SECRET || !env.APP_ORIGIN) {
      return new Response("ERP deployment settings are incomplete.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const origin = new URL(env.APP_ORIGIN);
    if (origin.protocol !== "https:") {
      return new Response("ERP requires an HTTPS origin.", { status: 503 });
    }
    const url = new URL(request.url);
    if (url.origin !== origin.origin) {
      // Do not replay a form submission against another origin.
      if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Use the configured ERP address.", { status: 403 });
      }
      return Response.redirect(origin.origin + url.pathname + url.search, 307);
    }
    try {
      const response = await env.ERP.getByName("production").fetch(request);
      const result = new Response(response.body, response);
      result.headers.set("Cache-Control", "private, no-store");
      return result;
    } catch {
      console.error("ERP request could not reach the container.");
      return new Response("ERP is temporarily unavailable. Please try again.", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "10" },
      });
    }
  },
} satisfies ExportedHandler<Env>;
