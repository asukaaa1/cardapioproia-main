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

const TIMEOUT_MS = 55_000;
const GEMINI_MODEL = Deno.env.get("GEMINI_IMAGE_MODEL") || "gemini-3.1-flash-image-preview";
const FLOW_REFERENCE_KEY = "__flow_reference";
const FLOW_COMBO_KEY = "__flow_combo";
const FLOW_PRESET_KEY = "__flow_preset";

interface GeminiResponse {
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
}

type CreateMode = "reference" | "combo" | "preset";

function imageMimeTypeFromDataUrl(value: string) {
  const match = value.match(/^data:([^;]+);base64,/);
  return match?.[1] || "image/jpeg";
}

function imagePartFromDataUrl(value: string) {
  return {
    inline_data: {
      mime_type: imageMimeTypeFromDataUrl(value),
      data: value.split(",")[1] || value,
    },
  };
}

function getPatternInstructions(pattern: string, customPrompts: Record<string, string>) {
  if (customPrompts[pattern]) {
    return customPrompts[pattern];
  }

  switch (pattern) {
    case "pizza":
      return "Use a dark wood background with warm lighting. The mood should be cozy and rustic.";
    case "marmita":
      return "Place the food on a clean white plate with a clean background and neutral lighting.";
    case "sobremesa":
      return "Use a light, bright background with soft, diffused lighting. The mood should be elegant and delicate.";
    case "japones":
      return "Use a dark background with high contrast lighting. The presentation should be sleek and minimal.";
    case "hamburguer":
      return "Use a dark slate or kraft paper background with dramatic side lighting. Show the layers clearly. Bold and appetizing mood.";
    case "acai":
      return "Use a clean white or light wooden background with bright overhead lighting. Show toppings clearly arranged. Fresh and vibrant mood.";
    case "arabe":
      return "Use warm terracotta or wooden backgrounds with golden-hour lighting. Rich and welcoming atmosphere.";
    case "executivo":
      return "Clean white plate on a white or marble surface. Overhead or 45-degree angle shot. Minimal and professional.";
    default:
      return "Follow the selected visual direction with clean composition, consistent lighting and strong commercial presentation.";
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      productImage,
      referenceImage,
      comboImages,
      pattern = "auto",
      feedback,
      mode = "reference",
    } = await req.json() as {
      productImage?: string;
      referenceImage?: string;
      comboImages?: string[];
      pattern?: string;
      feedback?: string;
      mode?: CreateMode;
    };

    if (mode === "reference" && (!productImage || !referenceImage)) {
      return new Response(
        JSON.stringify({ error: "Imagens do produto e referência são obrigatórias" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "combo" && (!comboImages || comboImages.filter(Boolean).length < 2)) {
      return new Response(
        JSON.stringify({ error: "Envie pelo menos duas imagens para montar o combo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "preset" && !productImage) {
      return new Response(
        JSON.stringify({ error: "A foto do produto é obrigatória para o preset" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY não configurada");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("authorization");
    let authenticatedUserId: string | null = null;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
      throw new Error("Variáveis do Supabase não configuradas");
    }

    if (authorization) {
      const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      });

      const { data: authData, error: authError } = await authClient.auth.getUser();

      if (authError) {
        return new Response(
          JSON.stringify({ error: "Token de autenticação inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      authenticatedUserId = authData.user?.id ?? null;
    }

    if (!authenticatedUserId) {
      return new Response(
        JSON.stringify({ error: "Faça login para gerar imagens com créditos." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profileData, error: profileError } = await adminClient
      .from("user_profiles")
      .select("role, is_active")
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (profileError && profileError.code !== "PGRST116") {
      console.error("Erro ao buscar perfil:", profileError);
      return new Response(
        JSON.stringify({ error: "Não foi possível validar seu perfil." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (profileData?.is_active === false) {
      return new Response(
        JSON.stringify({ error: "Seu acesso à plataforma está desativado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isAdmin = profileData?.role === "admin";

    const { data: subscriptionData, error: subscriptionError } = await adminClient
      .from("user_subscriptions")
      .select("status")
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (subscriptionError && subscriptionError.code !== "PGRST116") {
      console.error("Erro ao buscar assinatura:", subscriptionError);
      return new Response(
        JSON.stringify({ error: "Não foi possível validar sua assinatura." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isAdmin && subscriptionData?.status === "canceled") {
      return new Response(
        JSON.stringify({ error: "Seu plano está cancelado. Regularize a assinatura para continuar." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: creditData, error: creditError } = await adminClient
      .from("user_credits")
      .select("credits")
      .eq("user_id", authenticatedUserId)
      .maybeSingle();

    if (creditError && creditError.code !== "PGRST116") {
      console.error("Erro ao buscar créditos:", creditError);
      return new Response(
        JSON.stringify({ error: "Não foi possível validar seus créditos." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isAdmin && (!creditData || creditData.credits <= 0)) {
      return new Response(
        JSON.stringify({ error: "Sem créditos disponíveis" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let universalPromptCustom = "";
    let patternPromptsCustom: Record<string, string> = {};

    if (authenticatedUserId) {
      try {
        const { data: promptsData, error: promptsError } = await adminClient
          .from("prompts_config")
          .select("universal_prompt, pattern_prompts")
          .eq("user_id", authenticatedUserId)
          .maybeSingle();

        if (promptsError) throw promptsError;

        if (promptsData) {
          universalPromptCustom = promptsData.universal_prompt || "";
          patternPromptsCustom = promptsData.pattern_prompts || {};
        }
      } catch (e) {
        console.warn("Erro ao buscar prompts customizados:", e);
      }
    }

    const patternInstructions = getPatternInstructions(pattern, patternPromptsCustom);

    const DEFAULT_REFERENCE_PROMPT = `Você é um especialista em fotografia gastronômica profissional e edição de imagens para cardápios de delivery. Sua tarefa é melhorar a imagem do produto enviada e padronizá-la com base na imagem de referência, criando uma foto final profissional, limpa, realista e altamente atrativa para aumentar conversões em aplicativos como iFood.

Receberá duas imagens: a primeira é a imagem principal (PRIMEIRA IMAGEM) e a segunda é a imagem de referência (SEGUNDA IMAGEM, padrão visual desejado). A imagem principal deve ser usada como base do produto, enquanto a imagem de referência deve ser usada exclusivamente como base de estilo visual.

MELHORIAS NA IMAGEM DO PRODUTO:
- Aumente nitidez e resolução
- Corrija iluminação e contraste
- Ajuste as cores para uma aparência mais natural e apetitosa
- Remova ruídos e imperfeições

PADRONIZAÇÃO RIGOROSA SEGUINDO A REFERÊNCIA:
- Replique a iluminação (direção, intensidade e temperatura)
- Reproduza o cenário ou fundo
- Iguale a paleta de cores
- Siga o mesmo ângulo e enquadramento da câmera
- Utilize profundidade de campo semelhante, com fundo levemente desfocado quando necessário

REGRAS CRÍTICAS SOBRE O PRODUTO:
- O produto deve permanecer fiel à imagem original, sem alteração de formato ou características reais
- Apenas melhore sua aparência visual, destacando textura, brilho e frescor
- Deixe-o mais apetitoso e profissional

ELEMENTOS A IGNORAR/REMOVER:
- Ignore completamente elementos indesejados da imagem principal: fundos poluídos, embalagens (plástico, isopor, alumínio), mãos, pessoas, talheres mal posicionados, reflexos ruins, sombras duras, sujeira ou objetos irrelevantes
- Utilize apenas o alimento como base
- Na imagem de referência, ignore o tipo de alimento e qualquer elemento que não combine com o produto principal
- Use a referência apenas como padrão de iluminação, cenário, cores e composição

RESOLUÇÃO DE CONFLITOS:
Em caso de conflito entre as imagens, priorize sempre: 1) o produto da imagem principal, 2) o estilo visual da imagem de referência

COMPOSIÇÃO FINAL:
- O produto deve estar centralizado, com fundo limpo, sem distrações
- Estética premium de cardápio profissional
- A imagem final deve parecer que foi feita no mesmo ensaio fotográfico da referência
- Alta definição, formato 430×300 px com foco total no produto

RESTRIÇÕES FINAIS:
- Não crie elementos irreais
- Não altere o tipo de produto
- Não exagere em efeitos artificiais
- Resultado deve ser padronizado, profissional e altamente atrativo, otimizado para aumentar vendas no delivery`;

    const DEFAULT_COMBO_PROMPT = `Você é um diretor de arte especializado em montar fotos de combo para delivery. Sua tarefa é receber várias imagens de produtos individuais e criar uma única imagem final com todos os itens do combo organizados de forma comercial, realista e muito atrativa.

OBJETIVO:
- unir os produtos enviados em uma única composição
- criar leitura visual clara de combo
- manter aparência premium, limpa e apetitosa
- otimizar a imagem final para venda em cardápios digitais

REGRAS PRINCIPAIS:
- mantenha cada produto fiel à foto original
- preserve proporções realistas entre os itens
- organize os produtos com hierarquia visual clara
- o item principal deve receber maior destaque
- use iluminação consistente em todos os elementos
- crie uma composição equilibrada, limpa e profissional
- resultado final deve parecer pronto para banner ou cardápio`;

    const DEFAULT_PRESET_PROMPT = `Você é um especialista em fotografia gastronômica com presets visuais padronizados. Sua tarefa é receber a foto de um produto e aplicá-la em uma composição pronta, com enquadramento, cenário, luz e acabamento consistentes.

OBJETIVO:
- gerar imagem final pronta com base em preset visual
- manter identidade visual limpa, comercial e profissional
- acelerar produção com padronização forte

REGRAS:
- preserve o produto original sem trocar formato ou tipo
- aplique o preset escolhido como direção principal de cenário, luz, ângulo e composição
- mantenha aparência realista e apetitosa
- destaque textura, frescor e contraste do alimento
- centralize o produto com enquadramento adequado para cardápio`;

    const referencePrompt = patternPromptsCustom[FLOW_REFERENCE_KEY] || universalPromptCustom || DEFAULT_REFERENCE_PROMPT;
    const comboPrompt = patternPromptsCustom[FLOW_COMBO_KEY] || DEFAULT_COMBO_PROMPT;
    const presetPrompt = patternPromptsCustom[FLOW_PRESET_KEY] || DEFAULT_PRESET_PROMPT;

    let prompt = "";
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [];

    if (mode === "reference") {
      prompt = `${referencePrompt}\n\nPADRÃO ESPECÍFICO DO RESTAURANTE:\n${patternInstructions}`;
      parts.push({ text: prompt });
      parts.push(imagePartFromDataUrl(productImage!));
      parts.push(imagePartFromDataUrl(referenceImage!));
    } else if (mode === "combo") {
      prompt = `${comboPrompt}

INSTRUÇÃO EXTRA:
- Monte uma única foto final com todos os produtos enviados.
- Crie composição coerente, premium e pronta para venda.
- Não exclua itens importantes.
- Formato final horizontal para cardápio.
- O resultado deve parecer fotografado em uma única cena.`;
      parts.push({ text: prompt });
      comboImages!.filter(Boolean).forEach((image, index) => {
        parts.push({ text: `IMAGEM ${index + 1}: produto do combo para ser integrado na composição final.` });
        parts.push(imagePartFromDataUrl(image));
      });
    } else {
      prompt = `${presetPrompt}\n\nPRESET VISUAL ESCOLHIDO:\n${patternInstructions}`;
      parts.push({ text: prompt });
      parts.push(imagePartFromDataUrl(productImage!));
    }

    if (feedback && feedback.trim()) {
      prompt = `SOLICITAÇÃO DIRETA DO USUÁRIO (MÁXIMA PRIORIDADE):\n${feedback}\n\n===\n\n${prompt}\n\nIMPORTANTE: Execute EXATAMENTE o que o usuário solicitou acima. A solicitação do usuário sobrescreve qualquer instrução anterior que conflite com ela.`;
      parts[0] = { text: prompt };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: {
                aspectRatio: "4:3",
                imageSize: "1K",
              },
            },
          }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Gemini API error:", response.status, errorBody);

      return new Response(
        JSON.stringify({
          error: "A API de imagem recusou a solicitação. Tente outra imagem ou tente novamente.",
          details: `Gemini API Error: ${response.status}`,
        }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json() as GeminiResponse;
    const imagePart = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data || part.inline_data?.data);
    const imageData = imagePart?.inlineData?.data || imagePart?.inline_data?.data;

    if (!imageData) {
      console.error("No image in response:", JSON.stringify(data).substring(0, 300));
      return new Response(
        JSON.stringify({ error: "A IA não retornou uma imagem. Tente novamente." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resultDataUrl = `data:image/jpeg;base64,${imageData}`;

    if (!isAdmin) {
      const { data: debitSuccess, error: debitError } = await adminClient.rpc("debit_user_credit", {
        target_user_id: authenticatedUserId,
        amount: 1,
      });

      if (debitError || debitSuccess !== true) {
        console.error("Erro ao debitar crédito:", debitError || { debitSuccess, authenticatedUserId });
        return new Response(
          JSON.stringify({ error: "Não foi possível debitar seus créditos. Tente novamente." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ image: resultDataUrl, creditsDebited: !isAdmin }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
