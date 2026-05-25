import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  Circle,
  Download,
  Layers3,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Utensils,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import ImageUploadZone from "@/components/ImageUploadZone";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import PatternSelect from "@/components/PatternSelect";
import { ImageAdjustments, defaultAdjustments, buildFilterStyle } from "@/components/ImageAdjustments";
import type { Adjustments } from "@/components/ImageAdjustments";
import { getSessionId } from "@/lib/session";
import { getSessionHeaders } from "@/lib/supabaseHeaders";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isMissingRelationError, recordDownload } from "@/lib/usageMetrics";
import { getEdgeFunctionUrl } from "@/lib/edgeFunctions";
import { uploadHistoryImage } from "@/lib/imageStorage";

type ProcessStep = "idle" | "uploading" | "processing" | "saving" | "done";
type CreateMode = "reference" | "combo" | "preset" | "menu_item";

type ImportedMenuItem = {
  id: string;
  sectionName: string;
  name: string;
  description: string;
  imageUrl: string;
  price: number | null;
  availability: string | null;
};

type ImportedRestaurant = {
  name: string;
  url: string;
  merchantId: string | null;
  mainImageUrl: string | null;
};

const stepLabels: Record<ProcessStep, string> = {
  idle: "",
  uploading: "Enviando imagens...",
  processing: "IA processando a foto...",
  saving: "Salvando resultado...",
  done: "Concluído!",
};

const steps: ProcessStep[] = ["uploading", "processing", "saving", "done"];

const modeCards = [
  {
    value: "reference" as const,
    title: "Com referência",
    description: "Use uma foto do produto e uma direção visual para gerar um resultado mais alinhado.",
    icon: Sparkles,
    status: "Disponível agora",
  },
  {
    value: "menu_item" as const,
    title: "Item do iFood",
    description: "Cole o link do restaurante, escolha um item com foto e gere uma versão profissional.",
    icon: Utensils,
    status: "Disponível agora",
  },
  {
    value: "combo" as const,
    title: "Montar imagem",
    description: "Junte produtos ou variações e transforme tudo em uma única imagem final.",
    icon: Layers3,
    status: "Em breve",
  },
  {
    value: "preset" as const,
    title: "Foto predefinida",
    description: "Aplique composições prontas com configurações padrão para acelerar a criação.",
    icon: Wand2,
    status: "Em breve",
  },
];

const imageAssemblyOptions = [
  { value: "combo", label: "Combo" },
  { value: "pizza_2_sabores", label: "Pizza 2 sabores" },
  { value: "pizza_4_sabores", label: "Pizza 4 sabores" },
  { value: "meio_a_meio", label: "Meio a meio" },
];

const PROCESS_TIMEOUT_MS = 90_000;

function getExpiresAtIso() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function isDataUrl(value: string) {
  return value.startsWith("data:");
}

function formatPrice(value: number | null) {
  if (value === null || Number.isNaN(value)) return "";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

async function readErrorPayload(response: Response) {
  const raw = await response.text();

  try {
    const parsed = JSON.parse(raw);
    return {
      message:
        parsed?.error ||
        parsed?.message ||
        parsed?.msg ||
        raw ||
        `Erro HTTP ${response.status}`,
      details: parsed?.details || parsed?.debug || raw || "",
    };
  } catch {
    return {
      message: raw || `Erro HTTP ${response.status}`,
      details: raw || "",
    };
  }
}

function normalizeModeError(message: string, mode: CreateMode) {
  if (mode !== "reference" && message.toLowerCase().includes("refer")) {
    if (mode === "combo") {
      return "As imagens do combo já foram enviadas. Esse erro indica que o backend ainda está tentando usar a regra antiga de foto de referência.";
    }

    return "A imagem do produto já foi enviada. Esse erro indica que o backend ainda está tentando usar a regra antiga de foto de referência.";
  }

  return message;
}

function buildProcessErrorMessage(response: Response, payload: { message: string; details?: string }, mode: CreateMode) {
  const normalizedMessage = normalizeModeError(payload.message || "Erro ao processar imagem", mode);

  if (response.status === 403 && normalizedMessage.toLowerCase().includes("crédito")) {
    return "Sem créditos disponíveis";
  }
  if (response.status === 401) return "Sua sessão expirou. Entre novamente para gerar imagens.";
  if (response.status === 402) return "Créditos de IA insuficientes. Contate o suporte.";
  if (response.status === 429) return "Muitas requisições. Aguarde alguns minutos e tente novamente.";
  if (response.status === 504) return "Tempo limite excedido. Tente novamente.";

  if (mode === "menu_item") {
    const lowerMessage = normalizedMessage.toLowerCase();
    const lowerDetails = String(payload.details || "").toLowerCase();
    const imageLoadFailed =
      lowerDetails.includes("imagem original") ||
      lowerDetails.includes("imagem do item") ||
      lowerDetails.includes("url do item") ||
      lowerDetails.includes("fetch failed");
    const geminiFailed =
      lowerDetails.includes("gemini") ||
      lowerMessage.includes("gemini") ||
      lowerMessage.includes("ia não retornou") ||
      lowerMessage.includes("api de imagem");

    if (imageLoadFailed) {
      return [
        "Falha ao carregar a imagem original do item do iFood.",
        "Causa provável: a URL da foto importada expirou, está bloqueada ou não pode ser baixada pelo servidor local.",
        `Detalhe técnico: HTTP ${response.status}${payload.details ? ` - ${payload.details}` : ""}`,
      ].join(" ");
    }

    if (geminiFailed) {
      return [
        "Falha ao chamar a IA de imagem.",
        "Causa provável: chave GEMINI_API_KEY ausente/inválida, modelo indisponível ou a API não retornou uma imagem.",
        `Detalhe técnico: HTTP ${response.status}${payload.details ? ` - ${payload.details}` : ""}`,
      ].join(" ");
    }

    const maybeOldFunction =
      response.status >= 500 &&
      (lowerMessage.includes("erro interno") ||
        lowerMessage.includes("internal") ||
        lowerDetails.includes("cannot read") ||
        lowerDetails.includes("undefined"));

    if (maybeOldFunction) {
      return [
        "Falha no modo Item do iFood.",
        "Causa provável: a função process-food-image publicada no Supabase ainda não tem suporte ao modo menu_item.",
        "Deploy necessário: supabase/functions/process-food-image.",
        `Detalhe técnico: HTTP ${response.status}${payload.details ? ` - ${payload.details}` : ""}`,
      ].join(" ");
    }

    return [
      normalizedMessage,
      `Detalhe técnico: process-food-image retornou HTTP ${response.status}.`,
      "Entrada enviada: item do iFood + imagem de referência.",
      payload.details ? `Backend: ${payload.details}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return normalizedMessage;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Tempo limite excedido ao gerar a imagem. Tente novamente.");
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function StepIndicator({ current }: { current: ProcessStep }) {
  if (current === "idle") return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {steps.map((step, i) => {
        const currentIndex = steps.indexOf(current);
        const isDone = i < currentIndex || current === "done";
        const isActive = step === current;

        return (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                isDone ? "text-primary" : isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {isDone ? (
                <CheckCircle className="h-3.5 w-3.5 text-primary" />
              ) : isActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
              )}
              <span>{stepLabels[step]}</span>
            </div>
            {i < steps.length - 1 && <div className={`h-px w-6 ${isDone ? "bg-primary" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function MelhorarFotos() {
  const { user, session, profile } = useAuth();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<CreateMode>("reference");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [comboImages, setComboImages] = useState<(string | null)[]>([null, null, null, null]);
  const [imageAssemblyType, setImageAssemblyType] = useState("combo");
  const [presetImage, setPresetImage] = useState<string | null>(null);
  const [restaurantUrl, setRestaurantUrl] = useState("");
  const [importedRestaurant, setImportedRestaurant] = useState<ImportedRestaurant | null>(null);
  const [importedItems, setImportedItems] = useState<ImportedMenuItem[]>([]);
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string | null>(null);
  const [menuItemReferenceImage, setMenuItemReferenceImage] = useState<string | null>(null);
  const [importCounts, setImportCounts] = useState({ totalItems: 0, itemsWithImages: 0, skippedWithoutImage: 0 });
  const [isImportingMenu, setIsImportingMenu] = useState(false);
  const [pattern, setPattern] = useState("auto");
  const [presetPattern, setPresetPattern] = useState("hamburguer");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [step, setStep] = useState<ProcessStep>("idle");
  const [adjustments, setAdjustments] = useState<Adjustments>(defaultAdjustments);
  const [feedback, setFeedback] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [savedPhotoId, setSavedPhotoId] = useState<string | null>(null);

  const { data: creditData, isLoading: isLoadingCredits } = useQuery({
    queryKey: ["user_credits", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error && !isMissingRelationError(error) && error.code !== "PGRST116") {
        throw error;
      }

      return { credits: data?.credits ?? 0 };
    },
    staleTime: 15_000,
  });

  const { data: subscriptionData } = useQuery({
    queryKey: ["user_subscription", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_subscriptions")
        .select("plan, plan_code, status")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error && !isMissingRelationError(error) && error.code !== "PGRST116") {
        throw error;
      }

      return data;
    },
    staleTime: 30_000,
  });

  const creditsAvailable = creditData?.credits ?? 0;
  const isAdmin = profile?.role === "admin";
  const hasCredits = isAdmin || creditsAvailable > 0;
  const currentPlan = subscriptionData?.plan ?? subscriptionData?.plan_code ?? "free";
  const canUseAdjustments = ["prata", "ouro", "pro", "ilimitado", "unlimited"].includes(currentPlan);
  const isProcessing = step !== "idle" && step !== "done";
  const selectedMenuItem = importedItems.find((item) => item.id === selectedMenuItemId) ?? null;
  const comboCount = comboImages.filter(Boolean).length;
  const hasRequiredInputs =
    (mode === "reference" && Boolean(productImage && referenceImage)) ||
    (mode === "combo" && comboCount >= 2) ||
    (mode === "preset" && Boolean(presetImage)) ||
    (mode === "menu_item" && Boolean(selectedMenuItem && menuItemReferenceImage));
  const activePrimaryImage =
    mode === "reference"
      ? productImage
      : mode === "preset"
        ? presetImage
        : mode === "menu_item"
          ? selectedMenuItem?.imageUrl ?? null
          : comboImages.find(Boolean) ?? null;
  const canProcess =
    !isProcessing &&
    hasRequiredInputs &&
    (isAdmin || !isLoadingCredits) &&
    hasCredits;
  const canRegenerate =
    Boolean(resultImage && feedback.trim()) &&
    !isRegenerating &&
    hasRequiredInputs &&
    (isAdmin || !isLoadingCredits) &&
    hasCredits;
  const menuItemDisabledReason = (() => {
    if (mode !== "menu_item" || isProcessing || canProcess) return "";
    if (!selectedMenuItem) return "Selecione um item";
    if (!menuItemReferenceImage) return "Envie referência de estilo";
    if (!isAdmin && isLoadingCredits) return "Verificando seus créditos...";
    if (!hasCredits) return "Sem créditos disponíveis";
    return "";
  })();
  const menuItemGenerateLabel = menuItemDisabledReason || "Gerar foto do item";

  const getFunctionHeaders = async (forceRefresh = false) => {
    const headers = getSessionHeaders({
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    });

    let activeSession = session;

    if (forceRefresh) {
      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();

      if (!refreshError && refreshedData.session) {
        activeSession = refreshedData.session;
      }
    }

    if (!activeSession) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new Error("Não foi possível validar sua sessão. Entre novamente.");
      }

      activeSession = sessionData.session;
    }

    const expiresAt = activeSession?.expires_at ? activeSession.expires_at * 1000 : 0;

    if (activeSession && expiresAt && expiresAt < Date.now() + 60_000) {
      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError) {
        throw new Error("Sua sessão expirou. Entre novamente para gerar imagens.");
      }

      activeSession = refreshedData.session;
    }

    if (!activeSession?.access_token) {
      throw new Error("Faça login para gerar imagens com créditos.");
    }

    headers.set("Authorization", `Bearer ${activeSession.access_token}`);

    return headers;
  };

  const persistHistoryInBackground = (originalImage: string, generatedImage: string, usedPattern: string, toastId: string) => {
    setSavedPhotoId(null);

    void (async () => {
      try {
        await saveToHistory(originalImage, generatedImage, usedPattern);
      } catch (saveError) {
        console.error("Photo history save error:", saveError);
        setSavedPhotoId(null);
        toast.warning("Imagem gerada, mas não foi possível salvá-la no histórico. Você ainda pode baixá-la agora.", {
          id: toastId,
        });
      }
    })();
  };

  const callProcessFoodImage = async (payload: Record<string, unknown>) => {
    const request = async (forceRefresh: boolean) =>
      fetchWithTimeout(
        getEdgeFunctionUrl("process-food-image"),
        {
          method: "POST",
          headers: await getFunctionHeaders(forceRefresh),
          body: JSON.stringify(payload),
        },
        PROCESS_TIMEOUT_MS,
      );

    const firstResponse = await request(false);

    if (firstResponse.status !== 401) {
      return firstResponse;
    }

    // A deployed function can reject a stale JWT even when the client still has
    // a session cached. Refresh once and retry before asking the user to log in.
    return request(true);
  };

  const callImportIfoodMenu = async (url: string) => {
    const request = async (forceRefresh: boolean) =>
      fetch(getEdgeFunctionUrl("import-ifood-menu"), {
        method: "POST",
        headers: await getFunctionHeaders(forceRefresh),
        body: JSON.stringify({ url }),
      });

    const firstResponse = await request(false);

    if (firstResponse.status !== 401) {
      return firstResponse;
    }

    return request(true);
  };

  const saveToHistory = async (originalImage: string, generatedImage: string, usedPattern: string) => {
    const sessionId = getSessionId();
    const expiresAt = getExpiresAtIso();
    const photoId = crypto.randomUUID();
    const canUsePrivateStorage = Boolean(user?.id);

    let storedOriginalImage = originalImage;
    let storedGeneratedImage = generatedImage;

    if (canUsePrivateStorage) {
      if (isDataUrl(originalImage)) {
        try {
          storedOriginalImage = await uploadHistoryImage(originalImage, user!.id, photoId, "original");
        } catch (storageError) {
          console.error("Private original image storage failed; saving original URL as fallback:", storageError);
        }
      }

      if (isDataUrl(generatedImage)) {
        try {
          storedGeneratedImage = await uploadHistoryImage(generatedImage, user!.id, photoId, "result");
        } catch (storageError) {
          console.error("Private generated image storage failed; saving data URL as fallback:", storageError);
        }
      }
    }

    const { data: savedPhoto, error } = await supabase
      .from("photo_history")
      .insert({
        id: photoId,
        session_id: sessionId,
        user_id: user?.id ?? null,
        original_image_url: storedOriginalImage,
        result_image_url: storedGeneratedImage,
        pattern: usedPattern,
        expires_at: expiresAt,
        is_permanent: false,
      })
      .select("id")
      .single();

    if (error) throw error;

    setSavedPhotoId(savedPhoto.id);
  };

  const buildGenerationPayload = (extraFeedback?: string) => {
    const trimmedFeedback = extraFeedback?.trim();

    const payload =
      mode === "reference"
        ? { mode, productImage, referenceImage, pattern }
        : mode === "combo"
          ? { mode, comboImages: comboImages.filter(Boolean), pattern: imageAssemblyType }
          : mode === "preset"
            ? { mode, productImage: presetImage, pattern: presetPattern }
            : {
                mode,
                itemName: selectedMenuItem?.name,
                itemDescription: selectedMenuItem?.description,
                sourceImageUrl: selectedMenuItem?.imageUrl,
                referenceImage: menuItemReferenceImage,
                restaurantUrl: importedRestaurant?.url || restaurantUrl,
                pattern,
              };

    return trimmedFeedback ? { ...payload, feedback: trimmedFeedback } : payload;
  };

  const getOriginalImageForHistory = () =>
    mode === "reference"
      ? productImage!
      : mode === "preset"
        ? presetImage!
        : mode === "menu_item"
          ? selectedMenuItem!.imageUrl
          : comboImages.find(Boolean)!;

  const getPatternForHistory = () =>
    mode === "preset" ? presetPattern : mode === "combo" ? imageAssemblyType : mode === "menu_item" ? "ifood-item" : pattern;

  const handleImportMenu = async () => {
    const trimmedUrl = restaurantUrl.trim();

    if (!trimmedUrl) {
      toast.error("Cole o link do restaurante no iFood.");
      return;
    }

    setIsImportingMenu(true);
    setImportedItems([]);
    setImportedRestaurant(null);
    setSelectedMenuItemId(null);
    setImportCounts({ totalItems: 0, itemsWithImages: 0, skippedWithoutImage: 0 });
    toast.info("Buscando itens do cardápio...", { id: "import-ifood-menu" });

    try {
      const response = await callImportIfoodMenu(trimmedUrl);

      if (!response.ok) {
        const payload = await readErrorPayload(response);
        if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente para importar o cardápio.");
        if (response.status === 402) throw new Error("Créditos insuficientes na GeckoAPI para importar esse cardápio.");
        if (response.status === 429) throw new Error("Muitas importações em andamento. Aguarde alguns minutos.");
        throw new Error(payload.message || "Não foi possível importar o cardápio.");
      }

      const data = await response.json();
      const items = (data?.items || []) as ImportedMenuItem[];

      setImportedRestaurant(data?.restaurant ?? null);
      setImportedItems(items);
      setImportCounts(data?.counts ?? { totalItems: items.length, itemsWithImages: items.length, skippedWithoutImage: 0 });
      setSelectedMenuItemId(items[0]?.id ?? null);

      if (items.length === 0) {
        toast.warning("Nenhum item com imagem foi encontrado nesse cardápio.", { id: "import-ifood-menu" });
      } else {
        toast.success(`${items.length} itens com imagem encontrados.`, { id: "import-ifood-menu" });
      }
    } catch (err) {
      console.error("iFood import error:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao importar cardápio.", { id: "import-ifood-menu" });
    } finally {
      setIsImportingMenu(false);
    }
  };

  const handleProcess = async () => {
    if (!canProcess) return;

    setStep("uploading");
    toast.info("Processando imagem com IA...", { duration: 60000, id: "processing" });

    try {
      setStep("processing");

      const response = await callProcessFoodImage(buildGenerationPayload());

      if (!response.ok) {
        const payload = await readErrorPayload(response);
        const detailedMessage = buildProcessErrorMessage(response, payload, mode);
        throw new Error(detailedMessage);
      }

      const data = await response.json();

      if (!data?.image) throw new Error("Nenhuma imagem foi retornada");

      setResultImage(data.image);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["user_credits"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });
      setAdjustments(defaultAdjustments);
      toast.success("Imagem processada com sucesso!", { id: "processing" });

      persistHistoryInBackground(getOriginalImageForHistory(), data.image, getPatternForHistory(), "processing");
    } catch (err) {
      console.error("Processing error:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao processar imagem. Tente novamente.", {
        id: "processing",
      });
      setStep("idle");
    }
  };

  const handleRegenerate = async () => {
    if (!canRegenerate) return;

    setIsRegenerating(true);
    toast.info("Regenerando com suas correções...", { duration: 60000, id: "regenerating" });

    try {
      const response = await callProcessFoodImage(buildGenerationPayload(feedback));

      if (!response.ok) {
        const payload = await readErrorPayload(response);
        const detailedMessage = buildProcessErrorMessage(response, payload, mode);
        throw new Error(detailedMessage);
      }

      const data = await response.json();

      if (!data?.image) throw new Error("Nenhuma imagem foi retornada");

      setResultImage(data.image);
      setFeedback("");
      setAdjustments(defaultAdjustments);
      queryClient.invalidateQueries({ queryKey: ["user_credits"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });
      toast.success("Imagem regenerada com sucesso!", { id: "regenerating" });

      persistHistoryInBackground(getOriginalImageForHistory(), data.image, getPatternForHistory(), "regenerating");
    } catch (err) {
      console.error("Regeneration error:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao regenerar imagem. Tente novamente.", {
        id: "regenerating",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleReset = () => {
    setProductImage(null);
    setReferenceImage(null);
    setComboImages([null, null, null, null]);
    setImageAssemblyType("combo");
    setPresetImage(null);
    setRestaurantUrl("");
    setImportedRestaurant(null);
    setImportedItems([]);
    setSelectedMenuItemId(null);
    setMenuItemReferenceImage(null);
    setImportCounts({ totalItems: 0, itemsWithImages: 0, skippedWithoutImage: 0 });
    setIsImportingMenu(false);
    setPattern("auto");
    setPresetPattern("hamburguer");
    setResultImage(null);
    setStep("idle");
    setAdjustments(defaultAdjustments);
    setFeedback("");
    setSavedPhotoId(null);
  };

  const handleDownload = () => {
    if (!resultImage) return;

    void recordDownload(savedPhotoId, user?.id ?? null).catch((error) => {
      console.error("Download metric error:", error);
    });

    const canvas = document.createElement("canvas");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.filter = buildFilterStyle(adjustments).filter as string;
      ctx.drawImage(img, 0, 0);
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = "foto-delivery-pro.png";
      link.click();
    };
    img.onerror = () => {
      const link = document.createElement("a");
      link.href = resultImage;
      link.download = "foto-delivery-pro.png";
      link.click();
    };
    img.src = resultImage;
  };

  const updateComboImage = (index: number, image: string | null) => {
    setComboImages((current) => current.map((item, itemIndex) => (itemIndex === index ? image : item)));
  };

  const showResult = Boolean(resultImage && activePrimaryImage);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-8">
      {!showResult && (
        <>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-bold text-foreground">Melhorar Fotos</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Escolha como quer montar a imagem. O modo com referência continua ativo agora e os próximos fluxos já ficam organizados na mesma tela.
            </p>
          </div>

          <div className={`rounded-2xl border px-4 py-3 text-sm ${
            hasCredits
              ? "border-border/70 bg-card/45 text-muted-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}>
            {isLoadingCredits
              ? "Verificando créditos..."
              : isAdmin
                ? "Créditos disponíveis: ilimitados (admin)"
                : hasCredits
                ? `Créditos disponíveis: ${creditsAvailable}`
                : "Sem créditos disponíveis"}
          </div>

          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {modeCards.map((card) => {
              const isUpcoming = card.status === "Em breve";
              const canSelectCard = !isUpcoming || isAdmin;

              return (
                <button
                  key={card.value}
                  type="button"
                  disabled={!canSelectCard}
                  onClick={() => {
                    if (canSelectCard) setMode(card.value);
                  }}
                  className={`rounded-[1.35rem] border p-5 text-left transition-all ${
                    mode === card.value
                      ? "border-primary bg-primary/8 shadow-[0_20px_60px_-40px_rgba(239,68,68,0.45)]"
                      : canSelectCard
                        ? "border-border/70 bg-card/50 hover:border-border"
                        : "border-border/70 bg-card/35"
                  } ${canSelectCard ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-background/60 text-primary">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        card.status === "Disponível agora"
                          ? "bg-primary/12 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {card.status}
                    </span>
                  </div>
                  <div className="mt-5 space-y-2">
                    <h2 className="font-display text-xl font-bold text-foreground">{card.title}</h2>
                    <p className="text-sm leading-6 text-muted-foreground">{card.description}</p>
                  </div>
                </button>
              );
            })}
          </section>

          {mode === "reference" && (
            <section className="dashboard-panel space-y-6 px-6 py-6 md:px-8">
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">Melhorar com referência</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Envie a foto do produto e uma imagem guia para a IA seguir estilo, luz e composição.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ImageUploadZone
                  label="Foto do produto"
                  sublabel="A imagem principal que será tratada"
                  image={productImage}
                  onImageChange={setProductImage}
                />
                <ImageUploadZone
                  label="Referência de estilo"
                  sublabel="A direção visual que a IA deve seguir"
                  image={referenceImage}
                  onImageChange={setReferenceImage}
                />
              </div>

              <div className="space-y-4 pt-2">
                <Button size="lg" disabled={!canProcess} onClick={handleProcess} className="w-full">
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Gerar foto
                    </>
                  )}
                </Button>
                {menuItemDisabledReason && (
                  <p className="text-center text-xs font-medium text-muted-foreground">{menuItemDisabledReason}</p>
                )}
                {isProcessing && (
                  <div className="border-t border-border pt-2">
                    <StepIndicator current={step} />
                  </div>
                )}
              </div>
            </section>
          )}

          {mode === "combo" && (
            <section className="dashboard-panel space-y-6 px-6 py-6 md:px-8">
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">Montar imagem</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Prepare uma composição única com os produtos ou variações que quiser combinar. Você pode usar 2, 3 ou 4 imagens.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Esse modo não precisa de foto de referência.
                </p>
              </div>

              <PatternSelect
                label="Tipo de montagem"
                value={imageAssemblyType}
                onChange={setImageAssemblyType}
                options={imageAssemblyOptions}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                {comboImages.map((image, index) => (
                  <ImageUploadZone
                    key={index}
                    label={`Produto ${index + 1}`}
                    sublabel="Adicione um item do combo"
                    image={image}
                    onImageChange={(value) => updateComboImage(index, value)}
                  />
                ))}
              </div>

              <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 px-4 py-4 text-sm text-muted-foreground">
                Esse modo vai reunir apenas as imagens enviadas e montar uma única cena final de acordo com o tipo de montagem escolhido.
              </div>

              <Button size="lg" disabled={!canProcess} onClick={handleProcess} className="w-full">
                <Layers3 className="mr-2 h-4 w-4" />
                {isProcessing ? "Montando imagem..." : "Gerar imagem"}
              </Button>
              {isProcessing && (
                <div className="border-t border-border pt-2">
                  <StepIndicator current={step} />
                </div>
              )}
            </section>
          )}

          {mode === "preset" && (
            <section className="dashboard-panel space-y-6 px-6 py-6 md:px-8">
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">Foto predefinida</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Escolha um preset pronto da plataforma e aplique uma configuração visual já padronizada.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Esse modo não precisa de foto de referência.
                </p>
              </div>

              <ImageUploadZone
                label="Foto do produto"
                sublabel="A base que será encaixada no preset"
                image={presetImage}
                onImageChange={setPresetImage}
              />

              <Button size="lg" disabled={!canProcess} onClick={handleProcess} className="w-full">
                <Wand2 className="mr-2 h-4 w-4" />
                {isProcessing ? "Gerando preset..." : "Gerar com preset"}
              </Button>
              {isProcessing && (
                <div className="border-t border-border pt-2">
                  <StepIndicator current={step} />
                </div>
              )}
            </section>
          )}

          {mode === "menu_item" && (
            <section className="dashboard-panel space-y-6 px-6 py-6 md:px-8">
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground">Item do iFood</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Cole o link público do restaurante no iFood, escolha um item com imagem e gere uma foto mais profissional.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Link do restaurante</label>
                  <div className="relative">
                    <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={restaurantUrl}
                      onChange={(event) => setRestaurantUrl(event.target.value)}
                      placeholder="https://www.ifood.com.br/delivery/..."
                      className="pl-9"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  size="lg"
                  onClick={handleImportMenu}
                  disabled={isImportingMenu || isProcessing}
                  className="self-end gap-2"
                >
                  {isImportingMenu ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Buscar itens
                </Button>
              </div>

              {importedRestaurant && (
                <div className="rounded-2xl border border-border/70 bg-background/35 px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{importedRestaurant.name || "Restaurante importado"}</span>
                  {importCounts.totalItems > 0 &&
                    ` - ${importCounts.itemsWithImages} de ${importCounts.totalItems} itens com imagem`}
                  {importCounts.skippedWithoutImage > 0 && ` (${importCounts.skippedWithoutImage} sem imagem)`}
                </div>
              )}

              {importedItems.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {importedItems.map((item) => {
                    const isSelected = item.id === selectedMenuItemId;
                    const price = formatPrice(item.price);

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedMenuItemId(item.id)}
                        className={`grid min-h-32 grid-cols-[104px_1fr] gap-3 rounded-xl border p-3 text-left transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-[0_18px_50px_-36px_rgba(239,68,68,0.7)]"
                            : "border-border/70 bg-card/45 hover:border-border"
                        }`}
                        aria-pressed={isSelected}
                      >
                        <div className="relative h-24 w-24">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-24 w-24 rounded-lg object-cover"
                            loading="lazy"
                          />
                          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-primary shadow-sm">
                            {isSelected ? <CheckCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                          </span>
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.name}</p>
                            {price && <span className="shrink-0 text-xs font-semibold text-primary">{price}</span>}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{item.sectionName}</p>
                          {item.description && (
                            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedMenuItem && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Referência para melhoria</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Envie uma imagem guia para a IA seguir estilo, luz, fundo e composição ao melhorar o item selecionado.
                    </p>
                  </div>
                  <ImageUploadZone
                    label="Referência de estilo"
                    sublabel={`Guia visual para melhorar ${selectedMenuItem.name}`}
                    image={menuItemReferenceImage}
                    onImageChange={setMenuItemReferenceImage}
                  />
                </div>
              )}

              {importedRestaurant && importedItems.length === 0 && (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/35 px-4 py-4 text-sm text-muted-foreground">
                  Esse cardápio foi encontrado, mas nenhum item com imagem está disponível para melhorar.
                </div>
              )}

              <div className="space-y-4 pt-2">
                <Button size="lg" disabled={!canProcess} onClick={handleProcess} className="w-full">
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {menuItemGenerateLabel}
                    </>
                  )}
                </Button>
                {isProcessing && (
                  <div className="border-t border-border pt-2">
                    <StepIndicator current={step} />
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {showResult && activePrimaryImage && (
        <>
          <div>
            <h1 className="font-display text-3xl font-bold text-foreground">Resultado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "reference"
                ? "Deslize para comparar antes e depois"
                : "Confira o resultado final gerado para esse modo"}
            </p>
          </div>

          <BeforeAfterSlider
            before={activePrimaryImage}
            after={resultImage}
            afterStyle={buildFilterStyle(adjustments)}
          />

          <div className="space-y-3 pt-2">
            <h3 className="text-sm font-medium text-foreground">Ajustes</h3>
            {canUseAdjustments ? (
              <ImageAdjustments value={adjustments} onChange={setAdjustments} />
            ) : (
              <div className="rounded-2xl border border-border/70 bg-card/45 px-4 py-4 text-sm text-muted-foreground">
                Ajustes de brilho e contraste ficam disponíveis nos planos Prata e Ouro.
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2">
            <label className="block text-sm font-medium text-foreground">Melhorias?</label>
            <Textarea
              placeholder="Descreva o que gostaria de ajustar..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="min-h-20 resize-none text-sm"
              maxLength={500}
            />
            <div className="text-right text-xs text-muted-foreground">{feedback.length}/500</div>
          </div>

          {feedback.trim() && (
            <Button onClick={handleRegenerate} disabled={!canRegenerate} className="w-full gap-2">
              {isRegenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Regenerando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Regenerar
                </>
              )}
            </Button>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={handleReset} className="flex-1">
              <RotateCcw className="mr-1 h-4 w-4" />
              Nova
            </Button>
            <Button onClick={handleDownload} className="flex-1">
              <Download className="mr-1 h-4 w-4" />
              Baixar
            </Button>
          </div>

          {!user && (
            <p className="text-center text-xs text-muted-foreground">
              Essa imagem também entra na galeria com expiração de 24 horas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
