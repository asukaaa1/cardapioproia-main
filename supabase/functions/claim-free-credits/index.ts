import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FREE_TRIAL_CREDITS = 5;

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://cardapioproia.com.br",
  "https://www.cardapioproia.com.br",
  "https://cardapioproia.vercel.app",
];

function getCorsHeaders(req: Request) {
  const requestOrigin = req.headers.get("origin");
  const configuredOrigins = (Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const allowedOrigins = Array.from(new Set([...configuredOrigins, ...DEFAULT_ALLOWED_ORIGINS]));
  const isLocalOrigin =
    requestOrigin?.startsWith("http://localhost:") ||
    requestOrigin?.startsWith("http://127.0.0.1:");
  const allowedOrigin =
    isLocalOrigin || (requestOrigin && allowedOrigins.includes(requestOrigin))
      ? requestOrigin || allowedOrigins[0]
      : allowedOrigins[0];

  return {
    ...securityHeaders,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const firstForwardedIp = forwardedFor.split(",")[0]?.trim();

  return (
    firstForwardedIp ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function sha256(value: string) {
  const encoded = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não suportado" }, 405, corsHeaders);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const salt = Deno.env.get("FREE_TRIAL_IP_SALT");
    const authorization = req.headers.get("authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !salt) {
      console.error("claim-free-credits missing configuration");
      return json({ error: "Configuração do servidor incompleta" }, 500, corsHeaders);
    }

    if (!authorization) {
      return json({ error: "Autenticação obrigatória" }, 401, corsHeaders);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ error: "Sessão inválida" }, 401, corsHeaders);
    }

    const userId = authData.user.id;

    const { data: existingCredits, error: creditsLookupError } = await adminClient
      .from("user_credits")
      .select("credits")
      .eq("user_id", userId)
      .maybeSingle();

    if (creditsLookupError && creditsLookupError.code !== "PGRST116") {
      console.error("claim-free-credits credits lookup error:", creditsLookupError);
      return json({ error: "Não foi possível consultar créditos" }, 500, corsHeaders);
    }

    if (existingCredits) {
      return json({
        success: true,
        granted: false,
        reason: "user_already_initialized",
        credits: existingCredits.credits,
      }, 200, corsHeaders);
    }

    const ip = getClientIp(req);
    const userAgent = req.headers.get("user-agent") || "unknown";
    const ipHash = await sha256(`${salt}:${ip}`);
    const userAgentHash = await sha256(`${salt}:${userAgent}`);

    const { data: existingClaim, error: claimLookupError } = await adminClient
      .from("free_trial_ip_claims")
      .select("user_id")
      .eq("ip_hash", ipHash)
      .maybeSingle();

    if (claimLookupError && claimLookupError.code !== "PGRST116") {
      console.error("claim-free-credits claim lookup error:", claimLookupError);
      return json({ error: "Não foi possível validar o acesso gratuito" }, 500, corsHeaders);
    }

    if (existingClaim) {
      const { error: initializeCreditsError } = await adminClient
        .from("user_credits")
        .upsert({
          user_id: userId,
          credits: 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (initializeCreditsError) {
        console.error("claim-free-credits blocked credits init error:", initializeCreditsError);
      }

      return json({
        success: true,
        granted: false,
        reason: "ip_already_claimed",
        credits: 0,
      }, 200, corsHeaders);
    }

    const now = new Date().toISOString();
    const { error: claimInsertError } = await adminClient
      .from("free_trial_ip_claims")
      .insert({
        ip_hash: ipHash,
        user_id: userId,
        credits_granted: FREE_TRIAL_CREDITS,
        user_agent_hash: userAgentHash,
        created_at: now,
      });

    if (claimInsertError) {
      if (claimInsertError.code === "23505") {
        return json({
          success: true,
          granted: false,
          reason: "ip_or_user_already_claimed",
          credits: 0,
        }, 200, corsHeaders);
      }

      console.error("claim-free-credits claim insert error:", claimInsertError);
      return json({ error: "Não foi possível registrar o acesso gratuito" }, 500, corsHeaders);
    }

    const { data: updatedCredits, error: creditsError } = await adminClient
      .from("user_credits")
      .upsert({
        user_id: userId,
        credits: FREE_TRIAL_CREDITS,
        updated_at: now,
      }, { onConflict: "user_id" })
      .select("credits")
      .single();

    if (creditsError) {
      console.error("claim-free-credits credits grant error:", creditsError);
      return json({ error: "Não foi possível liberar créditos gratuitos" }, 500, corsHeaders);
    }

    const { error: transactionError } = await adminClient.from("credit_transactions").insert({
      user_id: userId,
      amount: FREE_TRIAL_CREDITS,
      balance_after: updatedCredits.credits,
      reason: "free_trial_ip_claim",
      reference_type: "free_trial_ip_claim",
      metadata: {
        ip_limited: true,
      },
    });

    if (transactionError) {
      console.error("claim-free-credits transaction audit error:", transactionError);
    }

    return json({
      success: true,
      granted: true,
      credits: updatedCredits.credits,
    }, 200, corsHeaders);
  } catch (error) {
    console.error("claim-free-credits error:", error);
    return json({ error: "Erro interno ao validar créditos gratuitos" }, 500, corsHeaders);
  }
});
