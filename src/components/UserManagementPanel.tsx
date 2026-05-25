import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Mail, Plus, RefreshCw, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getEdgeFunctionUrl } from "@/lib/edgeFunctions";
import { getFunctionAuthorization, getSessionHeaders } from "@/lib/supabaseHeaders";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ManagedUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  is_affiliate: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
  photos_generated: number;
  credits: number;
};

type CreateUserForm = {
  fullName: string;
  email: string;
  password: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function UserManagementPanel() {
  const { session, profile } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [restricted, setRestricted] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [functionUnavailable, setFunctionUnavailable] = useState(false);
  const [creditDialogUser, setCreditDialogUser] = useState<ManagedUser | null>(null);
  const [creditAmount, setCreditAmount] = useState("10");
  const [form, setForm] = useState<CreateUserForm>({
    fullName: "",
    email: "",
    password: "",
  });

  const isAdmin = profile?.role === "admin";

  const getFunctionRequestHeaders = useCallback(
    () =>
      getSessionHeaders({
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization:
          getFunctionAuthorization(session, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) || "",
      }),
    [session],
  );

  const loadUsers = useCallback(async () => {
    if (!isAdmin) {
      setRestricted(true);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(getEdgeFunctionUrl("manage-users"), {
        method: "GET",
        headers: getFunctionRequestHeaders(),
      });

      if (response.ok) {
        const payload = await response.json();
        setRestricted(false);
        setFunctionUnavailable(false);
        setUsers(payload.users || []);
        return;
      }

      console.warn("Manage users function unavailable, falling back to direct query:", await response.text());

      const { data, error } = await supabase
        .from("user_profiles")
        .select("user_id, email, full_name, role, is_active, is_affiliate, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Load users direct error:", error);
        throw error;
      }

      const { data: generatedPhotos, error: photosError } = await supabase
        .from("photo_history")
        .select("user_id")
        .not("user_id", "is", null);

      if (photosError) {
        console.warn("Direct generated photos count unavailable:", photosError);
      }

      const photosByUserId = new Map<string, number>();
      for (const photo of generatedPhotos || []) {
        if (!photo.user_id) continue;
        photosByUserId.set(photo.user_id, (photosByUserId.get(photo.user_id) || 0) + 1);
      }

      const { data: creditRows, error: creditsError } = await supabase
        .from("user_credits")
        .select("user_id, credits");

      if (creditsError) {
        console.warn("Direct credits list unavailable:", creditsError);
      }

      const creditsByUserId = new Map<string, number>();
      for (const row of creditRows || []) {
        if (!row.user_id) continue;
        creditsByUserId.set(row.user_id, Number(row.credits) || 0);
      }

      setRestricted(false);
      setFunctionUnavailable(true);
      setUsers(
        (data || []).map((item) => ({
          id: item.user_id,
          email: item.email,
          full_name: item.full_name,
          role: item.role,
          is_active: item.is_active,
          is_affiliate: item.is_affiliate,
          created_at: item.created_at,
          last_sign_in_at: null,
          photos_generated: photosByUserId.get(item.user_id) || 0,
          credits: creditsByUserId.get(item.user_id) || 0,
        })),
      );
    } catch (error) {
      console.error("Load users error:", error);
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, [getFunctionRequestHeaders, isAdmin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const postAction = async (body: Record<string, unknown>) => {
    const response = await fetch(getEdgeFunctionUrl("manage-users"), {
      method: "POST",
      headers: getFunctionRequestHeaders(),
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || "Erro ao processar ação");
    }

    return payload;
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();

    if (functionUnavailable) {
      toast.error("A criação de usuários depende da função manage-users publicada no Supabase.");
      return;
    }

    if (!form.email.trim() || !form.password.trim()) {
      toast.error("Preencha e-mail e senha.");
      return;
    }

    try {
      setSubmitting(true);
      await postAction({
        action: "create-user",
        fullName: form.fullName,
        email: form.email,
        password: form.password,
      });
      toast.success("Usuário criado com sucesso.");
      setDialogOpen(false);
      setForm({
        fullName: "",
        email: "",
        password: "",
      });
      await loadUsers();
    } catch (error) {
      console.error("Create user error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao criar usuário");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (targetUser: ManagedUser, changes: { isActive?: boolean; isAffiliate?: boolean }) => {
    try {
      setPendingKey(targetUser.id);
      if (functionUnavailable) {
        const payload: { is_active?: boolean; is_affiliate?: boolean } = {};
        if (changes.isActive !== undefined) payload.is_active = changes.isActive;
        if (changes.isAffiliate !== undefined) payload.is_affiliate = changes.isAffiliate;

        const { error } = await supabase
          .from("user_profiles")
          .update(payload)
          .eq("user_id", targetUser.id);

        if (error) throw error;
      } else {
        await postAction({
          action: "update-user",
          userId: targetUser.id,
          isActive: changes.isActive,
          isAffiliate: changes.isAffiliate,
        });
      }
      setUsers((current) =>
        current.map((item) =>
          item.id === targetUser.id
            ? {
                ...item,
                is_active: changes.isActive ?? item.is_active,
                is_affiliate: changes.isAffiliate ?? item.is_affiliate,
              }
            : item,
        ),
      );
      toast.success("Usuário atualizado.");
    } catch (error) {
      console.error("Toggle user error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar usuário");
    } finally {
      setPendingKey(null);
    }
  };

  const handleSendReset = async (targetUser: ManagedUser) => {
    if (functionUnavailable) {
      toast.error("O reenvio de senha depende da função manage-users publicada no Supabase.");
      return;
    }

    try {
      setPendingKey(targetUser.id);
      await postAction({
        action: "send-reset",
        email: targetUser.email,
      });
      toast.success("E-mail de redefinição enviado.");
    } catch (error) {
      console.error("Reset user password error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao reenviar redefinição");
    } finally {
      setPendingKey(null);
    }
  };

  const handleAddCredits = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!creditDialogUser) return;

    if (functionUnavailable) {
      toast.error("Adicionar créditos depende da função manage-users publicada no Supabase.");
      return;
    }

    const amount = Number(creditAmount);
    if (!Number.isInteger(amount) || amount <= 0) {
      toast.error("Informe uma quantidade válida de créditos.");
      return;
    }

    try {
      setPendingKey(creditDialogUser.id);
      const payload = await postAction({
        action: "add-credits",
        userId: creditDialogUser.id,
        amount,
      });

      const nextCredits = Number(payload?.credits) || 0;
      setUsers((current) =>
        current.map((item) =>
          item.id === creditDialogUser.id ? { ...item, credits: nextCredits } : item,
        ),
      );
      toast.success(`${amount} crédito${amount !== 1 ? "s" : ""} adicionado${amount !== 1 ? "s" : ""}.`);
      setCreditDialogUser(null);
      setCreditAmount("10");
    } catch (error) {
      console.error("Add credits error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao adicionar créditos");
    } finally {
      setPendingKey(null);
    }
  };

  const handleDelete = async (targetUser: ManagedUser) => {
    if (functionUnavailable) {
      toast.error("A remoção de usuários depende da função manage-users publicada no Supabase.");
      return;
    }

    const confirmed = window.confirm(`Remover o usuário ${targetUser.email}? Essa ação não pode ser desfeita.`);
    if (!confirmed) return;

    try {
      setPendingKey(targetUser.id);
      await postAction({
        action: "delete-user",
        userId: targetUser.id,
      });
      setUsers((current) => current.filter((item) => item.id !== targetUser.id));
      toast.success("Usuário removido.");
    } catch (error) {
      console.error("Delete user error:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao remover usuário");
    } finally {
      setPendingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-panel flex min-h-72 items-center justify-center px-6 py-6 md:px-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (restricted) {
    return (
      <div className="dashboard-panel space-y-3 px-6 py-6 md:px-8">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UserCog className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Gerenciamento de usuários</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Essa área fica disponível apenas para contas com perfil de administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-panel space-y-6 px-6 py-6 md:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UserCog className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Usuários</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Adicione usuários, desative o acesso, reenvie o e-mail de redefinição de senha e marque quem pode usar a área de afiliados.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadUsers()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Novo usuário
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Criar usuário</DialogTitle>
                <DialogDescription>
                  O novo usuário entra ativo e depois você pode liberar afiliado quando quiser.
                </DialogDescription>
              </DialogHeader>

              <form className="space-y-4" onSubmit={handleCreateUser}>
                <div className="space-y-1.5">
                  <Label htmlFor="new-user-name">Nome</Label>
                  <Input
                    id="new-user-name"
                    value={form.fullName}
                    onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                    placeholder="Nome do usuário"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-user-email">E-mail</Label>
                  <Input
                    id="new-user-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="usuario@email.com"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-user-password">Senha inicial</Label>
                  <Input
                    id="new-user-password"
                    type="password"
                    minLength={6}
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Mínimo de 6 caracteres"
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Criar usuário
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog open={!!creditDialogUser} onOpenChange={(open) => !open && setCreditDialogUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar créditos</DialogTitle>
            <DialogDescription>
              {creditDialogUser
                ? `Créditos atuais de ${creditDialogUser.email}: ${creditDialogUser.credits}`
                : "Informe a quantidade de créditos para adicionar."}
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleAddCredits}>
            <div className="space-y-1.5">
              <Label htmlFor="credit-amount">Quantidade</Label>
              <Input
                id="credit-amount"
                type="number"
                min={1}
                max={999999}
                step={1}
                value={creditAmount}
                onChange={(event) => setCreditAmount(event.target.value)}
                autoFocus
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={Boolean(pendingKey)}>
              {pendingKey ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Coins className="mr-2 h-4 w-4" />}
              Adicionar créditos
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {functionUnavailable ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          A listagem está funcionando em modo básico pelo banco. Para criar usuário, remover conta, reenviar redefinição de senha e adicionar créditos, publique a edge function `manage-users`.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-border/70">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Usuário</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Afiliado</TableHead>
              <TableHead>Créditos</TableHead>
              <TableHead>Fotos</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Último acesso</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((managedUser) => {
              const isBusy = pendingKey === managedUser.id;

              return (
                <TableRow key={managedUser.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{managedUser.full_name || "Sem nome"}</p>
                      <p className="text-sm text-muted-foreground">{managedUser.email}</p>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="rounded-full">
                          {managedUser.role === "admin" ? "Administrador" : "Usuário"}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={managedUser.is_active}
                        disabled={isBusy}
                        onCheckedChange={(checked) => void handleToggle(managedUser, { isActive: checked })}
                        aria-label={managedUser.is_active ? "Desativar acesso" : "Ativar acesso"}
                        title={managedUser.is_active ? "Acesso ativo" : "Acesso desativado"}
                      />
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={managedUser.is_affiliate}
                        disabled={isBusy}
                        onCheckedChange={(checked) => void handleToggle(managedUser, { isAffiliate: checked })}
                        aria-label={managedUser.is_affiliate ? "Remover acesso de afiliado" : "Tornar afiliado"}
                        title={managedUser.is_affiliate ? "Área de afiliados liberada" : "Mostrar convite de afiliado"}
                      />
                    </div>
                  </TableCell>

                  <TableCell className="text-sm font-semibold text-foreground">{managedUser.credits}</TableCell>
                  <TableCell className="text-sm font-semibold text-foreground">{managedUser.photos_generated}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(managedUser.created_at)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(managedUser.last_sign_in_at)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isBusy || functionUnavailable}
                        onClick={() => {
                          setCreditDialogUser(managedUser);
                          setCreditAmount("10");
                        }}
                        aria-label={`Adicionar créditos para ${managedUser.email}`}
                        title="Adicionar créditos"
                      >
                        <Coins className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isBusy || functionUnavailable}
                        onClick={() => void handleSendReset(managedUser)}
                        aria-label={`Reenviar senha para ${managedUser.email}`}
                        title="Reenviar senha"
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isBusy || managedUser.role === "admin" || functionUnavailable}
                        onClick={() => void handleDelete(managedUser)}
                        aria-label={`Remover ${managedUser.email}`}
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
