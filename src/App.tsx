import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import MelhorarFotos from "./pages/MelhorarFotos";
import MinhasFotos from "./pages/MinhasFotos";
import PlanoPage from "./pages/PlanoPage";
import PerfilPage from "./pages/PerfilPage";
import AfiliacaoPage from "./pages/AfiliacaoPage";
import ConfiguracaoPage from "./pages/ConfiguracaoPage";
import LoginPage from "./pages/LoginPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

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
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
