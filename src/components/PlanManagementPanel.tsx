import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Edit3, ExternalLink, Loader2, RefreshCw, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type PlanConfig = Tables<"plan_configs">;

type EditablePlan = Omit<PlanConfig, "features" | "kiwify_product_keywords"> & {
  featuresText: string;
};

const BASE_PLAN_CODES = ["free", "bronze", "prata", "ouro"] as const;

const BASE_PLAN_PRESETS: Record<(typeof BASE_PLAN_CODES)[number], EditablePlan> = {
  free: {
    code: "free",
    name: "Gratuito",
    price_label: "R$ 0",
    period_label: "",
    description: "Para experimentar a plataforma",
    credits: 5,
    checkout_url: null,
    cta_label: "Plano atual",
    featuresText: "5 fotos por mês\nArmazenamento por 24h",
    is_active: true,
    is_popular: false,
    show_on_landing: false,
    sort_order: 10,
    created_at: "",
    updated_at: "",
  },
  bronze: {
    code: "bronze",
    name: "Bronze",
    price_label: "R$ 47,00",
    period_label: "/mês",
    description: "Plano inicial para padronizar fotos essenciais do cardápio",
    credits: 40,
    checkout_url: "https://pay.kiwify.com.br/hHvVb5I",
    cta_label: "Assinar Bronze",
    featuresText: "40 fotos\nPadrões básicos de estilo",
    is_active: true,
    is_popular: false,
    show_on_landing: true,
    sort_order: 20,
    created_at: "",
    updated_at: "",
  },
  prata: {
    code: "prata",
    name: "Prata",
    price_label: "R$ 97,00",
    period_label: "/mês",
    description: "Para cardápios com produção frequente e mais controle visual",
    credits: 120,
    checkout_url: "https://pay.kiwify.com.br/EtTCVQN",
    cta_label: "Assinar Prata",
    featuresText: "120 fotos\nTodos os padrões de estilo\nAjustes de brilho e contraste",
    is_active: true,
    is_popular: true,
    show_on_landing: true,
    sort_order: 30,
    created_at: "",
    updated_at: "",
  },
  ouro: {
    code: "ouro",
    name: "Ouro",
    price_label: "R$ 297,00",
    period_label: "/mês",
    description: "Para alto volume com prioridade no atendimento",
    credits: 250,
    checkout_url: "https://pay.kiwify.com.br/z026oYE",
    cta_label: "Assinar Ouro",
    featuresText: "250 fotos\nTodos os padrões de estilo\nAjustes de brilho e contraste\nSuporte priorizado",
    is_active: true,
    is_popular: false,
    show_on_landing: true,
    sort_order: 40,
    created_at: "",
    updated_at: "",
  },
};

function toEditablePlan(plan: PlanConfig): EditablePlan {
  const features = Array.isArray(plan.features)
    ? plan.features.map((item) => String(item)).join("\n")
    : "";

  return {
    ...plan,
    featuresText: features,
  };
}

function getCheckoutCode(url?: string | null) {
  const match = String(url || "").match(/pay\.kiwify\.com\.br\/([^/?#]+)/i);
  return match?.[1] || "";
}

function getPlanKeywords(plan: EditablePlan) {
  const checkoutCode = getCheckoutCode(plan.checkout_url).toLowerCase();
  const keywords = [plan.code, plan.name, checkoutCode, plan.checkout_url]
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);

  if (plan.code === "bronze") {
    keywords.push("hhvb5i");
  }

  return Array.from(new Set(keywords));
}

function mergePlanWithPreset(plan: PlanConfig | undefined, code: (typeof BASE_PLAN_CODES)[number]) {
  const preset = BASE_PLAN_PRESETS[code];
  if (!plan) return preset;

  return {
    ...preset,
    ...toEditablePlan(plan),
    featuresText: toEditablePlan(plan).featuresText || preset.featuresText,
  };
}

function getPlanTone(code: string) {
  if (code === "free") return "from-muted/40 to-background/20";
  if (code === "bronze") return "from-orange-500/10 to-background/20";
  if (code === "prata") return "from-slate-300/10 to-background/20";
  return "from-yellow-500/10 to-background/20";
}

export function PlanManagementPanel() {
  const [storedPlans, setStoredPlans] = useState<PlanConfig[]>([]);
  const [draftPlan, setDraftPlan] = useState<EditablePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const plans = useMemo(
    () =>
      BASE_PLAN_CODES.map((code) =>
        mergePlanWithPreset(
          storedPlans.find((plan) => plan.code === code),
          code,
        ),
      ),
    [storedPlans],
  );

  const loadPlans = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("plan_configs")
        .select("*")
        .in("code", [...BASE_PLAN_CODES])
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setStoredPlans(data || []);
    } catch (error) {
      console.error("Load plan configs error:", error);
      toast.error("Erro ao carregar planos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);

  const updateDraft = (updates: Partial<EditablePlan>) => {
    setDraftPlan((current) => (current ? { ...current, ...updates } : current));
  };

  const resetDraftToDefault = () => {
    if (!draftPlan) return;
    setDraftPlan(BASE_PLAN_PRESETS[draftPlan.code as (typeof BASE_PLAN_CODES)[number]]);
  };

  const savePlan = async () => {
    if (!draftPlan) return;

    const features = draftPlan.featuresText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    try {
      setSavingCode(draftPlan.code);
      const { error } = await supabase
        .from("plan_configs")
        .upsert({
          code: draftPlan.code,
          name: draftPlan.name.trim(),
          price_label: draftPlan.price_label.trim() || "R$ 0",
          period_label: draftPlan.code === "free" ? "" : "/mês",
          description: draftPlan.description.trim(),
          credits: Math.max(Number(draftPlan.credits) || 0, 0),
          checkout_url: draftPlan.code === "free" ? null : draftPlan.checkout_url?.trim() || null,
          cta_label: draftPlan.code === "free" ? "Plano atual" : `Assinar ${draftPlan.name.trim() || "plano"}`,
          features,
          kiwify_product_keywords: getPlanKeywords(draftPlan),
          is_active: draftPlan.is_active,
          is_popular: draftPlan.is_popular,
          show_on_landing: draftPlan.show_on_landing,
          sort_order: draftPlan.sort_order,
          updated_at: new Date().toISOString(),
        }, { onConflict: "code" });

      if (error) throw error;
      toast.success("Plano atualizado.");
      setDraftPlan(null);
      await loadPlans();
    } catch (error) {
      console.error("Save plan error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao salvar plano.");
    } finally {
      setSavingCode(null);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-panel flex min-h-72 items-center justify-center px-6 py-6 md:px-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <section className="dashboard-panel space-y-6 px-6 py-6 md:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-foreground">Planos do sistema</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Planos fixos do Cardápio Pro IA. Clique em um card para ajustar preço, créditos, checkout e benefícios.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={loadPlans} className="gap-2 self-start">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const checkoutCode = getCheckoutCode(plan.checkout_url);

          return (
            <button
              key={plan.code}
              type="button"
              onClick={() => setDraftPlan(plan)}
              className={`group flex min-h-[360px] flex-col rounded-[1.6rem] border border-border/70 bg-gradient-to-br ${getPlanTone(
                plan.code,
              )} p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:shadow-[0_18px_55px_rgba(0,0,0,0.28)]`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  {plan.code === "free" ? <Sparkles className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {plan.is_popular ? <Badge className="rounded-full">Mais popular</Badge> : null}
                  {!plan.is_active ? <Badge variant="secondary" className="rounded-full">Oculto</Badge> : null}
                  {plan.show_on_landing ? (
                    <Badge variant="outline" className="rounded-full border-primary/30 text-primary">
                      LP
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="mt-7 space-y-3">
                <div>
                  <h3 className="font-display text-2xl font-bold text-foreground">{plan.name}</h3>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="font-display text-3xl font-bold text-foreground">{plan.price_label}</span>
                    <span className="text-sm text-muted-foreground">{plan.period_label}</span>
                  </div>
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {plan.credits} créditos
                </p>
                <p className="min-h-12 text-sm leading-6 text-muted-foreground">{plan.description}</p>
              </div>

              <div className="my-5 h-px bg-border/70" />

              <ul className="flex-1 space-y-2">
                {plan.featuresText
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 4)
                  .map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
              </ul>

              <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/40 px-3 py-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {checkoutCode || "sem checkout"}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Edit3 className="h-3.5 w-3.5" />
                  Editar
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={Boolean(draftPlan)} onOpenChange={(open) => !open && setDraftPlan(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-[1.5rem] border-border/70 sm:max-w-2xl">
          {draftPlan ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">Editar {draftPlan.name}</DialogTitle>
                <DialogDescription>
                  Ajuste apenas o que aparece para o cliente e o link usado no checkout. O mapeamento técnico é salvo
                  automaticamente pelo código do plano.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-5 py-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={draftPlan.name}
                      onChange={(event) => updateDraft({ name: event.target.value })}
                      placeholder="Bronze"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Créditos</Label>
                    <Input
                      type="number"
                      min={0}
                      value={draftPlan.credits}
                      onChange={(event) => updateDraft({ credits: Number(event.target.value) })}
                      placeholder="40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Preço exibido</Label>
                    <Input
                      value={draftPlan.price_label}
                      onChange={(event) => updateDraft({ price_label: event.target.value })}
                      placeholder="R$ 47,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Código Kiwify</Label>
                    <Input value={getCheckoutCode(draftPlan.checkout_url) || "Sem checkout"} disabled />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição curta</Label>
                  <Input
                    value={draftPlan.description}
                    onChange={(event) => updateDraft({ description: event.target.value })}
                    placeholder="Plano inicial para padronizar fotos essenciais do cardápio"
                  />
                </div>

                {draftPlan.code !== "free" ? (
                  <div className="space-y-2">
                    <Label>Link de checkout</Label>
                    <div className="flex gap-2">
                      <Input
                        value={draftPlan.checkout_url || ""}
                        onChange={(event) => updateDraft({ checkout_url: event.target.value })}
                        placeholder="https://pay.kiwify.com.br/..."
                      />
                      {draftPlan.checkout_url ? (
                        <Button variant="outline" size="icon" asChild>
                          <a
                            href={draftPlan.checkout_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Abrir checkout"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label>Benefícios do plano</Label>
                  <Textarea
                    value={draftPlan.featuresText}
                    onChange={(event) => updateDraft({ featuresText: event.target.value })}
                    placeholder={"40 fotos\nPadrões básicos de estilo"}
                    className="min-h-28"
                  />
                  <p className="text-xs text-muted-foreground">Use uma linha por benefício. Esses itens aparecem na tela de planos.</p>
                </div>

                <div className="grid gap-3 rounded-2xl border border-border/70 bg-card/35 p-4 sm:grid-cols-2">
                  <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                    Exibir plano
                    <Switch
                      checked={draftPlan.is_active}
                      onCheckedChange={(checked) => updateDraft({ is_active: checked })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                    Mais popular
                    <Switch
                      checked={draftPlan.is_popular}
                      onCheckedChange={(checked) => updateDraft({ is_popular: checked })}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                    Mostrar na página de venda
                    <Switch
                      checked={draftPlan.show_on_landing}
                      onCheckedChange={(checked) => updateDraft({ show_on_landing: checked })}
                    />
                  </label>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="outline" onClick={resetDraftToDefault}>
                  Restaurar padrão
                </Button>
                <Button type="button" onClick={savePlan} disabled={savingCode === draftPlan.code} className="gap-2">
                  {savingCode === draftPlan.code ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar alterações
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
