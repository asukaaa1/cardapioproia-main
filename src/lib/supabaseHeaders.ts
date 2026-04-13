import type { Session } from "@supabase/supabase-js";
import { getSessionId } from "@/lib/session";

export const SESSION_HEADER_NAME = "x-session-id";

export function getSessionHeaders(headers?: HeadersInit) {
  const mergedHeaders = new Headers(headers);

  if (typeof window !== "undefined") {
    mergedHeaders.set(SESSION_HEADER_NAME, getSessionId());
  }

  return mergedHeaders;
}

export function getFunctionAuthorization(
  session: Session | null,
  _publishableKey?: string,
) {
  if (session?.access_token) {
    return `Bearer ${session.access_token}`;
  }

  return undefined;
}
