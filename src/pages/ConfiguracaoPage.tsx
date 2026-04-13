import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { CreditCard, Loader2, RotateCcw, Save, Settings2, Sparkles, Layers3, Users, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagementPanel } from "@/components/UserManagementPanel";
import { PlanManagementPanel } from "@/components/PlanManagementPanel";

const FLOW_KEYS = {
  reference: "__flow_reference",
  combo: "__flow_combo",
  preset: "__flow_preset",
} as const;

const PATTERNS = [
  { id: "pizza", label: "Pizza", defaultPrompt: "Use a dark wood background with warm lighting. The mood should be cozy and rustic." },
  { id: "marmita", label: "Marmita", defaultPrompt: "Place the food on a clean white plate with a clean background and neutral lighting." },
  { id: "sobremesa", label: "Sobremesa", defaultPrompt: "Use a light, bright background with soft, diffused lighting. The mood should be elegant and delicate." },
  { id: "japones", label: "Japonês", defaultPrompt: "Use a dark background with high contrast lighting. The presentation should be sleek and minimal." },
  { id: "hamburguer", label: "Hambúrguer", defaultPrompt: "Use a dark slate or kraft paper background with dramatic side lighting. Show the layers clearly. Bold and appetizing mood." },
  { id: "acai", label: "Açaí", defaultPrompt: "Use a clean white or light wooden background with bright overhead lighting. Show toppings clearly arranged. Fresh and vibrant mood." },
  { id: "arabe", label: "Árabe", defaultPrompt: "Use warm terracotta or wooden backgrounds with golden-hour lighting. Rich and welcoming atmosphere." },
  { id: "executivo", label: "Executivo", defaultPrompt: "Clean white plate on a white or marble surface. Overhead or 45-degree angle shot. Minimal and professional." },
];

const SETTINGS_TABS = [
  {
    value: "flows",
    title: "Fluxos de IA",
    description: "Prompts principais",
    icon: Sparkles,
  },
  {
    value: "patterns",
    title: "Padrões",
    description: "Categorias visuais",
    icon: Settings2,
  },
  {
    value: "plans",
    title: "Planos",
    description: "Créditos e checkout",
    icon: CreditCard,
    adminOnly: true,
  },
  {
    value: "users",
    title: "Usuários",
    description: "Acessos e equipe",
    icon: Users,
    adminOnly: true,
  },
];

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
- não altere o tipo do alimento
- preserve proporções realistas entre os itens
- organize os produtos com hierarquia visual clara
- o item principal deve receber maior destaque
- use iluminação consistente em todos os elementos
- crie uma composição equilibrada, limpa e profissional

FUNDO E COMPOSIÇÃO:
- use fundo coerente com delivery e cardápio profissional
- evite poluição visual
- centralize o combo no enquadramento
- aplique profundidade de campo suave quando necessário
- deixe a imagem com aparência de ensaio único, mesmo vindo de fotos separadas

RESTRIÇÕES:
- não invente produtos não enviados
- não sobrecarregue com acessórios desnecessários
- não use efeitos artificiais exagerados
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
- centralize o produto com enquadramento adequado para cardápio

RESULTADO FINAL:
- estética uniforme
- fundo limpo
- iluminação consistente
- acabamento premium para delivery
- imagem final com aparência profissional e pronta para uso comercial`;

type FlowPrompts = {
  reference: string;
  combo: string;
  preset: string;
};

function getDefaultPatternPrompts() {
  const defaults: Record<string, string> = {};
  PATTERNS.forEach((pattern) => {
    defaults[pattern.id] = pattern.defaultPrompt;
  });
  return defaults;
}

function getDefaultFlowPrompts(): FlowPrompts {
  return {
    reference: DEFAULT_REFERENCE_PROMPT,
    combo: DEFAULT_COMBO_PROMPT,
    preset: DEFAULT_PRESET_PROMPT,
  };
}

function extractFlowPrompts(
  universalPrompt: string | null | undefined,
  patternPrompts: Record<string, string> | null | undefined,
): FlowPrompts {
  return {
    reference: patternPrompts?.[FLOW_KEYS.reference] || universalPrompt || DEFAULT_REFERENCE_PROMPT,
    combo: patternPrompts?.[FLOW_KEYS.combo] || DEFAULT_COMBO_PROMPT,
    preset: patternPrompts?.[FLOW_KEYS.preset] || DEFAULT_PRESET_PROMPT,
  };
}

function stripFlowKeys(prompts: Record<string, string>) {
  const cleaned = { ...prompts };
  delete cleaned[FLOW_KEYS.reference];
  delete cleaned[FLOW_KEYS.combo];
  delete cleaned[FLOW_KEYS.preset];
  return cleaned;
}

function isMissingPromptsTableError(error: { code?: string | null; message?: string | null } | null | undefined) {
  return error?.code === "PGRST205" || error?.message?.includes("prompts_config") || false;
}

export default function ConfiguracaoPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flowPrompts, setFlowPrompts] = useState<FlowPrompts>(getDefaultFlowPrompts());
  const [patternPrompts, setPatternPrompts] = useState<Record<string, string>>({});
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState("flows");

  useEffect(() => {
    if (user) {
      void refreshProfile();
    }
  }, [user, refreshProfile]);

  useEffect(() => {
    let isMounted = true;

    const loadPrompts = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        if (isMounted) setLoading(true);

        const { data, error } = await supabase
          .from("prompts_config")
          .select("*")
          .eq("user_id", user.id)
          .single();

        if (error && error.code !== "PGRST116" && !isMissingPromptsTableError(error)) throw error;
        if (!isMounted) return;

        const defaultPatternPrompts = getDefaultPatternPrompts();

        if (data && !error) {
          const loadedPatternPrompts = (data.pattern_prompts || {}) as Record<string, string>;
          setFlowPrompts(extractFlowPrompts(data.universal_prompt, loadedPatternPrompts));
          setPatternPrompts({
            ...defaultPatternPrompts,
            ...stripFlowKeys(loadedPatternPrompts),
          });
          return;
        }

        setFlowPrompts(getDefaultFlowPrompts());
        setPatternPrompts(defaultPatternPrompts);
      } catch (error) {
        console.error("Erro ao carregar prompts:", error);
        if (isMounted) toast.error("Erro ao carregar configurações");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadPrompts();

    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  const savePrompts = async () => {
    if (!user?.id) return;

    try {
      setSaving(true);
      const payloadPatternPrompts = {
        ...patternPrompts,
        [FLOW_KEYS.reference]: flowPrompts.reference,
        [FLOW_KEYS.combo]: flowPrompts.combo,
        [FLOW_KEYS.preset]: flowPrompts.preset,
      };

      const { error } = await supabase
        .from("prompts_config")
        .upsert({
          user_id: user.id,
          universal_prompt: flowPrompts.reference,
          pattern_prompts: payloadPatternPrompts,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (error && !isMissingPromptsTableError(error)) throw error;
      if (error && isMissingPromptsTableError(error)) {
        toast.error("A tabela de configurações ainda não existe no Supabase.");
        return;
      }
      toast.success("Configurações salvas com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar prompts:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <Navigate to="/login" replace />;

  const resetAllToDefaults = () => {
    setFlowPrompts(getDefaultFlowPrompts());
    setPatternPrompts(getDefaultPatternPrompts());
    toast.success("Prompts redefinidos para o padrão");
  };

  const resetPatternToDefault = (patternId: string) => {
    const pattern = PATTERNS.find((item) => item.id === patternId);
    if (!pattern) return;

    setPatternPrompts((prev) => ({
      ...prev,
      [patternId]: pattern.defaultPrompt,
    }));

    toast.success(`${pattern.label} redefinido`);
  };

  const resetFlowToDefault = (flow: keyof FlowPrompts) => {
    const defaults = getDefaultFlowPrompts();
    setFlowPrompts((prev) => ({
      ...prev,
      [flow]: defaults[flow],
    }));
    toast.success("Prompt redefinido");
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-96 max-w-2xl items-center justify-center p-6 md:p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const showUsersTab = profile?.role === "admin";
  const visibleSettingsTabs = SETTINGS_TABS.filter((tab) => !tab.adminOnly || showUsersTab);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6 md:p-8">
      <div className="dashboard-panel relative overflow-hidden px-6 py-6 md:px-8">
        <div className="absolute inset-y-0 right-0 w-48 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.10),transparent_70%)] opacity-70" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/80">Ajustes do sistema</p>
            <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Organize prompts, padrões, planos e usuários em módulos separados.
            </p>
          </div>

          {(settingsTab === "flows" || settingsTab === "patterns") && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={resetAllToDefaults}
                variant="outline"
                size="sm"
                className="rounded-full bg-background/50"
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Redefinir
              </Button>
              <Button onClick={savePrompts} disabled={saving} size="sm" className="rounded-full">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
            </div>
          )}
        </div>
      </div>

      <Tabs value={settingsTab} onValueChange={setSettingsTab} className="space-y-4">
        <TabsList className={`grid h-auto w-full gap-2 rounded-[1.4rem] border border-border/70 bg-card/45 p-2 ${showUsersTab ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2"}`}>
          {visibleSettingsTabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-auto justify-start rounded-2xl px-4 py-3 text-left data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <tab.icon className="mr-3 h-4 w-4 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{tab.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{tab.description}</span>
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="flows" className="space-y-4">
          <div className="dashboard-panel px-5 py-4">
            <h2 className="font-display text-xl font-bold text-foreground">Fluxos de IA</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Cada fluxo tem uma instrução própria. Alterações aqui impactam diretamente a geração de imagens.
            </p>
          </div>

          <Tabs defaultValue="reference" className="space-y-4">
            <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-[1.25rem] border border-border/70 bg-card/45 p-2 md:grid-cols-3">
              <TabsTrigger value="reference" className="h-auto justify-start rounded-2xl px-4 py-3">
                <Sparkles className="mr-2 h-4 w-4 text-primary" />
                Com referência
              </TabsTrigger>
              <TabsTrigger value="combo" className="h-auto justify-start rounded-2xl px-4 py-3">
                <Layers3 className="mr-2 h-4 w-4 text-primary" />
                Montar imagem
              </TabsTrigger>
              <TabsTrigger value="preset" className="h-auto justify-start rounded-2xl px-4 py-3">
                <Wand2 className="mr-2 h-4 w-4 text-primary" />
                Foto predefinida
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reference">
              <section className="dashboard-panel space-y-5 px-5 py-5 md:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Sparkles className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">Com referência</h2>
                      <p className="text-xs text-muted-foreground">Fluxo principal de edição com direção visual</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => resetFlowToDefault("reference")}
                    variant="ghost"
                    size="sm"
                    className="h-9 rounded-full border border-border/70 px-3 hover:bg-background/70"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  rows={18}
                  value={flowPrompts.reference}
                  onChange={(e) => setFlowPrompts((prev) => ({ ...prev, reference: e.target.value }))}
                  className="h-[30rem] rounded-[1.2rem] border-border/70 bg-background/60 p-4 font-mono text-[13px] leading-7"
                />
              </section>
            </TabsContent>

            <TabsContent value="combo">
              <section className="dashboard-panel space-y-5 px-5 py-5 md:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Layers3 className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">Montar imagem</h2>
                      <p className="text-xs text-muted-foreground">Composição com vários itens ou sabores</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => resetFlowToDefault("combo")}
                    variant="ghost"
                    size="sm"
                    className="h-9 rounded-full border border-border/70 px-3 hover:bg-background/70"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  rows={18}
                  value={flowPrompts.combo}
                  onChange={(e) => setFlowPrompts((prev) => ({ ...prev, combo: e.target.value }))}
                  className="h-[30rem] rounded-[1.2rem] border-border/70 bg-background/60 p-4 font-mono text-[13px] leading-7"
                />
              </section>
            </TabsContent>

            <TabsContent value="preset">
              <section className="dashboard-panel space-y-5 px-5 py-5 md:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Wand2 className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground">Foto predefinida</h2>
                      <p className="text-xs text-muted-foreground">Composição pronta com padrão visual fixo</p>
                    </div>
                  </div>
                  <Button
                    onClick={() => resetFlowToDefault("preset")}
                    variant="ghost"
                    size="sm"
                    className="h-9 rounded-full border border-border/70 px-3 hover:bg-background/70"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  rows={18}
                  value={flowPrompts.preset}
                  onChange={(e) => setFlowPrompts((prev) => ({ ...prev, preset: e.target.value }))}
                  className="h-[30rem] rounded-[1.2rem] border-border/70 bg-background/60 p-4 font-mono text-[13px] leading-7"
                />
              </section>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="patterns" className="space-y-4">
          <div className="dashboard-panel space-y-5 px-5 py-5 md:px-6">
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">Padrões específicos</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Ajustes rápidos para orientar cenário, luz e acabamento por categoria.
              </p>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {PATTERNS.map((pattern) => (
                <button
                  key={pattern.id}
                  onClick={() => setExpandedPattern(expandedPattern === pattern.id ? null : pattern.id)}
                  className="w-full rounded-2xl border border-border/70 bg-background/35 p-4 text-left transition-colors hover:border-primary/30 hover:bg-background/55"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{pattern.label}</span>
                    <span className="text-xs text-muted-foreground">{expandedPattern === pattern.id ? "−" : "+"}</span>
                  </div>
                </button>
              ))}
            </div>

            {expandedPattern && (
              <div className="space-y-3 border-t border-border/70 pt-5">
                {PATTERNS.map((pattern) =>
                  expandedPattern === pattern.id ? (
                    <div key={pattern.id} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-foreground">{pattern.label}</h3>
                        <Button
                          onClick={() => resetPatternToDefault(pattern.id)}
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-full border border-border/70 px-3 text-xs hover:bg-background/70"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                      <Textarea
                        value={patternPrompts[pattern.id] || pattern.defaultPrompt}
                        onChange={(e) =>
                          setPatternPrompts((prev) => ({
                            ...prev,
                            [pattern.id]: e.target.value,
                          }))
                        }
                        className="min-h-32 rounded-[1.1rem] border-border/70 bg-background/60 p-4 font-mono text-[13px] leading-7"
                      />
                    </div>
                  ) : null,
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {showUsersTab ? (
          <TabsContent value="plans" className="space-y-4">
            <PlanManagementPanel />
          </TabsContent>
        ) : null}

        {showUsersTab ? (
          <TabsContent value="users" className="space-y-4">
            <UserManagementPanel />
          </TabsContent>
        ) : null}
      </Tabs>

      {(settingsTab === "flows" || settingsTab === "patterns") && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <div className="flex gap-2 rounded-full border border-border/70 bg-background/90 p-1.5 shadow-2xl backdrop-blur-xl">
            <Button onClick={resetAllToDefaults} variant="ghost" size="sm" className="rounded-full">
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Redefinir
            </Button>
            <Button onClick={savePrompts} disabled={saving} size="sm" className="rounded-full px-5">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
