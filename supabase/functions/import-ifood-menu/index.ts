import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://cardapioproia.vercel.app",
  "https://cardapioproia.com.br",
  "https://www.cardapioproia.com.br",
];

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

type GeckoMenuItem = {
  id?: string;
  code?: string;
  name?: string;
  description?: string;
  image?: string;
  price?: number;
  availability?: string;
  enabled?: boolean;
};

type GeckoMenuSection = {
  code?: string;
  name?: string;
  items?: GeckoMenuItem[];
};

type GeckoRestaurant = {
  name?: string;
  url?: string;
  merchantId?: string;
  mainImage?: {
    url?: string;
  };
  menu?: GeckoMenuSection[];
};

type GeckoExtractResponse = {
  error?: string;
  message?: string;
  errorCode?: string;
  notFound?: boolean;
  data?: {
    data?: GeckoRestaurant;
  };
};

type NormalizedMenuItem = {
  id: string;
  sectionName: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number | null;
  availability: string | null;
};

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
  const allowAny = allowedOrigins.includes("*");
  const allowedOrigin =
    allowAny || isLocalOrigin || (requestOrigin && allowedOrigins.includes(requestOrigin))
      ? requestOrigin || "*"
      : allowedOrigins[0];

  return {
    ...securityHeaders,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(payload: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isIfoodStoreUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)ifood\.com\.br$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function normalizeMenu(menu: GeckoMenuSection[] | undefined) {
  const allItems: NormalizedMenuItem[] = [];
  let totalItems = 0;
  let skippedWithoutImage = 0;

  for (const section of menu || []) {
    for (const item of section.items || []) {
      totalItems += 1;

      if (!item.image) {
        skippedWithoutImage += 1;
        continue;
      }

      const id = item.id || item.code || crypto.randomUUID();
      const name = item.name?.trim();
      if (!name) continue;

      allItems.push({
        id,
        sectionName: section.name || "Cardápio",
        name,
        description: item.description || "",
        imageUrl: item.image,
        price: typeof item.price === "number" ? item.price : null,
        availability: item.availability || (item.enabled === false ? "UNAVAILABLE" : null),
      });
    }
  }

  return {
    items: allItems,
    totalItems,
    skippedWithoutImage,
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json() as { url?: string };
    const restaurantUrl = url?.trim() || "";

    if (!isIfoodStoreUrl(restaurantUrl)) {
      return json({ error: "Informe um link válido de restaurante do iFood." }, 400, corsHeaders);
    }

    const GECKO_API_KEY = Deno.env.get("GECKO_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const authorization = req.headers.get("authorization");

    if (!GECKO_API_KEY) {
      throw new Error("GECKO_API_KEY não configurada");
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Variáveis do Supabase não configuradas");
    }

    if (!authorization) {
      return json({ error: "Faça login para importar itens do cardápio." }, 401, corsHeaders);
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();

    if (authError || !authData.user) {
      return json({ error: "Token de autenticação inválido" }, 401, corsHeaders);
    }

    const geckoResponse = await fetch("https://api.geckoapi.com.br/v1/extract", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GECKO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target: "ifood.com.br",
        type: "pdp",
        url: restaurantUrl,
      }),
    });

    const raw = await geckoResponse.text();
    let payload: GeckoExtractResponse | null = null;

    try {
      payload = raw ? (JSON.parse(raw) as GeckoExtractResponse) : null;
    } catch {
      payload = null;
    }

    if (!geckoResponse.ok) {
      const providerMessage = payload?.error || payload?.message || payload?.errorCode || raw;
      const message =
        geckoResponse.status === 401
          ? "A chave da GeckoAPI está inválida ou ausente."
          : geckoResponse.status === 402
            ? "Créditos insuficientes na GeckoAPI para importar esse cardápio."
            : geckoResponse.status === 429
              ? "Muitas importações em andamento. Aguarde alguns minutos e tente novamente."
              : geckoResponse.status >= 500
                ? "A GeckoAPI está instável no momento. Tente novamente em instantes."
                : providerMessage || "Não foi possível importar o cardápio.";

      return json({ error: message }, geckoResponse.status, corsHeaders);
    }

    if (payload?.notFound || !payload?.data?.data) {
      return json({ error: "Não encontramos esse restaurante no iFood." }, 404, corsHeaders);
    }

    const restaurant = payload.data.data;
    const normalized = normalizeMenu(restaurant.menu);

    return json(
      {
        restaurant: {
          name: restaurant.name || "",
          url: restaurant.url || restaurantUrl,
          merchantId: restaurant.merchantId || null,
          mainImageUrl: restaurant.mainImage?.url || null,
        },
        items: normalized.items,
        counts: {
          totalItems: normalized.totalItems,
          itemsWithImages: normalized.items.length,
          skippedWithoutImage: normalized.skippedWithoutImage,
        },
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error("import-ifood-menu error:", error);
    return json({ error: "Erro interno ao importar o cardápio. Tente novamente em instantes." }, 500, corsHeaders);
  }
});
