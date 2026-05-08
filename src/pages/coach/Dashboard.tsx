import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, User, MoreVertical, Pencil, Power, Trash2, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";

/**
 * Workaround para o bug do supabase-js v2 com JWT ES256:
 * supabase.auth.getSession() chama jose.jwtVerify internamente e lança exceção.
 * Lemos o token diretamente do localStorage sem passar pelo jose.
 *
 * Solução definitiva: mudar JWT Algorithm para HS256 em
 * Supabase Dashboard → Authentication → Settings → JWT Settings.
 */
function getSessionDirect(): { accessToken: string; userId: string } | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("sb-") && key.endsWith("-auth-token")) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const token = parsed?.access_token ?? parsed?.session?.access_token;
        if (!token) continue;
        // Decodifica payload do JWT para obter o user id (sub)
        const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = part + "=".repeat((4 - (part.length % 4)) % 4);
        const payload = JSON.parse(atob(padded));
        if (!payload?.sub) continue;
        return { accessToken: token, userId: payload.sub };
      }
    }
  } catch {}
  return null;
}

/** Compat: só retorna o access token */
function getAccessTokenDirect(): string | null {
  return getSessionDirect()?.accessToken ?? null;
}

const studentSchema = z.object({
  email: z.string().email("Email inválido").max(255, "Email muito longo"),
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  observacoes: z.string().max(1000, "Observações muito longas").optional(),
});

interface Aluno {
  id: string;
  user_id: string;
  observacoes: string;
  ativo: boolean;
  profiles: {
    nome: string;
    email?: string;
  };
}

const CoachDashboard = () => {
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [novoAluno, setNovoAluno] = useState({ email: "", nome: "", observacoes: "" });
  const [editingAluno, setEditingAluno] = useState<Aluno | null>(null);
  const [deletingAlunoId, setDeletingAlunoId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug } = useTenantContext();

  useEffect(() => {
    checkAuth();
    loadAlunos();
  }, []);

  const checkAuth = async () => {
    const session = getSessionDirect();
    if (!session) { navigate("/auth"); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("tipo_usuario")
      .eq("id", session.userId)
      .single();

    if (profile?.tipo_usuario !== "treinador") navigate("/aluno");
  };

  const loadAlunos = async () => {
    try {
      const session = getSessionDirect();
      if (!session) return;

      const { data, error } = await supabase
        .from("alunos")
        .select(`id, user_id, observacoes, ativo, profiles!alunos_user_id_fkey(nome)`)
        .eq("treinador_id", session.userId);

      if (error) throw error;
      setAlunos(data || []);
    } catch (error: any) {
      toast({ title: "Erro ao carregar alunos", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAddAluno = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Lê o access token direto do localStorage para evitar o bug ES256
      // do supabase-js v2 que chama jose.jwtVerify em getSession()
      const accessToken = getAccessTokenDirect();
      if (!accessToken) { navigate("/auth"); return; }

      const validation = studentSchema.safeParse({
        email: novoAluno.email,
        nome: novoAluno.nome,
        observacoes: novoAluno.observacoes || undefined,
      });

      if (!validation.success) throw new Error(validation.error.errors[0].message);

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-student`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(validation.data),
        }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) throw new Error(data?.error || data?.message || `Erro ${resp.status}`);

      setGeneratedPassword(data.password);
      setPasswordModalOpen(true);
      setDialogOpen(false);
      setNovoAluno({ email: "", nome: "", observacoes: "" });
      loadAlunos();
    } catch (error: any) {
      toast({ title: "Erro ao adicionar aluno", description: error.message, variant: "destructive" });
    }
  };

  const handleEditAluno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAluno) return;

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ nome: editingAluno.profiles.nome })
        .eq("id", editingAluno.user_id);

      if (profileError) throw profileError;

      const { error: alunoError } = await supabase
        .from("alunos")
        .update({ observacoes: editingAluno.observacoes })
        .eq("id", editingAluno.id);

      if (alunoError) throw alunoError;

      toast({ title: "Aluno atualizado!", description: "Dados atualizados com sucesso." });
      setEditDialogOpen(false);
      setEditingAluno(null);
      loadAlunos();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar aluno", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleAtivo = async (alunoId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("alunos")
        .update({ ativo: !currentStatus })
        .eq("id", alunoId);

      if (error) throw error;

      toast({
        title: currentStatus ? "Aluno desativado" : "Aluno ativado",
        description: `O aluno foi ${currentStatus ? "desativado" : "ativado"} com sucesso.`,
      });
      loadAlunos();
    } catch (error: any) {
      toast({ title: "Erro ao alterar status", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteAluno = async () => {
    if (!deletingAlunoId) return;
    try {
      const { error } = await supabase.from("alunos").delete().eq("id", deletingAlunoId);
      if (error) throw error;
      toast({ title: "Aluno excluído!", description: "O aluno foi removido com sucesso." });
      setDeleteDialogOpen(false);
      setDeletingAlunoId(null);
      loadAlunos();
    } catch (error: any) {
      toast({ title: "Erro ao excluir aluno", description: error.message, variant: "destructive" });
    }
  };

  const ativos = alunos.filter((a) => a.ativo).length;
  const inativos = alunos.filter((a) => !a.ativo).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-green-600/30 border-t-green-600 animate-spin" />
          <p className="text-white/40 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="px-6 lg:px-8 py-6 lg:py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Painel do Treinador
          </h1>
          <p className="text-white/55 mt-1 text-sm">Gerencie seus alunos e planos de treino</p>
        </div>

        {/* Stats */}
        {alunos.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-8 max-w-sm">
            {[
              { label: "Total", value: alunos.length, color: "text-white" },
              { label: "Ativos", value: ativos, color: "text-green-500" },
              { label: "Inativos", value: inativos, color: "text-white/50" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/8 bg-white/4 px-4 py-4"
              >
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className="text-xs text-white/50 mt-0.5 uppercase tracking-wider">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Section header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-white/50" />
            <h2 className="text-base font-semibold text-white">Meus Alunos</h2>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-xl h-9 px-4 text-white font-semibold text-sm transition-premium hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "var(--cp-gradient)",
                  boxShadow: "0 2px 16px rgba(var(--cp-rgb), 0.3)",
                }}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Novo Aluno
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-950 border-white/8">
              <DialogHeader>
                <DialogTitle className="text-white">Novo Aluno</DialogTitle>
                <DialogDescription className="text-white/40">Preencha os dados do aluno</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddAluno} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome" className="text-white/70">Nome completo</Label>
                  <Input
                    id="nome"
                    value={novoAluno.nome}
                    onChange={(e) => setNovoAluno({ ...novoAluno, nome: e.target.value })}
                    required
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/70">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={novoAluno.email}
                    onChange={(e) => setNovoAluno({ ...novoAluno, email: e.target.value })}
                    required
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="observacoes" className="text-white/70">Observações</Label>
                  <Textarea
                    id="observacoes"
                    value={novoAluno.observacoes}
                    onChange={(e) => setNovoAluno({ ...novoAluno, observacoes: e.target.value })}
                    placeholder="Informações adicionais"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl resize-none"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full rounded-xl h-11 text-white font-semibold"
                  style={{ background: "var(--cp-gradient)" }}
                >
                  Cadastrar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Student grid */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {alunos.map((aluno) => (
            <div
              key={aluno.id}
              className="group relative rounded-2xl border border-white/6 bg-white/3 hover:bg-white/5 hover:border-white/10 transition-premium cursor-pointer overflow-hidden"
              onClick={() => navigate(`/${slug}/treinador/aluno/${aluno.id}`)}
            >
              {/* Amber left accent bar */}
              <div
                className={`absolute left-0 top-0 bottom-0 w-0.5 transition-premium ${
                  aluno.ativo ? "bg-green-600/60 group-hover:bg-green-600" : "bg-white/10"
                }`}
              />

              <div className="p-4 pl-5">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-sm"
                    style={aluno.ativo
                      ? { background: "var(--cp-gradient)" }
                      : { background: "hsl(0 0% 18%)" }
                    }
                  >
                    <span className={aluno.ativo ? "text-white" : "text-white/30"}>
                      {aluno.profiles.nome.charAt(0).toUpperCase()}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white text-sm leading-tight truncate">
                        {aluno.profiles.nome}
                      </p>
                      {!aluno.ativo && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-white/8 text-white/45 border-0 px-1.5 py-0"
                        >
                          Inativo
                        </Badge>
                      )}
                    </div>
                    {aluno.observacoes && (
                      <p className="text-xs text-white/50 mt-0.5 truncate">{aluno.observacoes}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-white/20 hover:text-white/70 hover:bg-white/8 rounded-lg opacity-0 group-hover:opacity-100 transition-premium"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="bg-zinc-950 border-white/8 rounded-xl"
                    >
                      <DropdownMenuItem
                        className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
                        onClick={() => navigate(`/${slug}/treinador/aluno/${aluno.id}`)}
                      >
                        <User className="h-4 w-4 mr-2" />
                        Ver detalhes
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
                        onClick={() => { setEditingAluno(aluno); setEditDialogOpen(true); }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
                        onClick={() => handleToggleAtivo(aluno.id, aluno.ativo)}
                      >
                        <Power className="h-4 w-4 mr-2" />
                        {aluno.ativo ? "Desativar" : "Ativar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-red-400 hover:text-red-300 focus:text-red-300 rounded-lg cursor-pointer"
                        onClick={() => { setDeletingAlunoId(aluno.id); setDeleteDialogOpen(true); }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {alunos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/4 flex items-center justify-center mb-4 border border-white/8">
              <Users className="w-7 h-7 text-white/35" />
            </div>
            <p className="text-white/60 text-sm mb-1">Nenhum aluno cadastrado ainda</p>
            <p className="text-white/40 text-xs mb-6">Comece adicionando seu primeiro aluno</p>
            <Button
              onClick={() => setDialogOpen(true)}
              className="rounded-xl h-10 px-5 text-white font-semibold"
              style={{ background: "var(--cp-gradient)" }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar primeiro aluno
            </Button>
          </div>
        )}

        {/* Edit dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-zinc-950 border-white/8">
            <DialogHeader>
              <DialogTitle className="text-white">Editar Aluno</DialogTitle>
            </DialogHeader>
            {editingAluno && (
              <form onSubmit={handleEditAluno} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white/70">Nome</Label>
                  <Input
                    value={editingAluno.profiles.nome}
                    onChange={(e) => setEditingAluno({
                      ...editingAluno,
                      profiles: { ...editingAluno.profiles, nome: e.target.value },
                    })}
                    className="bg-white/5 border-white/10 text-white rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Observações</Label>
                  <Textarea
                    value={editingAluno.observacoes || ""}
                    onChange={(e) => setEditingAluno({ ...editingAluno, observacoes: e.target.value })}
                    className="bg-white/5 border-white/10 text-white rounded-xl resize-none"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full rounded-xl h-11 text-white font-semibold"
                  style={{ background: "var(--cp-gradient)" }}
                >
                  Salvar
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete alert */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-zinc-950 border-white/8 rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">Excluir aluno?</AlertDialogTitle>
              <AlertDialogDescription className="text-white/40">
                Esta ação não pode ser desfeita. Todos os dados do aluno serão removidos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/8 text-white/60 hover:text-white rounded-xl">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteAluno}
                className="bg-red-500/80 hover:bg-red-500 text-white rounded-xl"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Password modal */}
        <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
          <DialogContent className="bg-zinc-950 border-white/8 rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Aluno criado com sucesso!</DialogTitle>
              <DialogDescription className="text-white/40">
                Copie a senha abaixo e envie ao aluno.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/8 rounded-xl p-4">
                <p className="text-xs text-white/30 mb-2 uppercase tracking-wider">Senha gerada</p>
                <p className="text-2xl font-mono font-bold text-green-500 select-all">
                  {generatedPassword}
                </p>
              </div>
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(generatedPassword);
                  toast({ title: "Senha copiada!", description: "Copiada para a área de transferência." });
                }}
                className="w-full rounded-xl h-11 text-white font-semibold"
                style={{ background: "var(--cp-gradient)" }}
              >
                Copiar senha
              </Button>
              <p className="text-xs text-white/25 text-center">
                O aluno poderá alterar a senha nas configurações de perfil.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default CoachDashboard;
