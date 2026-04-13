import { useQuery } from "@tanstack/react-query";
import { CreditCard, Download, ImageIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { OnboardingModal } from "@/components/OnboardingModal";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import LoginPage from "./LoginPage";
import { isMissingRelationError } from "@/lib/usageMetrics";

type PhotoRecord = Tables<"photo_history">;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

const Index = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-home", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const totalPhotosQuery = supabase
        .from("photo_history")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);

      const recentQuery = supabase
        .from("photo_history")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(4);

      const creditsQuery = supabase
        .from("user_credits")
        .select("credits")
        .eq("user_id", user!.id)
        .maybeSingle();

      const subscriptionQuery = supabase
        .from("user_subscriptions")
        .select("plan_code, plan, credits_included, status")
        .eq("user_id", user!.id)
        .maybeSingle();

      const downloadsQuery = supabase
        .from("download_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id);

      const [
        { count: totalPhotos, error: totalPhotosError },
        { data: photos, error: photosError },
        { data: credits, error: creditsError },
        { data: subscription, error: subscriptionError },
        { count: totalDownloads, error: downloadsError },
      ] = await Promise.all([
        totalPhotosQuery,
        recentQuery,
        creditsQuery,
        subscriptionQuery,
        downloadsQuery,
      ]);

      if (totalPhotosError) throw totalPhotosError;
      if (photosError) throw photosError;
      if (creditsError && !isMissingRelationError(creditsError) && creditsError.code !== "PGRST116") {
        throw creditsError;
      }
      if (subscriptionError && !isMissingRelationError(subscriptionError) && subscriptionError.code !== "PGRST116") {
        throw subscriptionError;
      }
      if (downloadsError && !isMissingRelationError(downloadsError)) {
        throw downloadsError;
      }

      const creditsIncluded = subscription?.credits_included ?? 0;
      const cycleUsage = totalPhotos ?? 0;
      const creditsRemaining = credits?.credits ?? 0;

      return {
        creditsIncluded,
        creditsRemaining,
        cycleUsage,
        planCode: subscription?.plan ?? subscription?.plan_code ?? "free",
        totalPhotos: totalPhotos ?? 0,
        totalDownloads: totalDownloads ?? 0,
        recentPhotos: (photos ?? []) as PhotoRecord[],
      };
    },
    staleTime: 30_000,
  });

  if (!user) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <LoginPage embedded />
      </div>
    );
  }

  const totalPhotos = data?.totalPhotos ?? 0;
  const totalDownloads = data?.totalDownloads ?? 0;
  const recentPhotos = data?.recentPhotos ?? [];
  const creditsRemaining = data?.creditsRemaining ?? 0;
  const creditsIncluded = data?.creditsIncluded ?? 0;
  const cycleUsage = data?.cycleUsage ?? 0;
  const kpis = [
    {
      title: "Créditos disponíveis",
      value: creditsRemaining === null ? "Ilimitados" : String(creditsRemaining),
      helper:
        creditsIncluded === null
          ? "Uso livre no plano atual"
          : `${cycleUsage} de ${creditsIncluded} usados neste ciclo`,
      icon: CreditCard,
    },
    {
      title: "Fotos processadas",
      value: String(totalPhotos),
      helper: "Total de fotos melhoradas",
      icon: ImageIcon,
    },
    {
      title: "Downloads",
      value: String(totalDownloads),
      helper: "Total de downloads feitos",
      icon: Download,
    },
  ];

  return (
    <>
      <OnboardingModal />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10">
        <section className="grid gap-4 lg:grid-cols-3">
          {kpis.map((item) => (
            <div key={item.title} className="dashboard-panel px-6 py-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {item.title}
                  </p>
                  <p className="font-display text-4xl font-bold tracking-tight text-foreground">
                    {isLoading ? "..." : item.value}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/40 text-muted-foreground">
                  <item.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-5 border-t border-border/60 pt-4">
                <p className="text-sm text-muted-foreground">{item.helper}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold text-foreground">Fotos recentes</h2>
              <p className="mt-2 text-base text-muted-foreground">
                Suas ultimas fotos melhoradas.
              </p>
            </div>
            <Link to="/minhas-fotos" className="text-sm font-semibold text-sky-400 transition-colors hover:text-sky-300">
              Ver todas
            </Link>
          </div>

          {recentPhotos.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {recentPhotos.slice(0, 4).map((photo) => (
                <Link
                  key={photo.id}
                  to="/minhas-fotos"
                  className="group w-[calc(25%-12px)] min-w-[220px] overflow-hidden rounded-[1.35rem] border border-border/70 bg-card/70 transition-all hover:border-border hover:shadow-[0_24px_60px_-36px_rgba(0,0,0,0.9)]"
                >
                  <div className="aspect-[4/4.8] overflow-hidden">
                    <img
                      src={photo.result_image_url}
                      alt="Foto processada"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      loading="lazy"
                    />
                  </div>
                  <div className="px-4 py-4">
                    <p className="text-sm text-muted-foreground">{formatDate(photo.created_at)}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-[1.35rem] border border-dashed border-border/70 bg-card/30 px-6 py-12 text-center">
              <ImageIcon className="mx-auto h-8 w-8 text-muted-foreground/45" />
              <p className="mt-3 text-sm text-muted-foreground">Nenhuma foto na galeria ainda.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
};

export default Index;
