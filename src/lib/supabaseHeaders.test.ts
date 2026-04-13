import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SESSION_HEADER_NAME,
  getFunctionAuthorization,
  getSessionHeaders,
} from "@/lib/supabaseHeaders";

describe("supabaseHeaders", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds the current session id to outgoing headers", () => {
    localStorage.setItem("foto-delivery-session", "session-123");

    const headers = getSessionHeaders({ "Content-Type": "application/json" });

    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get(SESSION_HEADER_NAME)).toBe("session-123");
  });

  it("prefers the user access token for edge-function calls", () => {
    const session = {
      access_token: "user-token",
    } as Session;

    expect(getFunctionAuthorization(session, "anon-token")).toBe("Bearer user-token");
  });

  it("does not use the publishable key as a user JWT", () => {
    expect(getFunctionAuthorization(null, "anon-token")).toBeUndefined();
  });
});
