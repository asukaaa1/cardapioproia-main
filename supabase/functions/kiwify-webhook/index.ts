import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const corsHeaders = {
  ...securityHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-webhook-token, x-kiwify-token, x-kiwify-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type KiwifyEvent = {
  id?: string;
  event_id?: string;
  event?: string;
  webhook_event_type?: string;
  order_status?: string;
  customer?: {
    email?: string;
    name?: string;
    full_name?: string;
  };
  Customer?: {
    email?: string;
    name?: string;
    full_name?: string;
  };
  product?: {
    id?: string;
    name?: string;
  };
  Product?: {
    product_id?: string;
    product_name?: string;
    id?: string;
    name?: string;
  };
  order?: {
    id?: string;
  };
  order_id?: string;
  order_ref?: string;
  subscription?: {
    id?: string;
  };
  subscription_id?: string;
  checkout_link?: string;
  [key: string]: unknown;
};

function json(data: unknown, status = 200) {
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

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!name || !domain) return "email_indisponivel";
  return `${name.slice(0, 2)}***@${domain}`;
}

const KIWIFY_CHECKOUT_PLAN_MATCHES = [
  { token: "hhvvb5i", plan: "bronze", planCode: "bronze", credits: 40 },
  { token: "hhvb5i", plan: "bronze", planCode: "bronze", credits: 40 },
  { token: "ettcvqn", plan: "prata", planCode: "prata", credits: 120 },
  { token: "z026oye", plan: "ouro", planCode: "ouro", credits: 250 },
];

function getPlanFromProduct(productName: string) {
  const normalized = productName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const checkoutMatch = KIWIFY_CHECKOUT_PLAN_MATCHES.find((item) => normalized.includes(item.token));
  if (checkoutMatch) return checkoutMatch;

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

  return null;
}

async function getPlanFromDatabase(
  adminClient: ReturnType<typeof createClient>,
  productMatcher: string,
) {
  const normalizedProductMatcher = productMatcher
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

        return normalizedKeyword && normalizedProductMatcher.includes(normalizedKeyword);
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
  return [
    "order.paid",
    "order_approved",
    "paid",
    "approved",
    "compra aprovada",
    "venda aprovada",
  ].includes(normalized);
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
  const directName =
    payload.customer?.name ||
    payload.customer?.full_name ||
    payload.Customer?.name ||
    payload.Customer?.full_name;
  if (directName) return String(directName).trim();

  const rawCustomer = (payload.customer || payload.Customer) as Record<string, unknown> | undefined;
  const fallbackName = rawCustomer?.fullName || rawCustomer?.first_name || rawCustomer?.nome;
  return fallbackName ? String(fallbackName).trim() : "";
}

function getEventType(payload: KiwifyEvent) {
  return String(payload.event || payload.webhook_event_type || payload.order_status || "");
}

function getCustomerEmail(payload: KiwifyEvent) {
  return normalizeEmail(payload.customer?.email || payload.Customer?.email);
}

function getProductName(payload: KiwifyEvent) {
  return String(
    payload.product?.name ||
      payload.Product?.product_name ||
      payload.Product?.name ||
      "",
  ).trim();
}

function getProductMatcher(payload: KiwifyEvent, productName: string) {
  return [
    productName,
    payload.product?.id,
    payload.Product?.product_id,
    payload.Product?.id,
    payload.checkout_link,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function generateTemporaryPassword() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getAppUrl() {
  return (
    Deno.env.get("APP_URL") ||
    Deno.env.get("SITE_URL") ||
    "https://cardapioproia.vercel.app"
  ).replace(/\/$/, "");
}

async function createUserForPurchase(
  adminClient: ReturnType<typeof createClient>,
  email: string,
  fullName: string,
  req: Request,
) {
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

  const redirectTo = `${getAppUrl()}/login`;
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
  if (payload.order_id) return `${getEventType(payload) || "order"}:${payload.order_id}`;
  if (payload.order_ref) return `${getEventType(payload) || "order"}:${payload.order_ref}`;
  if (payload.subscription_id) return `${getEventType(payload) || "subscription"}:${payload.subscription_id}`;

  return `sha256:${await sha256(rawBody)}`;
}

function extractWebhookToken(req: Request) {
  const url = new URL(req.url);
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";

  return (
    req.headers.get("x-webhook-token") ||
    req.headers.get("x-kiwify-token") ||
    req.headers.get("x-kiwify-signature") ||
    bearer ||
    url.searchParams.get("token")
  );
}

function isValidWebhookSecret(req: Request, payload?: KiwifyEvent) {
  const expected = Deno.env.get("KIWIFY_WEBHOOK_SECRET");

  if (!expected) {
    console.error("KIWIFY_WEBHOOK_SECRET não configurado; webhook rejeitado por segurança.");
    return false;
  }

  const received = extractWebhookToken(req) || String(payload?.token || "");
  return received === expected;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não suportado" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Variáveis do Supabase ausentes na kiwify-webhook.");
    return json({ error: "Configuração do servidor incompleta" }, 500);
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let rawBody = "";
  let payload: KiwifyEvent;

  try {
    rawBody = await req.text();
    payload = JSON.parse(rawBody) as KiwifyEvent;
  } catch (error) {
    console.error("Kiwify webhook JSON inválido:", error);
    return json({ error: "JSON inválido" }, 400);
  }

  if (!isValidWebhookSecret(req, payload)) {
    console.warn("Kiwify webhook rejeitado: token inválido.");
    return json({ error: "Webhook não autorizado" }, 401);
  }

  const eventType = getEventType(payload);
  const email = getCustomerEmail(payload);
  const productName = getProductName(payload);
  const productMatcher = getProductMatcher(payload, productName);
  const customerName = getCustomerName(payload);
  const eventId = await getEventId(payload, rawBody);

  console.log("Kiwify webhook recebido:", {
    eventId,
    eventType,
    email: email ? maskEmail(email) : null,
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
        return json({ success: true, duplicate: true });
      }

      console.error("Erro ao registrar evento Kiwify:", insertEventError);
      return json({ error: "Erro ao registrar evento" }, 500);
    }

    if (!eventType || !email) {
      const message = "Evento sem tipo ou e-mail do cliente.";
      console.warn(message, { eventId, eventType, email });
      await adminClient
        .from("kiwify_webhook_events")
        .update({ status: "error", error_message: message, processed_at: new Date().toISOString() })
        .eq("event_id", eventId);

      return json({ error: message }, 400);
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

      return json({ error: "Erro ao buscar usuário" }, 500);
    }

    let userId = profile?.user_id ?? null;
    let createdUserAccessEmailSent = false;

    if (!userId && isPaidEvent(eventType)) {
      const created = await createUserForPurchase(adminClient, email, customerName, req);
      userId = created.userId;
      createdUserAccessEmailSent = created.accessEmailSent;

      if (created.error) {
        console.warn("Resultado da criação automática Kiwify:", {
          eventId,
          email: maskEmail(email),
          userId,
          accessEmailSent: created.accessEmailSent,
          error: created.error,
        });
      }
    }

    if (!userId) {
      console.warn("Usuário não encontrado para evento Kiwify:", { eventId, email: maskEmail(email) });
      await adminClient
        .from("kiwify_webhook_events")
        .update({
          status: "user_not_found",
          error_message: "Usuário não encontrado para o e-mail informado",
          processed_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);

      return json({ success: true, reconciled: false, reason: "user_not_found" });
    }

    if (isPaidEvent(eventType)) {
      const mappedPlan = await getPlanFromDatabase(adminClient, productMatcher) || getPlanFromProduct(productMatcher);

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

        return json({ success: true, ignored: true, reason: "product_not_mapped" });
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
          provider_reference: String(payload.order?.id || payload.order_id || payload.subscription?.id || payload.subscription_id || eventId),
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

      const { error: creditTransactionError } = await adminClient
        .from("credit_transactions")
        .insert({
          user_id: userId,
          amount: mappedPlan.credits,
          balance_after: mappedPlan.credits,
          reason: "kiwify_order_paid",
          reference_type: "kiwify_event",
          reference_id: eventId,
          metadata: {
            eventType,
            productName,
            provider_reference: String(payload.order?.id || payload.order_id || payload.subscription?.id || payload.subscription_id || eventId),
            plan: mappedPlan.plan,
          },
        });

      if (creditTransactionError) {
        console.error("Erro ao auditar créditos Kiwify:", creditTransactionError);
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
      });
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
      return json({ success: true, status: "canceled" });
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

    return json({ success: true, ignored: true });
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

    return json({ error: "Erro ao processar webhook" }, 500);
  }
});
