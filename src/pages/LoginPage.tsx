import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginPageProps {
  embedded?: boolean;
}

type AuthMode = "login" | "register";

export default function LoginPage({ embedded = false }: LoginPageProps) {
  const { user, loading: authLoading, signIn, signUp } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const redirectTo = location.state?.from?.pathname ?? "/melhorar";

  useEffect(() => {
    const blockedMessage = sessionStorage.getItem("blocked_access_message");
    if (blockedMessage) {
      toast.error(blockedMessage);
      sessionStorage.removeItem("blocked_access_message");
    }
  }, []);

  if (authLoading) {
    return (
      <div className={`${embedded ? "min-h-[60vh]" : "min-h-screen"} flex items-center justify-center bg-background`}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to={redirectTo} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await signIn(form.email, form.password);
        if (error) {
          toast.error(error.message || "E-mail ou senha incorretos.");
        } else {
          toast.success("Login realizado com sucesso.");
        }
        return;
      }

      if (form.password.length < 6) {
        toast.error("A senha precisa ter pelo menos 6 caracteres.");
        return;
      }

      if (form.password !== form.confirmPassword) {
        toast.error("As senhas não conferem.");
        return;
      }

      const { error } = await signUp({
        email: form.email,
        password: form.password,
        fullName: form.fullName,
      });

      if (error) {
        toast.error(error.message || "Não foi possível criar a conta.");
      } else {
        toast.success("Conta criada com sucesso. Se necessário, confirme seu e-mail para entrar.");
        setMode("login");
        setForm((current) => ({
          ...current,
          password: "",
          confirmPassword: "",
        }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${embedded ? "flex items-center justify-center" : "min-h-screen flex items-center justify-center"} bg-background p-4`}>
      <div className={`w-full ${embedded ? "max-w-md" : "max-w-sm"} space-y-8`}>
        <div className="text-center space-y-2">
          <div className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Cardápio <span className="text-primary">Pro IA</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Entre na sua conta para acessar o estúdio" : "Crie sua conta para usar o sistema"}
          </p>
        </div>

        <div className="grid grid-cols-2 rounded-2xl border border-border bg-card/50 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              mode === "login" ? "bg-background text-foreground" : "text-muted-foreground"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              mode === "register" ? "bg-background text-foreground" : "text-muted-foreground"
            }`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className={`${embedded ? "dashboard-panel" : "glass-card"} space-y-4 p-6`}>
          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Nome</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Seu nome"
                value={form.fullName}
                onChange={(e) => setForm((current) => ({ ...current, fullName: e.target.value }))}
                autoComplete="name"
                required={mode === "register"}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={form.email}
              onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              minLength={6}
              value={form.password}
              onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>

          {mode === "register" && (
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                minLength={6}
                value={form.confirmPassword}
                onChange={(e) => setForm((current) => ({ ...current, confirmPassword: e.target.value }))}
                autoComplete="new-password"
                required={mode === "register"}
              />
            </div>
          )}

          <Button type="submit" className="w-full font-display font-semibold" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
      </div>
    </div>
  );
}
