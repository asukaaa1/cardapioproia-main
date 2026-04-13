import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildLoginRedirectUrl, extractWebhookToken, hasExpectedSecret } from "../_shared/security.ts";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://cardapioproia.vercel.app",
  "https://cardapioproia.com.br",
  "https://www.cardapioproia.com.br",
];

type KiwifyEvent = {
  id?: string;
  event_id?: string;
  event?: string;
  customer?: {
    email?: string;
    name?: string;
    full_name?: string;
  };
  product?: {
    id?: string;
    name?: string;
  };
  order?: {
    id?: string;
  };
  subscription?: {
    id?: string;
  };
  [key: string]: unknown;
};

function getCorsHeaders(req: Request) {
  const requestOrigin = req.headers.get("origin");
  const configuredOrigins = [
    Deno.env.get("APP_URL"),
    ...(Deno.env.get("ALLOWED_ORIGIN") || "").split(","),
  ]
    .map((origin) => origin?.trim())
    .filter(Boolean) as string[];
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
    "Access-Control-Allow-Headers": "authorization, content-type, x-webhook-token, x-kiwify-token, x-kiwify-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function getPlanFromProduct(productName: string) {
  const normalized = productName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  if (normalized.includes("ouro")) {
    return {
      plan: "ouro",
      planCode: "ouro",
      credits: 250,
    };
  }

  if (normalized.includes("prata")) {
    return {
      plan: "prata",
      planCode: "prata",
      credits: 120,
    };
  }

  if (normalized.includes("bronze")) {
    return {
      plan: "bronze",
      planCode: "bronze",
      credits: 40,
    };
  }

  if (normalized.includes("ilimitado")) {
    return {
      plan: "ilimitado",
      planCode: "ilimitado",
      credits: 999_999,
    };
  }

  if (normalized.includes("pro")) {
    return {
      plan: "pro",
      planCode: "pro",
      credits: 100,
    };
  }

  return null;
}

async function getPlanFromDatabase(
  adminClient: ReturnType<typeof createClient>,
  productName: string,
) {
  const normalizedProductName = productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  try {
    const { data, error } = await adminClient
      .from("plan_configs")
      .select("code, credits, kiwify_product_keywords")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const matchedPlan = (data || []).find((plan) => {
      const keywords = Array.isArray(plan.kiwify_product_keywords)
        ? plan.kiwify_product_keywords
        : [];

      return keywords.some((keyword) => {
        const normalizedKeyword = String(keyword)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();

        return normalizedKeyword && normalizedProductName.includes(normalizedKeyword);
      });
    });

    if (!matchedPlan) return null;

    return {
      plan: matchedPlan.code,
      planCode: matchedPlan.code,
      credits: Number(matchedPlan.credits) || 0,
    };
  } catch (error) {
    console.warn("Erro ao buscar planos configurados; usando fallback:", error);
    return null;
  }
}

function normalizeEvent(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isPaidEvent(value: string) {
  const normalized = normalizeEvent(value);
  return normalized === "order.paid" || normalized === "compra aprovada" || normalized === "venda aprovada";
}

function isCancellationEvent(value: string) {
  const normalized = normalizeEvent(value);
  return [
    "subscription.canceled",
    "subscription.cancelled",
    "order.refunded",
    "refund",
    "reembolso",
    "chargeback",
    "order.chargeback",
    "assinatura cancelada",
  ].includes(normalized);
}

function getCustomerName(payload: KiwifyEvent) {
  const directName = payload.customer?.name || payload.customer?.full_name;
  if (directName) return String(directName).trim();

  const rawCustomer = payload.customer as Record<string, unknown> | undefined;
  const fallbackName = rawCustomer?.fullName || rawCustomer?.first_name || rawCustomer?.nome;
  return fallbackName ? String(fallbackName).trim() : "";
}

function generateTemporaryPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createUserForPurchase(
  adminClient: ReturnType<typeof createClient>,
  email: string,
  fullName: string,
) {
  const redirectTo = buildLoginRedirectUrl(Deno.env.get("APP_URL"));
  const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: generateTemporaryPassword(),
    email_confirm: true,
    user_metadata: {
      full_name: fullName || undefined,
      created_from: "kiwify",
    },
  });

  if (createError || !createdUser.user) {
    console.error("Erro ao criar usuário a partir da compra Kiwify:", createError);
    return {
      userId: null,
      accessEmailSent: false,
      error: createError?.message || "Erro ao criar usuário",
    };
  }

  const { error: profileError } = await adminClient.from("user_profiles").upsert({
    user_id: createdUser.user.id,
    email,
    full_name: fullName || null,
    role: "user",
    is_active: true,
    is_affiliate: false,
  }, { onConflict: "user_id" });

  if (profileError) {
    console.error("Usuário Kiwify criado, mas perfil falhou:", profileError);
    return {
      userId: createdUser.user.id,
      accessEmailSent: false,
      error: "Usuário criado, mas perfil não foi salvo",
    };
  }

  const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (resetError) {
    console.error("Usuário Kiwify criado, mas e-mail de acesso falhou:", resetError);
  }

  return {
    userId: createdUser.user.id,
    accessEmailSent: !resetError,
    error: resetError?.message || null,
  };
}

async function sha256(input: string) {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getEventId(payload: KiwifyEvent, rawBody: string) {
  if (payload.event_id) return payload.event_id;
  if (payload.id) return payload.id;
  if (payload.order?.id) return `${payload.event || "order"}:${payload.order.id}`;
  if (payload.subscription?.id) return `${payload.event || "subscription"}:${payload.subscription.id}`;

  return `sha256:${await sha256(rawBody)}`;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não suportado" }, 405, corsHeaders);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const KIWIFY_WEBHOOK_SECRET = Deno.env.get("KIWIFY_WEBHOOK_SECRET");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Variáveis do Supabase ausentes na kiwify-webhook.");
    return json({ error: "Configuração do servidor incompleta" }, 500, corsHeaders);
  }

  if (!KIWIFY_WEBHOOK_SECRET) {
    console.error("KIWIFY_WEBHOOK_SECRET ausente na kiwify-webhook.");
    return json({ error: "Webhook secret não configurado" }, 500, corsHeaders);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let rawBody = "";
  let payload: KiwifyEvent;

  try {
    rawBody = await req.text();
    payload = JSON.parse(rawBody) as KiwifyEvent;
  } catch (error) {
    console.error("Kiwify webhook JSON inválido:", error);
    return json({ error: "JSON inválido" }, 400, corsHeaders);
  }

  if (!hasExpectedSecret(KIWIFY_WEBHOOK_SECRET, extractWebhookToken(req))) {
    console.warn("Kiwify webhook rejeitado: token inválido.");
    return json({ error: "Webhook não autorizado" }, 401, corsHeaders);
  }

  const eventType = String(payload.event || "");
  const email = normalizeEmail(payload.customer?.email);
  const productName = String(payload.product?.name || "").trim();
  const customerName = getCustomerName(payload);
  const eventId = await getEventId(payload, rawBody);

  console.log("Kiwify webhook recebido:", {
    eventId,
    eventType,
    email,
    productName,
  });

  const baseEvent = {
    event_id: eventId,
    event_type: eventType,
    customer_email: email || null,
    product_name: productName || null,
    payload,
  };

  try {
    const { error: insertEventError } = await adminClient
      .from("kiwify_webhook_events")
      .insert(baseEvent);

    if (insertEventError) {
      if (insertEventError.code === "23505") {
        console.log("Kiwify webhook duplicado ignorado:", eventId);
        return json({ success: true, duplicate: true }, 200, corsHeaders);
      }

      console.error("Erro ao registrar evento Kiwify:", insertEventError);
      return json({ error: "Erro ao registrar evento" }, 500, corsHeaders);
    }

    if (!eventType || !email) {
      const message = "Evento sem tipo ou e-mail do cliente.";
      console.warn(message, { eventId, eventType, email });
      await adminClient
        .from("kiwify_webhook_events")
        .update({ status: "error", error_message: message, processed_at: new Date().toISOString() })
        .eq("event_id", eventId);

      return json({ error: message }, 400, corsHeaders);
    }

    const { data: profile, error: profileError } = await adminClient
      .from("user_profiles")
      .select("user_id, email")
      .ilike("email", email)
      .maybeSingle();

    if (profileError) {
      console.error("Erro ao buscar usuário do webhook:", profileError);
      await adminClient
        .from("kiwify_webhook_events")
        .update({ status: "error", error_message: "Erro ao buscar usuário", processed_at: new Date().toISOString() })
        .eq("event_id", eventId);

      return json({ error: "Erro ao buscar usuário" }, 500, corsHeaders);
    }

    let userId = profile?.user_id ?? null;
    let createdUserAccessEmailSent = false;

    if (!userId && isPaidEvent(eventType)) {
      const created = await createUserForPurchase(adminClient, email, customerName);
      userId = created.userId;
      createdUserAccessEmailSent = created.accessEmailSent;

      if (created.error) {
        console.warn("Resultado da criação automática Kiwify:", {
          eventId,
          email,
          userId,
          accessEmailSent: created.accessEmailSent,
          error: created.error,
        });
      }
    }

    if (!userId) {
      console.warn("Usuário não encontrado para evento Kiwify:", { eventId, email });
      await adminClient
        .from("kiwify_webhook_events")
        .update({
          status: "user_not_found",
          error_message: "Usuário não encontrado para o e-mail informado",
          processed_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);

      return json({ success: true, reconciled: false, reason: "user_not_found" }, 200, corsHeaders);
    }

    if (isPaidEvent(eventType)) {
      const mappedPlan = await getPlanFromDatabase(adminClient, productName) || getPlanFromProduct(productName);

      if (!mappedPlan) {
        const message = `Produto sem plano mapeado: ${productName}`;
        console.warn(message);
        await adminClient
          .from("kiwify_webhook_events")
          .update({
            user_id: userId,
            status: "ignored",
            error_message: message,
            processed_at: new Date().toISOString(),
          })
          .eq("event_id", eventId);

        return json({ success: true, ignored: true, reason: "product_not_mapped" }, 200, corsHeaders);
      }

      const now = new Date().toISOString();

      const { error: subscriptionError } = await adminClient
        .from("user_subscriptions")
        .upsert({
          user_id: userId,
          plan: mappedPlan.plan,
          plan_code: mappedPlan.planCode,
          status: "active",
          credits_included: mappedPlan.credits,
          provider: "kiwify",
          provider_reference: String(payload.order?.id || payload.subscription?.id || eventId),
          updated_at: now,
        }, { onConflict: "user_id" });

      if (subscriptionError) {
        console.error("Erro ao ativar assinatura Kiwify:", subscriptionError);
        throw subscriptionError;
      }

      const { error: creditsError } = await adminClient
        .from("user_credits")
        .upsert({
          user_id: userId,
          credits: mappedPlan.credits,
          updated_at: now,
        }, { onConflict: "user_id" });

      if (creditsError) {
        console.error("Erro ao atualizar créditos Kiwify:", creditsError);
        throw creditsError;
      }

      const { error: activateProfileError } = await adminClient
        .from("user_profiles")
        .update({ is_active: true, updated_at: now })
        .eq("user_id", userId);

      if (activateProfileError) {
        console.error("Erro ao reativar perfil após pagamento Kiwify:", activateProfileError);
        throw activateProfileError;
      }

      await adminClient
        .from("kiwify_webhook_events")
        .update({ user_id: userId, status: "processed", processed_at: now })
        .eq("event_id", eventId);

      console.log("Plano Kiwify ativado:", {
        eventId,
        userId,
        plan: mappedPlan.plan,
        credits: mappedPlan.credits,
        createdUserAccessEmailSent,
      });

      return json({
        success: true,
        plan: mappedPlan.plan,
        credits: mappedPlan.credits,
        userCreated: !profile?.user_id,
        accessEmailSent: createdUserAccessEmailSent,
      }, 200, corsHeaders);
    }

    if (isCancellationEvent(eventType)) {
      const now = new Date().toISOString();
      const { error: cancelError } = await adminClient
        .from("user_subscriptions")
        .update({ status: "canceled", updated_at: now })
        .eq("user_id", userId);

      if (cancelError) {
        console.error("Erro ao cancelar assinatura Kiwify:", cancelError);
        throw cancelError;
      }

      const { error: deactivateProfileError } = await adminClient
        .from("user_profiles")
        .update({ is_active: false, updated_at: now })
        .eq("user_id", userId);

      if (deactivateProfileError) {
        console.error("Erro ao bloquear perfil após cancelamento Kiwify:", deactivateProfileError);
        throw deactivateProfileError;
      }

      await adminClient
        .from("kiwify_webhook_events")
        .update({ user_id: userId, status: "processed", processed_at: now })
        .eq("event_id", eventId);

      console.log("Assinatura Kiwify cancelada:", { eventId, userId, eventType });
      return json({ success: true, status: "canceled" }, 200, corsHeaders);
    }

    console.log("Evento Kiwify ignorado:", { eventId, eventType });
    await adminClient
      .from("kiwify_webhook_events")
      .update({
        user_id: userId,
        status: "ignored",
        error_message: `Evento não tratado: ${eventType}`,
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId);

    return json({ success: true, ignored: true }, 200, corsHeaders);
  } catch (error) {
    console.error("Erro geral no webhook Kiwify:", error);
    await adminClient
      .from("kiwify_webhook_events")
      .update({
        status: "error",
        error_message: error instanceof Error ? error.message : "Erro desconhecido",
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId);

    return json({ error: "Erro ao processar webhook" }, 500, corsHeaders);
  }
});
