import { describe, expect, it } from "vitest";
import {
  buildLoginRedirectUrl,
  extractWebhookToken,
  hasExpectedSecret,
  normalizeAppUrl,
} from "./security";

describe("edge security helpers", () => {
  it("builds a login redirect from a configured app URL", () => {
    expect(buildLoginRedirectUrl("https://cardapioproia.com.br")).toBe("https://cardapioproia.com.br/login");
    expect(buildLoginRedirectUrl("https://cardapioproia.com.br/app")).toBe("https://cardapioproia.com.br/app/login");
  });

  it("rejects missing or invalid app URLs", () => {
    expect(() => buildLoginRedirectUrl("")).toThrow("APP_URL nao configurado");
    expect(() => normalizeAppUrl("javascript:alert(1)")).toThrow("APP_URL deve usar http ou https");
    expect(() => normalizeAppUrl("http://example.com")).toThrow("APP_URL deve usar https fora do localhost");
  });

  it("accepts localhost app URLs for local development", () => {
    expect(normalizeAppUrl("http://localhost:8080")).toBe("http://localhost:8080");
    expect(normalizeAppUrl("http://127.0.0.1:8080/app")).toBe("http://127.0.0.1:8080/app");
  });

  it("extracts webhook secrets from headers only", () => {
    const bearerRequest = new Request("https://example.com", {
      headers: { Authorization: "Bearer webhook-secret" },
    });
    const headerRequest = new Request("https://example.com?token=ignored", {
      headers: { "x-webhook-token": "header-secret" },
    });

    expect(extractWebhookToken(bearerRequest)).toBe("webhook-secret");
    expect(extractWebhookToken(headerRequest)).toBe("header-secret");
    expect(extractWebhookToken(new Request("https://example.com?token=ignored"))).toBeNull();
  });

  it("fails closed when the expected secret is missing or mismatched", () => {
    expect(() => hasExpectedSecret("", "value")).toThrow("KIWIFY_WEBHOOK_SECRET nao configurado");
    expect(hasExpectedSecret("expected", "wrong")).toBe(false);
    expect(hasExpectedSecret("expected", "expected")).toBe(true);
  });
});
