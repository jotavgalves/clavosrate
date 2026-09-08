export interface Env {
  DB: D1Database;
  PRIVATE_DOCUMENTS: R2Bucket;
  JOBS: Queue;
  APP_ENV: string;
}

type ApiError = { error: string; code: string };

const json = (data: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });

const notFound = () => json({ error: "Ruta no encontrada", code: "NOT_FOUND" } satisfies ApiError, { status: 404 });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        service: "clavos-api",
        environment: env.APP_ENV,
        status: "ok",
        timestamp: new Date().toISOString(),
      });
    }

    if (request.method === "GET" && url.pathname === "/api/v1") {
      return json({
        name: "Clavos Brasil API",
        version: "v1",
        modules: [
          "auth",
          "organizations",
          "persons",
          "loans",
          "payments",
          "documents",
          "scores",
          "disputes",
          "admin",
          "audit",
        ],
      });
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
