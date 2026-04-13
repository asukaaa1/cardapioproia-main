import { useState } from "react";
import { TrendingUp, ExternalLink, Copy, Check, DollarSign, Users, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const AFFILIATE_BASE = "https://dashboard.kiwify.com/join/affiliate/VXYokYrS";

const stats = [
  { icon: Users, label: "Indicações", value: "—" },
  { icon: DollarSign, label: "Comissão acumulada", value: "—" },
  { icon: TrendingUp, label: "Conversões", value: "—" },
];

const howItWorks = [
  "Clique no botão abaixo para se cadastrar como afiliado na Kiwify",
  "Receba seu link exclusivo de indicação",
  "Compartilhe com donos de restaurantes e deliveries",
  "Ganhe comissão por cada assinatura realizada",
];

export default function AfiliacaoPage() {
  const { user, profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const isAffiliate = profile?.is_affiliate === true;

  const affiliateLink = user
    ? `${AFFILIATE_BASE}?ref=${user.id.slice(0, 8)}`
    : AFFILIATE_BASE;

  const handleCopy = () => {
    navigator.clipboard.writeText(affiliateLink).then(() => {
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <div className="dashboard-panel px-6 py-6 md:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">
          Crescimento
        </p>
        <h1 className="mt-2 text-2xl font-display font-bold text-foreground">Afiliados</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          {isAffiliate
            ? "Convide outros restaurantes e deliveries para usar o Cardápio Pro IA e acompanhe sua operação de afiliado em um só lugar."
            : "Ative o modo afiliado para liberar seu link exclusivo e acompanhar a operação nessa área."}
        </p>
      </div>

      {!isAffiliate ? (
        <Card className="dashboard-panel border-border/60">
          <CardHeader>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <CardTitle className="text-base">Torne-se afiliado</CardTitle>
            <CardDescription>
              Quando esse acesso estiver ativo para seu usuário, essa página mostra o painel completo de afiliados. Por enquanto, você pode iniciar seu cadastro na Kiwify.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">Como funciona:</p>
              <ul className="text-sm leading-6 text-muted-foreground space-y-2">
                {howItWorks.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <Button asChild size="lg" className="w-full font-display font-semibold">
              <a href={AFFILIATE_BASE} target="_blank" rel="noopener noreferrer">
                Quero me cadastrar como afiliado
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {stats.map(({ icon: Icon, label, value }) => (
              <div key={label} className="dashboard-panel p-5 text-center space-y-2">
                <Icon className="w-5 h-5 text-primary mx-auto" />
                <p className="text-xl font-display font-bold text-foreground">{value}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Estatísticas detalhadas disponíveis no painel da Kiwify após o cadastro.
          </p>

          <Card className="dashboard-panel border-border/60">
            <CardHeader>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                <LinkIcon className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-base">Seu Link de Afiliado</CardTitle>
              <CardDescription>Compartilhe este link para ganhar comissões.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input value={affiliateLink} readOnly className="text-xs font-mono bg-muted" />
                <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0">
                  {copied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="dashboard-panel border-border/60">
            <CardHeader>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-base">Programa de Afiliados</CardTitle>
              <CardDescription>
                Indique o Cardápio Pro IA e receba comissões por cada assinatura vendida.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Como funciona:</p>
                <ul className="text-sm leading-6 text-muted-foreground space-y-2">
                  {howItWorks.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <Button asChild size="lg" className="w-full font-display font-semibold">
                <a href={AFFILIATE_BASE} target="_blank" rel="noopener noreferrer">
                  Cadastrar como afiliado
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
