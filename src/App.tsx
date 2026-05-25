import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const AppLayout = lazy(() => import("@/components/AppLayout").then((module) => ({ default: module.AppLayout })));
const Index = lazy(() => import("./pages/Index"));
const MelhorarFotos = lazy(() => import("./pages/MelhorarFotos"));
const MinhasFotos = lazy(() => import("./pages/MinhasFotos"));
const PlanoPage = lazy(() => import("./pages/PlanoPage"));
const PerfilPage = lazy(() => import("./pages/PerfilPage"));
const AfiliacaoPage = lazy(() => import("./pages/AfiliacaoPage"));
const ConfiguracaoPage = lazy(() => import("./pages/ConfiguracaoPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PageFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

const LayoutRoute = () => (
  <AppLayout>
    <Outlet />
  </AppLayout>
);

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<LayoutRoute />}>
                  <Route path="/" element={<Index />} />
                  <Route element={<ProtectedRoute />}>
                    <Route path="/melhorar" element={<MelhorarFotos />} />
                    <Route path="/minhas-fotos" element={<MinhasFotos />} />
                    <Route path="/plano" element={<PlanoPage />} />
                    <Route path="/perfil" element={<PerfilPage />} />
                    <Route path="/afiliacao" element={<AfiliacaoPage />} />
                    <Route path="/configuracoes" element={<ConfiguracaoPage />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
