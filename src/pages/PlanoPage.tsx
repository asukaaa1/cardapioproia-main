import { Check, ExternalLink, CreditCard, Zap, BadgeCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { isMissingRelationError } from "@/lib/usageMetrics";

type PlanConfig = Tables<"plan_configs">;

const fallbackPlans = [
  {
    code: "free",
    name: "Gratuito",
    price_label: "R$ 0",
    period_label: "",
    description: "Para experimentar a plataforma",
    credits: 5,
    features: [
      "5 fotos por mês",
      "Armazenamento por 24h",
    ],
    cta_label: "Plano atual",
    checkout_url: null,
    is_popular: false,
  },
  {
    code: "bronze",
    name: "Bronze",
    price_label: "R$ 39,90",
    period_label: "/mês",
    description: "Plano inicial para padronizar fotos essenciais do cardápio",
    credits: 40,
    features: [
      "40 fotos",
      "Padrões básicos de estilo",
    ],
    cta_label: "Assinar Bronze",
    checkout_url: "https://pay.kiwify.com.br/hHvVb5I",
    is_popular: false,
  },
  {
    code: "prata",
    name: "Prata",
    price_label: "R$ 97,00",
    period_label: "/mês",
    description: "Para cardápios com produção frequente e mais controle visual",
    credits: 120,
    features: [
      "Todos os padrões de estilo",
      "Ajustes de brilho e contraste",
    ],
    cta_label: "Assinar Prata",
    checkout_url: "https://pay.kiwify.com.br/EtTCVQN",
    is_popular: true,
  },
  {
    code: "ouro",
    name: "Ouro",
    price_label: "R$ 197,00",
    period_label: "/mês",
    description: "Para alto volume com prioridade no atendimento",
    credits: 250,
    features: [
      "Todos os padrões de estilo",
      "Ajustes de brilho e contraste",
      "Suporte priorizado",
    ],
    cta_label: "Assinar Ouro",
    checkout_url: "https://pay.kiwify.com.br/z026oYE",
    is_popular: false,
  },
];

function normalizeFeatures(features: PlanConfig["features"]) {
  return Array.isArray(features) ? features.map((feature) => String(feature)) : [];
}

export default function PlanoPage() {
  const { user } = useAuth();
  const { data: plans = fallbackPlans } = useQuery({
    queryKey: ["plan_configs_public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_configs")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) {
        if (isMissingRelationError(error)) return fallbackPlans;
        throw error;
      }

      if (!data?.length) return fallbackPlans;

      return data.map((plan) => ({
        code: plan.code,
        name: plan.name,
        price_label: plan.price_label,
        period_label: plan.period_label,
        description: plan.description,
        credits: plan.credits,
        features: normalizeFeatures(plan.features),
        cta_label: plan.cta_label,
        checkout_url: plan.checkout_url,
        is_popular: plan.is_popular,
      }));
    },
    staleTime: 60_000,
  });
  const { data: accountPlan } = useQuery({
    queryKey: ["account_plan_summary", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const subscriptionQuery = supabase
        .from("user_subscriptions")
        .select("plan, plan_code, status, credits_included, current_period_end")
        .eq("user_id", user!.id)
        .maybeSingle();

      const creditsQuery = supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", user!.id)
        .maybeSingle();

      const photosQuery = supabase
        .from("photo_history")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);

      const [
        { data: subscription, error: subscriptionError },
        { data: credits, error: creditsError },
        { count: photosCount, error: photosError },
      ] = await Promise.all([subscriptionQuery, creditsQuery, photosQuery]);

      if (subscriptionError && !isMissingRelationError(subscriptionError) && subscriptionError.code !== "PGRST116") {
        throw subscriptionError;
      }
      if (creditsError && !isMissingRelationError(creditsError) && creditsError.code !== "PGRST116") {
        throw creditsError;
      }
      if (photosError) throw photosError;

      const planCode = subscription?.plan ?? subscription?.plan_code ?? "free";
      const configuredPlan = plans.find((plan) => plan.code === planCode) || plans.find((plan) => plan.code === "free");
      const creditsIncluded = subscription?.credits_included ?? configuredPlan?.credits ?? 5;

      return {
        planCode,
        planName: configuredPlan?.name ?? "Gratuito",
        status: subscription?.status ?? "active",
        creditsRemaining: credits?.credits ?? 0,
        creditsIncluded,
        photosProcessed: photosCount ?? 0,
        periodEnd: subscription?.current_period_end ?? null,
      };
    },
    staleTime: 30_000,
  });

  const currentPlanCode = accountPlan?.planCode ?? "free";
  const currentPlan = plans.find((plan) => plan.code === currentPlanCode) || plans.find((plan) => plan.code === "free");

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="dashboard-panel px-6 py-6 md:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
          Assinatura
        </p>
        <h1 className="mt-2 flex items-center gap-2 text-2xl md:text-3xl font-display font-bold text-foreground">
          <CreditCard className="w-6 h-6 text-primary" /> Meu Plano
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Escolha o ritmo ideal para gerar imagens, armazenar resultados e evoluir a apresentação visual do seu cardápio.
        </p>
      </div>

      {!user && (
        <div className="dashboard-panel flex items-start gap-3 px-5 py-5">
          <Zap className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm leading-6 text-foreground">
            <a href="/login" className="text-primary font-medium hover:underline">Faça login</a> para gerenciar sua assinatura e salvar fotos permanentemente.
          </p>
        </div>
      )}

      {user && (
        <section className="dashboard-panel overflow-hidden px-6 py-6 md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Plano atual da conta
                </p>
                <h2 className="mt-1 font-display text-2xl font-bold text-foreground">
                  {accountPlan?.planName ?? currentPlan?.name ?? "Gratuito"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Status:{" "}
                  <span className={accountPlan?.status === "canceled" ? "text-destructive" : "text-primary"}>
                    {accountPlan?.status === "canceled" ? "cancelado" : "ativo"}
                  </span>
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[520px]">
              <div className="rounded-2xl border border-border/70 bg-background/35 px-4 py-4">
                <p className="text-xs text-muted-foreground">Créditos disponíveis</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">
                  {accountPlan?.creditsRemaining ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/35 px-4 py-4">
                <p className="text-xs text-muted-foreground">Créditos do plano</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">
                  {accountPlan?.creditsIncluded ?? currentPlan?.credits ?? 5}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/35 px-4 py-4">
                <p className="text-xs text-muted-foreground">Fotos processadas</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">
                  {accountPlan?.photosProcessed ?? 0}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const isCurrentPlan = user && plan.code === currentPlanCode;

          return (
          <div
            key={plan.code}
            className={`dashboard-panel p-6 space-y-5 flex flex-col ${
              plan.is_popular ? "border-primary/50 ring-1 ring-primary/20" : ""
            } ${isCurrentPlan ? "border-primary/70 bg-primary/5" : ""}`}
          >
            <div className="flex min-h-6 flex-wrap gap-2">
              {isCurrentPlan && (
                <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                  Plano atual
                </span>
              )}
              {plan.is_popular && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  Mais popular
                </span>
              )}
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-foreground">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-display font-bold text-foreground">{plan.price_label}</span>
                <span className="text-sm text-muted-foreground">{plan.period_label}</span>
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary/80">
                {plan.credits >= 999999 ? "Créditos ilimitados" : `${plan.credits} créditos`}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.description}</p>
            </div>

            <ul className="space-y-2 flex-1">
              {plan.features.map((feat) => (
                <li key={feat} className="flex items-start gap-2 text-sm text-foreground">
                  <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {feat}
                </li>
              ))}
            </ul>

            {isCurrentPlan ? (
              <Button variant="outline" disabled className="w-full">Plano atual</Button>
            ) : !plan.checkout_url ? (
              <Button variant="outline" disabled className="w-full">{plan.cta_label}</Button>
            ) : (
              <Button asChild variant={plan.is_popular ? "default" : "outline"} className="w-full font-display font-semibold">
                <a href={plan.checkout_url} target="_blank" rel="noopener noreferrer">
                  {plan.cta_label} <ExternalLink className="w-3.5 h-3.5 ml-2" />
                </a>
              </Button>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
