import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Mail, Lock, Loader2 } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

export default function PerfilPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.user_metadata?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  const handleSaveName = async () => {
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
    if (error) toast.error("Erro ao salvar nome.");
    else toast.success("Nome atualizado!");
    setSavingName(false);
  };

  const handleSaveEmail = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      toast.error("Informe um e-mail válido.");
      return;
    }

    if (normalizedEmail === (user.email ?? "").toLowerCase()) {
      toast.error("Digite um e-mail diferente do atual.");
      return;
    }

    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: normalizedEmail });

    if (error) {
      toast.error("Erro ao atualizar e-mail.");
    } else {
      toast.success("Pedido de alteração enviado. Confira seu e-mail para confirmar a troca.");
    }

    setSavingEmail(false);
  };

  const handleSavePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) toast.error("Erro ao atualizar senha.");
    else {
      await supabase.auth.signOut({ scope: "global" });
      toast.success("Senha atualizada. Todos os acessos foram desconectados.");
      setNewPassword("");
      setConfirmPassword("");
      navigate("/login", { replace: true });
    }
    setSavingPassword(false);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/80">Conta</p>
        <h1 className="text-2xl font-display font-bold text-foreground md:text-3xl">Meu Perfil</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Atualize seus dados principais, ajuste o acesso da conta e mantenha sua segurança em dia.
        </p>
      </div>

      <div className="dashboard-panel px-6 py-6 md:px-8">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <User className="h-7 w-7 text-primary" />
          </div>
          <div className="space-y-2">
            <div>
              <p className="font-display text-xl font-bold text-foreground">
                {user.user_metadata?.full_name || "Sem nome"}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> {user.email}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-xs text-muted-foreground">
                Conta pessoal
              </div>
              <div className="rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-xs text-foreground">
                Acesso ativo
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="dashboard-panel space-y-5 px-6 py-6 md:px-8">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-display font-semibold text-foreground">
              <User className="h-4 w-4 text-primary" />
              Informações pessoais
            </h2>
            <p className="text-sm text-muted-foreground">
              Mantenha seu nome atualizado como ele aparece dentro da plataforma.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <Button onClick={handleSaveName} disabled={savingName} className="rounded-full md:px-6">
              {savingName && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Salvar nome
            </Button>
          </div>
        </div>

        <div className="dashboard-panel space-y-5 px-6 py-6 md:px-8">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-display font-semibold text-foreground">
              <Mail className="h-4 w-4 text-primary" />
              E-mail de acesso
            </h2>
            <p className="text-sm text-muted-foreground">
              Troque o e-mail principal da conta. A confirmação pode ser exigida no endereço atual ou no novo.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="email">Novo e-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
              />
            </div>
            <Button onClick={handleSaveEmail} disabled={savingEmail} className="rounded-full md:px-6">
              {savingEmail && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Atualizar e-mail
            </Button>
          </div>
        </div>

        <div className="dashboard-panel space-y-5 px-6 py-6 md:px-8">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-display font-semibold text-foreground">
              <Lock className="h-4 w-4 text-primary" />
              Segurança
            </h2>
            <p className="text-sm text-muted-foreground">
              Defina uma nova senha para manter sua conta protegida.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nova senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            Use pelo menos 6 caracteres. Se puder, combine letras, números e símbolos.
          </p>

          <Button onClick={handleSavePassword} disabled={savingPassword} className="w-full rounded-full">
            {savingPassword && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Redefinir senha
          </Button>
        </div>
      </div>
    </div>
  );
}
