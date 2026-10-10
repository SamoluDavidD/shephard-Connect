Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("APP_ORIGINS", "https://shepherdconnect.example");

const { app, handleRequest } = await import("./index.ts");

Deno.test("health endpoint is available without authentication", async () => {
  const response = await app.request("/health");
  const body = await response.json();

  if (response.status !== 200 || body.status !== "ok") {
    throw new Error("Expected unauthenticated health check to return 200.");
  }
});

Deno.test("deployed function URL prefixes are removed before routing", async () => {
  for (
    const path of [
      "https://project.example/functions/v1/api/health",
      "https://project.example/api/health",
    ]
  ) {
    const response = await handleRequest(new Request(path));
    const body = await response.json();
    if (response.status !== 200 || body.status !== "ok") {
      throw new Error(`Expected ${path} to route to the health endpoint.`);
    }
  }
});

Deno.test("requests from unapproved origins are rejected", async () => {
  const response = await app.request("/support-categories", {
    headers: { origin: "https://unapproved.example" },
  });

  if (response.status !== 403) {
    throw new Error("Expected unapproved browser origin to return 403.");
  }
});

Deno.test("preflight requests advertise only the configured origin", async () => {
  const response = await app.request("/me", {
    method: "OPTIONS",
    headers: { origin: "https://shepherdconnect.example" },
  });

  if (
    response.status !== 204 ||
    response.headers.get("Access-Control-Allow-Origin") !==
      "https://shepherdconnect.example"
  ) {
    throw new Error(
      "Expected approved preflight request to return its exact origin.",
    );
  }
});

Deno.test("authenticated routes reject requests without a bearer token", async () => {
  const requests: [string, string][] = [
    ["GET", "/me"],
    ["GET", "/me/profile"],
    ["PATCH", "/me"],
    ["GET", "/notifications"],
    ["PATCH", "/notifications/00000000-0000-4000-8000-000000000001/read"],
    ["GET", "/requests"],
    ["POST", "/requests"],
    ["PATCH", "/requests/CR-TEST/status"],
    ["GET", "/conversations"],
    ["GET", "/conversations/CV-TEST/messages"],
    ["POST", "/conversations/CV-TEST/messages"],
    ["POST", "/conversations/CV-TEST/receipts"],
  ];

  for (const [method, path] of requests) {
    const response = await app.request(path, { method });
    if (response.status !== 401) {
      throw new Error(
        `Expected unauthenticated ${method} ${path} to return 401.`,
      );
    }
  }
});

Deno.test("unknown routes return a JSON 404", async () => {
  const response = await app.request("/missing-route");
  const body = await response.json();

  if (response.status !== 404 || typeof body.error !== "string") {
    throw new Error("Expected unknown API routes to return a JSON 404.");
  }
});
