import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import type { IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";

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

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        inlineData?: {
          data?: string;
        };
        inline_data?: {
          data?: string;
        };
      }>;
    };
  }>;
};

const LOCAL_REMOTE_IMAGE_TIMEOUT_MS = 20_000;
const LOCAL_GEMINI_TIMEOUT_MS = 75_000;

function readRequestBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function localFetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Tempo limite excedido ao chamar ${url}`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
  const items: NormalizedMenuItem[] = [];
  let totalItems = 0;
  let skippedWithoutImage = 0;

  for (const section of menu || []) {
    for (const item of section.items || []) {
      totalItems += 1;

      if (!item.image) {
        skippedWithoutImage += 1;
        continue;
      }

      const name = item.name?.trim();
      if (!name) continue;

      items.push({
        id: item.id || item.code || randomUUID(),
        sectionName: section.name || "Cardápio",
        name,
        description: item.description || "",
        imageUrl: item.image,
        price: typeof item.price === "number" ? item.price : null,
        availability: item.availability || (item.enabled === false ? "UNAVAILABLE" : null),
      });
    }
  }

  return { items, totalItems, skippedWithoutImage };
}

function imageMimeTypeFromDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,/);
  return match?.[1] || "image/jpeg";
}

function imagePartFromDataUrl(value: string): GeminiPart {
  return {
    inline_data: {
      mime_type: imageMimeTypeFromDataUrl(value),
      data: value.split(",")[1] || value,
    },
  };
}

function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

async function imagePartFromRemoteUrl(value: string): Promise<GeminiPart> {
  let response: Response;

  try {
    response = await localFetchWithTimeout(
      value,
      {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; CardapioProIA/1.0; +https://cardapioproia.com.br)",
        },
      },
      LOCAL_REMOTE_IMAGE_TIMEOUT_MS,
    );
  } catch (error) {
    throw new Error(
      `Não foi possível baixar a imagem original do item do iFood: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    throw new Error(`Imagem do item retornou HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error("URL do item não retornou uma imagem válida");
  }

  const buffer = await response.arrayBuffer();

  return {
    inline_data: {
      mime_type: contentType,
      data: bytesToBase64(new Uint8Array(buffer)),
    },
  };
}

function buildGeminiPayload(parts: GeminiPart[]) {
  return {
    contents: [{ role: "user", parts }],
  };
}

async function callGeminiImage(apiKey: string, parts: GeminiPart[]) {
  const models = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];
  let lastStatus = 500;
  let lastBody = "";

  for (const model of models) {
    const response = await localFetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(buildGeminiPayload(parts)),
      },
      LOCAL_GEMINI_TIMEOUT_MS,
    );

    if (response.ok) return response;

    lastStatus = response.status;
    lastBody = await response.text();

    if (![429, 500, 502, 503, 504].includes(response.status)) {
      break;
    }
  }

  throw new Error(`Gemini API Error ${lastStatus}: ${lastBody.slice(0, 500)}`);
}

function getPatternInstructions(pattern: string) {
  switch (pattern) {
    case "pizza":
      return "Use fundo de madeira escura e iluminação quente, com clima acolhedor e rústico.";
    case "hamburguer":
      return "Use fundo escuro ou papel kraft, luz lateral dramática e destaque claro das camadas.";
    case "marmita":
      return "Use prato limpo, fundo neutro e iluminação natural equilibrada.";
    default:
      return "Siga uma direção visual limpa, comercial, realista e adequada para cardápio de delivery.";
  }
}

function localProcessFoodImagePlugin(geminiApiKey: string | undefined, supabaseUrl: string | undefined): Plugin {
  return {
    name: "local-process-food-image-function",
    configureServer(server) {
      server.middlewares.use("/api/functions/process-food-image", async (req, res, next) => {
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Método não permitido." });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const payload = JSON.parse(body || "{}") as {
            mode?: string;
            itemName?: string;
            itemDescription?: string;
            sourceImageUrl?: string;
            referenceImage?: string;
            restaurantUrl?: string;
            pattern?: string;
            feedback?: string;
          };

          if (payload.mode !== "menu_item") {
            if (!supabaseUrl) {
              sendJson(res, 501, { error: "Modo local disponível apenas para Item do iFood." });
              return;
            }

            next();
            return;
          }

          if (!geminiApiKey) {
            sendJson(res, 500, { error: "GEMINI_API_KEY não configurada no .env local." });
            return;
          }

          if (!payload.itemName || !payload.sourceImageUrl || !payload.referenceImage) {
            sendJson(res, 400, { error: "Item do iFood, imagem original e referência são obrigatórios." });
            return;
          }

          const prompt = `Você é um especialista em fotografia gastronômica para delivery.

Transforme a foto original de um item importado do iFood em uma imagem profissional, realista e altamente atrativa.

ORDEM DAS IMAGENS:
1. Primeira imagem: foto original do item do iFood. Preserve produto, formato e ingredientes aparentes.
2. Segunda imagem: referência visual. Siga estilo, luz, fundo, ângulo e composição.

ITEM:
- Nome: ${payload.itemName}
- Descrição: ${payload.itemDescription || "Sem descrição informada"}
- Restaurante: ${payload.restaurantUrl || "Não informado"}

DIREÇÃO VISUAL:
${getPatternInstructions(payload.pattern || "auto")}

REGRAS:
- Não troque o produto original.
- Não crie ingredientes irreais.
- Melhore nitidez, luz, contraste, cores e apresentação.
- Remova poluição visual, embalagens ruins e sombras duras.
- Resultado final horizontal e pronto para cardápio de delivery.
${payload.feedback?.trim() ? `\nAJUSTE SOLICITADO PELO USUÁRIO:\n${payload.feedback.trim()}` : ""}`;

          const parts: GeminiPart[] = [
            { text: prompt },
            await imagePartFromRemoteUrl(payload.sourceImageUrl),
            imagePartFromDataUrl(payload.referenceImage),
          ];

          const geminiResponse = await callGeminiImage(geminiApiKey, parts);
          const geminiData = (await geminiResponse.json()) as GeminiResponse;
          const imagePart = geminiData.candidates?.[0]?.content?.parts?.find(
            (part) => part.inlineData?.data || part.inline_data?.data,
          );
          const imageData = imagePart?.inlineData?.data || imagePart?.inline_data?.data;

          if (!imageData) {
            sendJson(res, 500, {
              error: "A IA não retornou uma imagem.",
              details: JSON.stringify(geminiData).slice(0, 500),
            });
            return;
          }

          sendJson(res, 200, {
            image: `data:image/jpeg;base64,${imageData}`,
            creditsDebited: false,
            localDev: true,
          });
        } catch (error) {
          console.error("local process-food-image error:", error);
          sendJson(res, 500, {
            error: "Erro interno ao processar imagem localmente.",
            details: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
  };
}

function localIfoodImportPlugin(geckoApiKey: string | undefined): Plugin {
  return {
    name: "local-ifood-import-function",
    configureServer(server) {
      server.middlewares.use("/api/functions/import-ifood-menu", async (req, res) => {
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method !== "POST") {
          sendJson(res, 405, { error: "Método não permitido." });
          return;
        }

        try {
          const body = await readRequestBody(req);
          const { url } = JSON.parse(body || "{}") as { url?: string };
          const restaurantUrl = url?.trim() || "";

          if (!isIfoodStoreUrl(restaurantUrl)) {
            sendJson(res, 400, { error: "Informe um link válido de restaurante do iFood." });
            return;
          }

          if (!geckoApiKey) {
            sendJson(res, 500, { error: "GECKO_API_KEY não configurada no .env local." });
            return;
          }

          const geckoResponse = await fetch("https://api.geckoapi.com.br/v1/extract", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${geckoApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              target: "ifood.com.br",
              type: "pdp",
              url: restaurantUrl,
            }),
          });

          const raw = await geckoResponse.text();
          const payload = raw ? (JSON.parse(raw) as GeckoExtractResponse) : null;

          if (!geckoResponse.ok) {
            sendJson(res, geckoResponse.status, {
              error: payload?.error || payload?.message || payload?.errorCode || "Não foi possível importar o cardápio.",
            });
            return;
          }

          if (payload?.notFound || !payload?.data?.data) {
            sendJson(res, 404, { error: "Não encontramos esse restaurante no iFood." });
            return;
          }

          const restaurant = payload.data.data;
          const normalized = normalizeMenu(restaurant.menu);

          sendJson(res, 200, {
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
          });
        } catch (error) {
          console.error("local import-ifood-menu error:", error);
          sendJson(res, 500, { error: "Erro interno ao importar o cardápio localmente." });
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const geckoApiKey = env.GECKO_API_KEY || process.env.GECKO_API_KEY;
  const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: supabaseUrl
        ? {
            "/api/functions": {
              target: supabaseUrl,
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(/^\/api\/functions/, "/functions/v1"),
            },
          }
        : undefined,
    },
    plugins: [localProcessFoodImagePlugin(geminiApiKey, supabaseUrl), localIfoodImportPlugin(geckoApiKey), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;

            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("@tanstack")) return "vendor-query";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("lucide-react")) return "vendor-icons";

            return "vendor";
          },
        },
      },
    },
  };
});
