const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

export function normalizeAppUrl(appUrl: string | null | undefined) {
  if (!appUrl?.trim()) {
    throw new Error("APP_URL nao configurado");
  }

  let parsed: URL;

  try {
    parsed = new URL(appUrl);
  } catch {
    throw new Error("APP_URL invalido");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("APP_URL deve usar http ou https");
  }

  if (parsed.protocol === "http:" && !LOCALHOST_HOSTNAMES.has(parsed.hostname)) {
    throw new Error("APP_URL deve usar https fora do localhost");
  }

  parsed.hash = "";

  return parsed.toString().replace(/\/$/, "");
}

export function buildLoginRedirectUrl(appUrl: string | null | undefined) {
  const normalizedAppUrl = normalizeAppUrl(appUrl);
  const baseUrl = new URL(`${normalizedAppUrl}/`);

  return new URL("login", baseUrl).toString();
}

export function extractWebhookToken(req: Request) {
  const authorization = req.headers.get("authorization") || "";

  if (authorization.toLowerCase().startsWith("bearer ")) {
    const bearer = authorization.slice(7).trim();
    if (bearer) return bearer;
  }

  return (
    req.headers.get("x-webhook-token") ||
    req.headers.get("x-kiwify-token") ||
    req.headers.get("x-kiwify-signature")
  );
}

export function hasExpectedSecret(expected: string | null | undefined, received: string | null | undefined) {
  if (!expected) {
    throw new Error("KIWIFY_WEBHOOK_SECRET nao configurado");
  }

  return Boolean(received) && received === expected;
}
