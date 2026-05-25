import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/BrandLogo";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface LoginPageProps {
  embedded?: boolean;
}

type AuthMode = "login" | "register" | "forgot" | "recovery";

function getPasswordUpdateErrorMessage(message?: string) {
  const normalizedMessage = (message || "").toLowerCase();

  if (normalizedMessage.includes("different from the old password")) {
    return "A nova senha precisa ser diferente da senha atual ou temporária.";
  }

  return message || "Não foi possível salvar a nova senha.";
}

export default function LoginPage({ embedded = false }: LoginPageProps) {
  const { user, loading: authLoading, signIn, signUp } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>("login");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const redirectTo = location.state?.from?.pathname ?? "/melhorar";
  const recoveryRedirectUrl = `${window.location.origin}/login`;

  useEffect(() => {
    const blockedMessage = sessionStorage.getItem("blocked_access_message");
    if (blockedMessage) {
      toast.error(blockedMessage);
      sessionStorage.removeItem("blocked_access_message");
    }

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const queryParams = new URLSearchParams(window.location.search);
    const authError = hashParams.get("error_description") || queryParams.get("error_description");
    const authType = hashParams.get("type") || queryParams.get("type");

    if (authError) {
      toast.error(
        authError.includes("expired")
          ? "Esse link expirou ou já foi usado. Peça um novo e-mail de redefinição."
          : authError,
      );
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (authType === "recovery" || hashParams.has("access_token")) {
      setMode("recovery");
    }
  }, []);

  if (authLoading) {
    return (
      <div className={`${embedded ? "min-h-[60vh]" : "min-h-screen"} flex items-center justify-center bg-background`}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (user && mode !== "recovery") return <Navigate to={redirectTo} replace />;

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

      if (mode === "forgot") {
        const email = form.email.trim().toLowerCase();
        if (!email) {
          toast.error("Informe seu e-mail para receber o link de redefinição.");
          return;
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: recoveryRedirectUrl,
        });

        if (error) {
          toast.error(error.message || "Não foi possível enviar o e-mail de redefinição.");
          return;
        }

        toast.success("Enviamos um link para redefinir sua senha.");
        setMode("login");
        setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        return;
      }

      if (mode === "recovery") {
        if (form.password.length < 6) {
          toast.error("A senha precisa ter pelo menos 6 caracteres.");
          return;
        }

        if (form.password !== form.confirmPassword) {
          toast.error("As senhas não conferem.");
          return;
        }

        const { error } = await supabase.auth.updateUser({ password: form.password });

        if (error) {
          toast.error(getPasswordUpdateErrorMessage(error.message));
          return;
        }

        toast.success("Senha criada com sucesso. Entre novamente com sua nova senha.");
        await supabase.auth.signOut();
        setMode("login");
        setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
        setShowPassword(false);
        setShowConfirmPassword(false);
        window.history.replaceState({}, document.title, "/login");
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
        <div className="space-y-3 text-center">
          <BrandLogo className="justify-center" imageClassName="h-16 w-auto max-w-[260px] object-contain" />
          <p className="text-sm text-muted-foreground">
            {mode === "login"
              ? "Entre na sua conta para acessar o estúdio"
              : mode === "forgot"
                ? "Informe seu e-mail para receber um link seguro"
              : mode === "recovery"
                ? "Crie uma nova senha para acessar sua conta"
                : "Crie sua conta para usar o sistema"}
          </p>
        </div>

        {(mode === "login" || mode === "register") && <div className="grid grid-cols-2 rounded-2xl border border-border bg-card/50 p-1">
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
        </div>}

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

          {mode !== "recovery" && <div className="space-y-1.5">
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
          </div>}

          {mode !== "forgot" && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => {
                    setMode("forgot");
                    setForm((current) => ({ ...current, password: "", confirmPassword: "" }));
                  }}
                  className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Esqueci minha senha
                </button>
              )}
            </div>
          )}

          {(mode === "register" || mode === "recovery") && (
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmar senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  minLength={6}
                  value={form.confirmPassword}
                  onChange={(e) => setForm((current) => ({ ...current, confirmPassword: e.target.value }))}
                  autoComplete="new-password"
                  className="pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={showConfirmPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === "recovery" && (
                <p className="text-xs text-muted-foreground">
                  Use uma senha diferente da senha atual ou temporária.
                </p>
              )}
            </div>
          )}

          <Button type="submit" className="w-full font-display font-semibold" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "login"
              ? "Entrar"
              : mode === "forgot"
                ? "Enviar link de redefinição"
                : mode === "recovery"
                  ? "Salvar nova senha"
                  : "Criar conta"}
          </Button>

          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Voltar para login
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
