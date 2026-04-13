import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  Download,
  Layers3,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

type ProcessStep = "idle" | "uploading" | "processing" | "saving" | "done";
type CreateMode = "reference" | "combo" | "preset";

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

function getExpiresAtIso() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
    };
  } catch {
    return {
      message: raw || `Erro HTTP ${response.status}`,
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
  const activePrimaryImage =
    mode === "reference" ? productImage : mode === "preset" ? presetImage : comboImages.find(Boolean) ?? null;
  const comboCount = comboImages.filter(Boolean).length;
  const canProcess =
    !isProcessing &&
    (isAdmin || !isLoadingCredits) &&
    hasCredits &&
    ((mode === "reference" && Boolean(productImage && referenceImage)) ||
      (mode === "combo" && comboCount >= 2) ||
      (mode === "preset" && Boolean(presetImage)));
  const canRegenerate =
    Boolean(resultImage && feedback.trim()) &&
    !isRegenerating &&
    (isAdmin || !isLoadingCredits) &&
    hasCredits &&
    ((mode === "reference" && Boolean(productImage && referenceImage)) ||
      (mode === "combo" && comboCount >= 2) ||
      (mode === "preset" && Boolean(presetImage)));

  const getFunctionHeaders = async (forceRefresh = true) => {
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

  const callProcessFoodImage = async (payload: Record<string, unknown>) => {
    const request = async (forceRefresh: boolean) =>
      fetch(getEdgeFunctionUrl("process-food-image"), {
        method: "POST",
        headers: await getFunctionHeaders(forceRefresh),
        body: JSON.stringify(payload),
      });

    const firstResponse = await request(true);

    if (firstResponse.status !== 401) {
      return firstResponse;
    }

    // A deployed function can reject a stale JWT even when the client still has
    // a session cached. Refresh once and retry before asking the user to log in.
    return request(true);
  };

  const saveToHistory = async (originalImage: string, generatedImage: string, usedPattern: string) => {
    const sessionId = getSessionId();
    const expiresAt = getExpiresAtIso();

    const { data: savedPhoto, error } = await supabase
      .from("photo_history")
      .insert({
        session_id: sessionId,
        user_id: user?.id ?? null,
        original_image_url: originalImage,
        result_image_url: generatedImage,
        pattern: usedPattern,
        expires_at: expiresAt,
        is_permanent: false,
      })
      .select("id")
      .single();

    if (error) throw error;

    setSavedPhotoId(savedPhoto.id);
  };

  const handleProcess = async () => {
    if (!canProcess) return;

    setStep("uploading");
    toast.info("Processando imagem com IA...", { duration: 60000, id: "processing" });

    try {
      setStep("processing");

      const response = await callProcessFoodImage(
        mode === "reference"
          ? { mode, productImage, referenceImage, pattern }
          : mode === "combo"
            ? { mode, comboImages: comboImages.filter(Boolean), pattern: imageAssemblyType }
            : { mode, productImage: presetImage, pattern: presetPattern },
      );

      if (!response.ok) {
        const payload = await readErrorPayload(response);
        const normalizedMessage = normalizeModeError(payload.message || "Erro ao processar imagem", mode);
        if (response.status === 403 && normalizedMessage.toLowerCase().includes("crédito")) {
          throw new Error("Sem créditos disponíveis");
        }
        if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente para gerar imagens.");
        if (response.status === 402) throw new Error("Créditos de IA insuficientes. Contate o suporte.");
        if (response.status === 429) throw new Error("Muitas requisições. Aguarde alguns minutos e tente novamente.");
        if (response.status === 504) throw new Error("Tempo limite excedido. Tente novamente.");
        throw new Error(normalizedMessage);
      }

      const data = await response.json();

      if (!data?.image) throw new Error("Nenhuma imagem foi retornada");

      setStep("saving");
      setResultImage(data.image);
      queryClient.invalidateQueries({ queryKey: ["user_credits"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });

      const originalImageForHistory =
        mode === "reference" ? productImage! : mode === "preset" ? presetImage! : comboImages.find(Boolean)!;
      const patternForHistory = mode === "preset" ? presetPattern : mode === "combo" ? imageAssemblyType : pattern;

      try {
        await saveToHistory(originalImageForHistory, data.image, patternForHistory);
      } catch (saveError) {
        console.error("Photo history save error:", saveError);
        setSavedPhotoId(null);
        setStep("done");
        setAdjustments(defaultAdjustments);
        toast.warning("Imagem gerada, mas não foi possível salvá-la no histórico. Você ainda pode baixá-la agora.", {
          id: "processing",
        });
        return;
      }

      setStep("done");
      setAdjustments(defaultAdjustments);
      toast.success("Imagem processada com sucesso!", { id: "processing" });
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
      const response = await callProcessFoodImage(
        mode === "reference"
          ? {
              mode,
              productImage,
              referenceImage,
              pattern,
              feedback: feedback.trim(),
            }
          : mode === "combo"
            ? {
                mode,
                comboImages: comboImages.filter(Boolean),
                pattern: imageAssemblyType,
                feedback: feedback.trim(),
              }
            : {
                mode,
                productImage: presetImage,
                pattern: presetPattern,
                feedback: feedback.trim(),
              },
      );

      if (!response.ok) {
        const payload = await readErrorPayload(response);
        const normalizedMessage = normalizeModeError(payload.message || "Erro ao regenerar imagem", mode);
        if (response.status === 403 && normalizedMessage.toLowerCase().includes("crédito")) {
          throw new Error("Sem créditos disponíveis");
        }
        if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente para gerar imagens.");
        if (response.status === 402) throw new Error("Créditos de IA insuficientes. Contate o suporte.");
        if (response.status === 429) throw new Error("Muitas requisições. Aguarde alguns minutos e tente novamente.");
        if (response.status === 504) throw new Error("Tempo limite excedido. Tente novamente.");
        throw new Error(normalizedMessage);
      }

      const data = await response.json();

      if (!data?.image) throw new Error("Nenhuma imagem foi retornada");

      setResultImage(data.image);
      setFeedback("");
      setAdjustments(defaultAdjustments);
      queryClient.invalidateQueries({ queryKey: ["user_credits"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });

      const originalImageForHistory =
        mode === "reference" ? productImage! : mode === "preset" ? presetImage! : comboImages.find(Boolean)!;
      const patternForHistory = mode === "preset" ? presetPattern : mode === "combo" ? imageAssemblyType : pattern;

      try {
        await saveToHistory(originalImageForHistory, data.image, patternForHistory);
      } catch (saveError) {
        console.error("Photo history save error:", saveError);
        setSavedPhotoId(null);
        toast.warning("Imagem regenerada, mas não foi possível salvá-la no histórico. Você ainda pode baixá-la agora.", {
          id: "regenerating",
        });
        return;
      }

      toast.success("Imagem regenerada com sucesso!", { id: "regenerating" });
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

          <section className="grid gap-4 md:grid-cols-3">
            {modeCards.map((card) => (
              <button
                key={card.value}
                type="button"
                onClick={() => {
                  setMode(card.value);
                }}
                className={`rounded-[1.35rem] border p-5 text-left transition-all ${
                  mode === card.value
                    ? "border-primary bg-primary/8 shadow-[0_20px_60px_-40px_rgba(239,68,68,0.45)]"
                    : "border-border/70 bg-card/50 hover:border-border"
                }`}
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
            ))}
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
