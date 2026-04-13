import { useEffect, useState } from "react";
import { CreditCard, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type PlanConfig = Tables<"plan_configs">;

type EditablePlan = Omit<PlanConfig, "features" | "kiwify_product_keywords"> & {
  featuresText: string;
  keywordsText: string;
};

function toEditablePlan(plan: PlanConfig): EditablePlan {
  const features = Array.isArray(plan.features)
    ? plan.features.map((item) => String(item)).join("\n")
    : "";

  return {
    ...plan,
    featuresText: features,
    keywordsText: (plan.kiwify_product_keywords || []).join(", "),
  };
}

function createEmptyPlan(): EditablePlan {
  const now = new Date().toISOString();
  return {
    code: "",
    name: "",
    price_label: "R$ 0",
    period_label: "/mês",
    description: "",
    credits: 0,
    checkout_url: "",
    cta_label: "Assinar",
    featuresText: "",
    keywordsText: "",
    is_active: true,
    is_popular: false,
    sort_order: 99,
    created_at: now,
    updated_at: now,
  };
}

function normalizeCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function PlanManagementPanel() {
  const [plans, setPlans] = useState<EditablePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("plan_configs")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setPlans((data || []).map(toEditablePlan));
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

  const updatePlan = (code: string, updates: Partial<EditablePlan>) => {
    setPlans((current) =>
      current.map((plan) => {
        if (plan.code !== code) return plan;
        const next = { ...plan, ...updates };

        if (updates.name !== undefined && !plan.code) {
          next.code = normalizeCode(updates.name);
        }

        return next;
      }),
    );
  };

  const addPlan = () => {
    const draft = createEmptyPlan();
    draft.code = `novo-plano-${Date.now()}`;
    setPlans((current) => [...current, draft]);
  };

  const savePlan = async (plan: EditablePlan) => {
    const code = normalizeCode(plan.code);
    if (!code || !plan.name.trim()) {
      toast.error("Informe código e nome do plano.");
      return;
    }

    const features = plan.featuresText
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    const keywords = plan.keywordsText
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    try {
      setSavingCode(plan.code);
      const { error } = await supabase
        .from("plan_configs")
        .upsert({
          code,
          name: plan.name.trim(),
          price_label: plan.price_label.trim() || "R$ 0",
          period_label: plan.period_label.trim(),
          description: plan.description.trim(),
          credits: Math.max(Number(plan.credits) || 0, 0),
          checkout_url: plan.checkout_url?.trim() || null,
          cta_label: plan.cta_label.trim() || "Assinar",
          features,
          kiwify_product_keywords: keywords,
          is_active: plan.is_active,
          is_popular: plan.is_popular,
          sort_order: Number(plan.sort_order) || 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "code" });

      if (error) throw error;
      toast.success("Plano salvo.");
      await loadPlans();
    } catch (error) {
      console.error("Save plan error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao salvar plano.");
    } finally {
      setSavingCode(null);
    }
  };

  const deletePlan = async (plan: EditablePlan) => {
    if (["free", "bronze", "prata", "ouro"].includes(plan.code)) {
      toast.error("Planos base não podem ser removidos. Desative se não quiser exibir.");
      return;
    }

    const confirmed = window.confirm(`Remover o plano ${plan.name || plan.code}?`);
    if (!confirmed) return;

    try {
      setSavingCode(plan.code);
      const { error } = await supabase.from("plan_configs").delete().eq("code", plan.code);
      if (error) throw error;
      setPlans((current) => current.filter((item) => item.code !== plan.code));
      toast.success("Plano removido.");
    } catch (error) {
      console.error("Delete plan error:", error);
      toast.error("Erro ao remover plano.");
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
              Configure preço, créditos, checkout e palavras-chave usadas para identificar o produto comprado na Kiwify.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadPlans} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Button onClick={addPlan} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo plano
          </Button>
        </div>
      </div>

      <div className="grid gap-5">
        {plans.map((plan) => {
          const isSaving = savingCode === plan.code;

          return (
            <div key={plan.code} className="rounded-[1.35rem] border border-border/70 bg-background/35 p-5">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-bold text-foreground">{plan.name || "Novo plano"}</h3>
                    {plan.is_popular ? <Badge className="rounded-full">Mais popular</Badge> : null}
                    {!plan.is_active ? <Badge variant="secondary" className="rounded-full">Oculto</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Código interno: {plan.code || "sem-codigo"}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => deletePlan(plan)} disabled={isSaving}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button size="sm" onClick={() => savePlan(plan)} disabled={isSaving} className="gap-2">
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Código</Label>
                  <Input
                    value={plan.code}
                    onChange={(event) => updatePlan(plan.code, { code: normalizeCode(event.target.value) })}
                    placeholder="pro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={plan.name}
                    onChange={(event) => updatePlan(plan.code, { name: event.target.value })}
                    placeholder="Pro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preço exibido</Label>
                  <Input
                    value={plan.price_label}
                    onChange={(event) => updatePlan(plan.code, { price_label: event.target.value })}
                    placeholder="R$ 49"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Período</Label>
                  <Input
                    value={plan.period_label}
                    onChange={(event) => updatePlan(plan.code, { period_label: event.target.value })}
                    placeholder="/mês"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Créditos</Label>
                  <Input
                    type="number"
                    min={0}
                    value={plan.credits}
                    onChange={(event) => updatePlan(plan.code, { credits: Number(event.target.value) })}
                    placeholder="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={plan.sort_order}
                    onChange={(event) => updatePlan(plan.code, { sort_order: Number(event.target.value) })}
                    placeholder="20"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Descrição</Label>
                  <Input
                    value={plan.description}
                    onChange={(event) => updatePlan(plan.code, { description: event.target.value })}
                    placeholder="Para restaurantes e deliveries ativos"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Link de checkout da Kiwify</Label>
                  <Input
                    value={plan.checkout_url || ""}
                    onChange={(event) => updatePlan(plan.code, { checkout_url: event.target.value })}
                    placeholder="https://pay.kiwify.com.br/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Texto do botão</Label>
                  <Input
                    value={plan.cta_label}
                    onChange={(event) => updatePlan(plan.code, { cta_label: event.target.value })}
                    placeholder="Assinar Pro"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Palavras-chave da Kiwify</Label>
                  <Input
                    value={plan.keywordsText}
                    onChange={(event) => updatePlan(plan.code, { keywordsText: event.target.value })}
                    placeholder="pro, plano pro"
                  />
                  <p className="text-xs text-muted-foreground">
                    Separe por vírgula. Se o nome do produto comprado contiver uma dessas palavras, esse plano será ativado.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Recursos do plano</Label>
                  <Textarea
                    value={plan.featuresText}
                    onChange={(event) => updatePlan(plan.code, { featuresText: event.target.value })}
                    placeholder={"100 fotos por mês\nArmazenamento permanente\nSuporte prioritário"}
                    className="min-h-32"
                  />
                  <p className="text-xs text-muted-foreground">Use uma linha para cada recurso exibido na página de planos.</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-6 border-t border-border/70 pt-4">
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <Switch
                    checked={plan.is_active}
                    onCheckedChange={(checked) => updatePlan(plan.code, { is_active: checked })}
                  />
                  Exibir plano
                </label>
                <label className="flex items-center gap-3 text-sm text-foreground">
                  <Switch
                    checked={plan.is_popular}
                    onCheckedChange={(checked) => updatePlan(plan.code, { is_popular: checked })}
                  />
                  Marcar como mais popular
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
