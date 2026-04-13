import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Clock, Download, Trash2, Image as ImageIcon, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/lib/session";
import { getFunctionAuthorization, getSessionHeaders } from "@/lib/supabaseHeaders";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { recordDownload } from "@/lib/usageMetrics";
import { getEdgeFunctionUrl } from "@/lib/edgeFunctions";

type PhotoRecord = Tables<"photo_history">;

const PAGE_SIZE = 12;

function formatExpiry(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expirada";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function formatExpiryDate(expiresAt: string) {
  return new Date(expiresAt).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTimeLeft(expiresAt: string): { label: string; expired: boolean } {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return { label: "Expirado", expired: true };
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return {
    label: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
    expired: false,
  };
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const { label, expired } = getTimeLeft(expiresAt);
  if (expired) return <span className="text-destructive text-xs font-medium">Expirado</span>;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Clock className="w-3 h-3" />
      {label}
    </span>
  );
}

interface PhotoHistoryProps {
  onSelectPhoto: (original: string, result: string) => void;
  refreshTrigger: number;
  showExpired?: boolean;
}

const PhotoHistory = ({ onSelectPhoto, refreshTrigger, showExpired = false }: PhotoHistoryProps) => {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();
  const sessionId = getSessionId();
  const [page, setPage] = useState(0);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoRecord | null>(null);

  const { data, error, isLoading } = useQuery({
    queryKey: ["photo_history", user?.id ?? sessionId, page, showExpired, refreshTrigger],
    queryFn: async () => {
      const now = new Date().toISOString();
      let query = supabase
        .from("photo_history")
        .select("*", { count: "exact" });

      if (user) {
        query = query.eq("user_id", user.id);
      } else {
        query = query.eq("session_id", sessionId);
      }

      if (showExpired) {
        query = query.order("created_at", { ascending: false });
      } else {
        query = query.gt("expires_at", now).order("created_at", { ascending: false });
      }

      query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { photos: data ?? [], total: count ?? 0 };
    },
    staleTime: 30_000,
  });

  const photos = data?.photos ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const deletePhotoDirectly = async (id: string) => {
    let query = supabase.from("photo_history").delete().eq("id", id);

    if (user) {
      query = query.eq("user_id", user.id);
    } else {
      query = query.eq("session_id", sessionId).is("user_id", null);
    }

    const { error } = await query;
    if (error) throw error;
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(
        getEdgeFunctionUrl("delete-photo"),
        {
          method: "POST",
          headers: (() => {
            const headers = getSessionHeaders({
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            });
            const authorization = getFunctionAuthorization(
              session,
              import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            );

            if (authorization) {
              headers.set("Authorization", authorization);
            }

            return headers;
          })(),
          body: JSON.stringify({ photoId: id }),
        }
      );

      const payload = await response.json().catch(() => null);

      if (response.ok) {
        setSelectedPhoto((current) => (current?.id === id ? null : current));
        queryClient.invalidateQueries({ queryKey: ["photo_history"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });
        toast.success("Foto excluída com sucesso.");
        return;
      }

      throw new Error(payload?.error || "Não foi possível excluir a foto.");
    } catch (err) {
      console.error("Delete edge function error, trying direct delete:", err);

      try {
        await deletePhotoDirectly(id);
        setSelectedPhoto((current) => (current?.id === id ? null : current));
        queryClient.invalidateQueries({ queryKey: ["photo_history"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });
        toast.success("Foto excluída com sucesso.");
      } catch (fallbackError) {
        console.error("Delete fallback error:", fallbackError);
        toast.error("Não foi possível excluir a foto.");
      }
    }
  };

  const handleDownload = (photo: PhotoRecord) => {
    void recordDownload(photo.id, user?.id ?? null)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["dashboard-home"] });
      })
      .catch((error) => {
        console.error("Download metric error:", error);
      });

    const link = document.createElement("a");
    link.href = photo.result_image_url;
    link.download = "foto-delivery-pro.png";
    link.click();
  };

  if (isLoading) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-sm font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-primary" />
          Galeria
        </h3>
        <div className="flex items-center justify-center py-8">
          <span className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[1.75rem] border border-border/70 bg-card/55 p-6 space-y-2">
        <p className="text-sm text-destructive">Não foi possível carregar suas fotos agora.</p>
        <p className="text-xs text-muted-foreground">
          Verifique sua conexão e tente novamente em alguns instantes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <div className="flex items-start gap-2">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">Aviso:</span> as fotos da galeria expiram 24 horas apos a geracao, conforme o prazo salvo no banco de dados.
          </p>
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold text-foreground">Minha Galeria</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {total} de {total} foto{total !== 1 ? "s" : ""} ativa{total !== 1 ? "s" : ""} na galeria
          </p>
        </div>
      </div>

      {photos.length === 0 ? (
        <div className="rounded-[1.75rem] border border-border/70 bg-card/45 py-14 text-center text-muted-foreground">
          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma foto ainda</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {photos.map((photo: PhotoRecord) => (
              <div
                key={photo.id}
                className="group rounded-[1.7rem] border border-border/70 bg-card/50 p-4 transition-all hover:border-border hover:bg-card/70"
                onClick={() => {
                  onSelectPhoto(photo.original_image_url, photo.result_image_url);
                  setSelectedPhoto(photo);
                }}
              >
                <div className="relative overflow-hidden rounded-[1.35rem] bg-background">
                  <div className="grid grid-cols-2">
                    <div className="relative">
                      <img
                        src={photo.original_image_url}
                        alt="Foto original"
                        className="aspect-[4/4.15] w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="relative">
                      <img
                        src={photo.result_image_url}
                        alt="Foto processada"
                        className="aspect-[4/4.15] w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/25" />
                  <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-background/90 text-foreground shadow-lg">
                    <ArrowLeftRight className="h-4 w-4" />
                  </div>
                </div>

                <div className="space-y-3 px-2 pb-1 pt-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-sm text-amber-300">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Expira em: {formatExpiry(photo.expires_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Prazo final: {formatExpiryDate(photo.expires_at)}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(photo.created_at).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="rounded-xl border-border/70 bg-background/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(photo);
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Baixar
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-xl border-border/70 bg-background/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPhoto(photo);
                      }}
                    >
                      <Sparkles className="h-4 w-4" />
                      Ver maior
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    className="w-full justify-center rounded-xl bg-background/30 text-muted-foreground hover:bg-background/55 hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(photo.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-xs text-muted-foreground min-w-12 text-center">
                {page + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
        <DialogContent className="max-w-4xl border-border/70 bg-background/95 p-4 backdrop-blur-xl">
          <DialogHeader className="space-y-2">
            <DialogTitle className="font-display text-xl">Visualizar foto</DialogTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {selectedPhoto ? (
                <div className="flex items-center gap-2 rounded-full bg-muted px-2.5 py-1">
                  <span>Expira em</span>
                  <CountdownTimer expiresAt={selectedPhoto.expires_at} />
                </div>
              ) : null}
            </div>
          </DialogHeader>

          {selectedPhoto && (
            <div className="space-y-4">
              <BeforeAfterSlider
                before={selectedPhoto.original_image_url}
                after={selectedPhoto.result_image_url}
              />

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => handleDownload(selectedPhoto)}>
                  <Download className="w-4 h-4" />
                  Baixar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    handleDelete(selectedPhoto.id);
                    setSelectedPhoto(null);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PhotoHistory;
