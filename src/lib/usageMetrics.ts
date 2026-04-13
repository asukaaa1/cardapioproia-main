import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";

export const PLAN_LIMITS = {
  free: 5,
  bronze: 40,
  prata: 120,
  ouro: 250,
  pro: 100,
  unlimited: null,
  ilimitado: null,
} as const;

export type PlanCode = keyof typeof PLAN_LIMITS;

export function getDefaultBillingPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export function getPlanCredits(planCode: string, creditsIncluded: number | null) {
  if (creditsIncluded !== null && creditsIncluded !== undefined) {
    return creditsIncluded;
  }

  if (planCode in PLAN_LIMITS) {
    return PLAN_LIMITS[planCode as PlanCode];
  }

  return PLAN_LIMITS.free;
}

export function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message) : "";
  const code = "code" in error ? String(error.code) : "";

  return code === "42P01" || message.toLowerCase().includes("does not exist");
}

export async function recordDownload(photoId: string | null, userId: string | null) {
  const { error } = await supabase
    .from("download_events")
    .insert({
      photo_id: photoId,
      user_id: userId,
      session_id: getSessionId(),
    });

  if (error && !isMissingRelationError(error)) {
    throw error;
  }

  return;
}
