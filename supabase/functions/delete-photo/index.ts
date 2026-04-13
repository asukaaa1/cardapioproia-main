import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const SESSION_HEADER_NAME = "x-session-id";
const DEFAULT_ALLOWED_ORIGIN = "https://cardapioproia.vercel.app";
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function getCorsHeaders(req: Request) {
  const requestOrigin = req.headers.get("origin");
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? DEFAULT_ALLOWED_ORIGIN;
  const isLocalOrigin =
    requestOrigin?.startsWith("http://localhost:") ||
    requestOrigin?.startsWith("http://127.0.0.1:");

  return {
    ...securityHeaders,
    "Access-Control-Allow-Origin": isLocalOrigin ? requestOrigin! : allowedOrigin,
    "Access-Control-Allow-Headers": `authorization, x-client-info, apikey, content-type, ${SESSION_HEADER_NAME}`,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const BodySchema = z.object({
  photoId: z.string().uuid(),
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { photoId } = parsed.data;
    const sessionId = req.headers.get(SESSION_HEADER_NAME);
    const authorization = req.headers.get("authorization");

    if (!authorization && !sessionId) {
      return new Response(
        JSON.stringify({ error: "Missing authorization context" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (sessionId && !z.string().uuid().safeParse(sessionId).success) {
      return new Response(
        JSON.stringify({ error: "Invalid session header" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: {
            ...(authorization ? { Authorization: authorization } : {}),
            ...(sessionId ? { [SESSION_HEADER_NAME]: sessionId } : {}),
          },
        },
      }
    );

    const { data, error } = await supabase
      .from("photo_history")
      .delete()
      .eq("id", photoId)
      .select("id");

    if (error) {
      console.error("Delete error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to delete photo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ error: "Photo not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("delete-photo error:", e);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
