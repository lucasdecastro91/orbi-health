import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Plus, User, MoreVertical, Pencil, Power, Trash2, Users, Dumbbell, Utensils, HeartPulse, ClipboardCheck, Clock, Search } from "lucide-react";
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
import { getSessionDirect, getAccessTokenDirect } from "@/lib/sessionUtils";
import { useCollaboratorPermissions } from "@/hooks/useCollaboratorPermissions";

// Mesmo tratamento "alto relevo" já usado no Dashboard do treinador — fundo
// um pouco mais claro que o zinc-950 da página + sombra em camadas.
const CARD_BG     = "#141417";
const CARD_BORDER = "rgba(255,255,255,0.09)";
const CARD_SHADOW = "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)";

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
  data_inicio: string | null;
  data_fim: string | null;
  profiles: { nome: string; email?: string };
}

interface AlunoStatus {
  treino: boolean;
  dieta: boolean;
  cardio: boolean;
  anamnese: boolean;
}

const daysRemaining = (dataFim: string | null): number | null => {
  if (!dataFim) return null;
  const diff = new Date(dataFim).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const MeusClientes = () => {
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, AlunoStatus>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [reusedAccount, setReusedAccount] = useState(false);
  const [novoAluno, setNovoAluno] = useState({ email: "", nome: "", observacoes: "" });
  const [editingAluno, setEditingAluno] = useState<Aluno | null>(null);
  const [deletingAlunoId, setDeletingAlunoId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();
  const { hasDiet, hasTraining } = usePlanFeatures();
  const { isCollaborator, loading: collabLoading } = useCollaboratorPermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = (searchParams.get("filter") ?? "todos") as "todos" | "ativos" | "inativos";

  useEffect(() => {
    checkAuth();
    loadAlunos();
  }, []);

  const checkAuth = async () => {
    const session = getSessionDirect();
    if (!session) { navigate("/auth"); return; }
    const { data: profile } = await supabase
      .from("profiles").select("tipo_usuario").eq("id", session.userId).single();
    if (profile?.tipo_usuario !== "treinador") navigate("/aluno");
  };

  const loadAlunos = async () => {
    try {
      const session = getSessionDirect();
      if (!session) return;
      // RLS filtra automaticamente: treinador vê os seus, colaborador vê os da org
      const { data, error } = await supabase
        .from("alunos")
        .select(`id, user_id, observacoes, ativo, data_inicio, data_fim, profiles!alunos_user_id_fkey(nome)`);
      if (error) throw error;
      const rows = (data || []) as Aluno[];
      rows.sort((a, b) => a.profiles.nome.localeCompare(b.profiles.nome, "pt-BR"));
      setAlunos(rows);
      if (rows.length > 0) loadStatus(rows);
    } catch (error: any) {
      toast({ title: "Erro ao carregar clientes", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadStatus = async (rows: Aluno[]) => {
    try {
      const alunoIds = rows.map((a) => a.id);
      const userIds  = rows.map((a) => a.user_id);
      const [treinoRes, dietaRes, cardioRes, anamneseRes] = await Promise.all([
        supabase.from("planos_treino").select("aluno_id").in("aluno_id", alunoIds),
        supabase.from("diets").select("student_id").eq("is_active", true).in("student_id", userIds),
        supabase.from("cardio_planos").select("aluno_id").in("aluno_id", alunoIds),
        supabase.from("anamneses").select("student_id").in("student_id", userIds),
      ]);
      const treinoSet   = new Set((treinoRes.data   ?? []).map((r: any) => r.aluno_id));
      const dietaSet    = new Set((dietaRes.data    ?? []).map((r: any) => r.student_id));
      const cardioSet   = new Set((cardioRes.data   ?? []).map((r: any) => r.aluno_id));
      const anamneseSet = new Set((anamneseRes.data ?? []).map((r: any) => r.student_id));
      const map: Record<string, AlunoStatus> = {};
      for (const a of rows) {
        map[a.id] = {
          treino:   treinoSet.has(a.id),
          dieta:    dietaSet.has(a.user_id),
          cardio:   cardioSet.has(a.id),
          anamnese: anamneseSet.has(a.user_id),
        };
      }
      setStatusMap(map);
    } catch {}
  };

  const handleAddAluno = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const accessToken = getAccessTokenDirect();
      if (!accessToken) { navigate("/auth"); return; }
      const validation = studentSchema.safeParse({
        email: novoAluno.email,
        nome: novoAluno.nome,
        observacoes: novoAluno.observacoes || undefined,
      });
      if (!validation.success) throw new Error(validation.error.errors[0].message);
      // org_id explícito é obrigatório: sem ele, create-student caía num fallback
      // não-determinístico que podia vincular o aluno à org errada quando o
      // treinador é dono de mais de uma org (bug real: Nelbinho/Eduardo).
      if (!orgId) throw new Error("Organização ainda carregando — tente novamente em instantes.");
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-student`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ ...validation.data, org_id: orgId }),
        }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) throw new Error(data?.error || data?.message || `Erro ${resp.status}`);
      setGeneratedPassword(data.password ?? "");
      setReusedAccount(!!data.reused_existing_account);
      setPasswordModalOpen(true);
      setDialogOpen(false);
      setNovoAluno({ email: "", nome: "", observacoes: "" });
      loadAlunos();
    } catch (error: any) {
      toast({ title: "Erro ao adicionar cliente", description: error.message, variant: "destructive" });
    }
  };

  const handleEditAluno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAluno) return;
    try {
      const { error: profileError } = await supabase
        .from("profiles").update({ nome: editingAluno.profiles.nome }).eq("id", editingAluno.user_id);
      if (profileError) throw profileError;
      const { error: alunoError } = await supabase
        .from("alunos").update({ observacoes: editingAluno.observacoes }).eq("id", editingAluno.id);
      if (alunoError) throw alunoError;
      toast({ title: "Cliente atualizado!", description: "Dados atualizados com sucesso." });
      setEditDialogOpen(false);
      setEditingAluno(null);
      loadAlunos();
    } catch (error: any) {
      toast({ title: "Erro ao atualizar cliente", description: error.message, variant: "destructive" });
    }
  };

  const handleToggleAtivo = async (alunoId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase.from("alunos").update({ ativo: !currentStatus }).eq("id", alunoId);
      if (error) throw error;
      toast({
        title: currentStatus ? "Cliente desativado" : "Cliente ativado",
        description: `O cliente foi ${currentStatus ? "desativado" : "ativado"} com sucesso.`,
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
      toast({ title: "Cliente excluído!", description: "O cliente foi removido com sucesso." });
      setDeleteDialogOpen(false);
      setDeletingAlunoId(null);
      loadAlunos();
    } catch (error: any) {
      toast({ title: "Erro ao excluir cliente", description: error.message, variant: "destructive" });
    }
  };

  // ── Filtered list ──────────────────────────────────────────
  const byStatus = filter === "ativos"   ? alunos.filter((a) => a.ativo)
                  : filter === "inativos" ? alunos.filter((a) => !a.ativo)
                  : alunos;
  const filtered = search.trim()
    ? byStatus.filter((a) => a.profiles.nome.toLowerCase().includes(search.trim().toLowerCase()))
    : byStatus;

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Meus Clientes</h1>
            <p className="text-white/45 text-sm mt-0.5">{alunos.length} cliente{alunos.length !== 1 ? "s" : ""} cadastrado{alunos.length !== 1 ? "s" : ""}</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-xl h-9 px-4 text-white font-semibold text-sm"
                style={{ background: "var(--cp-gradient)", boxShadow: "0 2px 16px rgba(var(--cp-rgb), 0.3)" }}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Novo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-zinc-950 border-white/8">
              <DialogHeader>
                <DialogTitle className="text-white">Novo Cliente</DialogTitle>
                <DialogDescription className="text-white/40">Preencha os dados do cliente</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddAluno} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome" className="text-white/70">Nome completo</Label>
                  <Input id="nome" value={novoAluno.nome}
                    onChange={(e) => setNovoAluno({ ...novoAluno, nome: e.target.value })}
                    required className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/70">Email</Label>
                  <Input id="email" type="email" value={novoAluno.email}
                    onChange={(e) => setNovoAluno({ ...novoAluno, email: e.target.value })}
                    required className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="observacoes" className="text-white/70">Observações</Label>
                  <Textarea id="observacoes" value={novoAluno.observacoes}
                    onChange={(e) => setNovoAluno({ ...novoAluno, observacoes: e.target.value })}
                    placeholder="Informações adicionais"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl resize-none" />
                </div>
                <Button type="submit" className="w-full rounded-xl h-11 text-white font-semibold"
                  style={{ background: "var(--cp-gradient)" }}>
                  Cadastrar
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        {alunos.length > 0 && (
          <div className="relative mb-4 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="bg-white/5 border-white/10 text-white rounded-xl h-10 pl-9 text-sm" />
          </div>
        )}

        {/* Filter tabs */}
        {alunos.length > 0 && (
          <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ backgroundColor: "var(--toggle-bg)", width: "fit-content" }}>
            {([
              { key: "todos",    label: "Todos",    count: alunos.length },
              { key: "ativos",   label: "Ativos",   count: alunos.filter((a) => a.ativo).length },
              { key: "inativos", label: "Inativos", count: alunos.filter((a) => !a.ativo).length },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSearchParams(tab.key === "todos" ? {} : { filter: tab.key })}
                className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium transition-colors"
                style={filter === tab.key
                  ? { background: "var(--filter-active-bg)", color: "var(--filter-active-color)", border: "1px solid var(--filter-active-border)" }
                  : { color: "var(--ui-inactive-color)", border: "1px solid transparent" }}
              >
                {tab.label}
                <span className="text-[10px] opacity-75">({tab.count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Client grid */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((aluno) => {
            const st = statusMap[aluno.id];
            const dias = daysRemaining(aluno.data_fim);
            const initials = aluno.profiles.nome.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
            return (
              <div
                key={aluno.id}
                className="group relative rounded-2xl cursor-pointer overflow-hidden hover:-translate-y-0.5 active:translate-y-0 transition-all"
                style={{ backgroundColor: CARD_BG, border: `1px solid ${CARD_BORDER}`, boxShadow: CARD_SHADOW }}
                onClick={() => navigate(`/${slug}/treinador/aluno/${aluno.id}`)}
              >
                <div className={`absolute left-0 top-0 bottom-0 w-0.5 transition-premium ${
                  aluno.ativo ? "bg-green-600/60 group-hover:bg-green-600" : "bg-white/10"
                }`} />

                <div className="p-4 pl-5">
                  <div className="flex items-start gap-3">
                    {(() => {
                      const badges = [
                        { key: "treino",   label: "Treino",   icon: Dumbbell,       ok: st?.treino,   show: hasTraining },
                        { key: "dieta",    label: "Dieta",    icon: Utensils,       ok: st?.dieta,    show: hasDiet     },
                        { key: "cardio",   label: "Cardio",   icon: HeartPulse,     ok: st?.cardio,   show: true        },
                        { key: "anamnese", label: "Anamnese", icon: ClipboardCheck, ok: st?.anamnese, show: true        },
                      ].filter((b) => b.show);
                      const done = badges.filter((b) => b.ok).length;
                      const total = badges.length || 1;
                      const r = 21;
                      const circ = 2 * Math.PI * r;
                      const ringColor = done === total ? "#4ade80" : "var(--cp-500, #fbbf24)";
                      return (
                        <>
                          <div className="relative w-12 h-12 shrink-0">
                            {st && (
                              <svg viewBox="0 0 48 48" className="absolute inset-0" style={{ transform: "rotate(-90deg)" }}>
                                <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                                <circle
                                  cx="24" cy="24" r={r} fill="none" stroke={ringColor} strokeWidth="3" strokeLinecap="round"
                                  strokeDasharray={`${(done / total) * circ} ${circ}`}
                                />
                              </svg>
                            )}
                            <div
                              className="absolute inset-1 rounded-full flex items-center justify-center text-white font-bold text-sm"
                              style={aluno.ativo ? { background: "var(--cp-gradient)" } : { background: "hsl(0 0% 18%)" }}
                            >
                              <span className={aluno.ativo ? "text-white" : "text-white/30"}>{initials}</span>
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-white text-sm leading-tight truncate">{aluno.profiles.nome}</p>
                              {!aluno.ativo && (
                                <Badge variant="secondary" className="text-[10px] bg-white/8 text-white/45 border-0 px-1.5 py-0">
                                  Inativo
                                </Badge>
                              )}
                            </div>
                            {dias !== null && (
                              <div className="flex items-center gap-1 mt-1">
                                <Clock className="w-3 h-3 shrink-0" style={{ color: dias <= 7 ? "#f87171" : dias <= 30 ? "#fbbf24" : "#4ade80" }} />
                                <span className="text-[11px] font-medium" style={{ color: dias <= 7 ? "#f87171" : dias <= 30 ? "#fbbf24" : "#4ade80" }}>
                                  {dias <= 0 ? "Plano encerrado" : `${dias} dias restantes`}
                                </span>
                              </div>
                            )}
                            {!aluno.data_fim && aluno.observacoes && (
                              <p className="text-xs text-white/50 mt-0.5 truncate">{aluno.observacoes}</p>
                            )}
                          </div>

                          {st && (
                            <div className="flex items-center gap-1 shrink-0">
                              {badges.map(({ key, label, icon: Icon, ok }) => (
                                <Tooltip key={key}>
                                  <TooltipTrigger asChild>
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-6 h-6 rounded-lg flex items-center justify-center"
                                      style={{
                                        backgroundColor: ok ? "var(--tag-success-bg)" : "var(--tag-inactive-bg)",
                                        color: ok ? "var(--tag-success-color)" : "var(--tag-inactive-color)",
                                        border: `1px solid ${ok ? "var(--tag-success-border)" : "var(--tag-inactive-border)"}`,
                                      }}
                                    >
                                      <Icon className="w-3.5 h-3.5" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">{label}</TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="sm"
                                className="h-7 w-7 p-0 text-white/20 hover:text-white/70 hover:bg-white/8 rounded-lg opacity-0 group-hover:opacity-100 transition-premium">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-zinc-950 border-white/8 rounded-xl">
                              <DropdownMenuItem className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
                                onClick={() => navigate(`/${slug}/treinador/aluno/${aluno.id}`)}>
                                <User className="h-4 w-4 mr-2" />Ver detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
                                onClick={() => { setEditingAluno(aluno); setEditDialogOpen(true); }}>
                                <Pencil className="h-4 w-4 mr-2" />Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-white/70 hover:text-white focus:text-white rounded-lg cursor-pointer"
                                onClick={() => handleToggleAtivo(aluno.id, aluno.ativo)}>
                                <Power className="h-4 w-4 mr-2" />{aluno.ativo ? "Desativar" : "Ativar"}
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-400 hover:text-red-300 focus:text-red-300 rounded-lg cursor-pointer"
                                onClick={(e) => { e.stopPropagation(); setDeletingAlunoId(aluno.id); setDeleteDialogOpen(true); }}>
                                <Trash2 className="h-4 w-4 mr-2" />Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty states */}
        {alunos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/4 flex items-center justify-center mb-4 border border-white/8">
              <Users className="w-7 h-7 text-white/35" />
            </div>
            <p className="text-white/60 text-sm mb-1">Nenhum cliente cadastrado ainda</p>
            <p className="text-white/40 text-xs mb-6">Comece adicionando seu primeiro cliente</p>
            <Button onClick={() => setDialogOpen(true)}
              className="rounded-xl h-10 px-5 text-white font-semibold"
              style={{ background: "var(--cp-gradient)" }}>
              <Plus className="w-4 h-4 mr-2" />Adicionar primeiro cliente
            </Button>
          </div>
        )}
        {alunos.length > 0 && filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-white/30 text-sm">
              {search.trim()
                ? "Nenhum cliente encontrado para essa busca."
                : `Nenhum cliente ${filter === "ativos" ? "ativo" : "inativo"} encontrado.`}
            </p>
          </div>
        )}

        {/* Edit dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-zinc-950 border-white/8">
            <DialogHeader>
              <DialogTitle className="text-white">Editar Cliente</DialogTitle>
            </DialogHeader>
            {editingAluno && (
              <form onSubmit={handleEditAluno} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-white/70">Nome</Label>
                  <Input value={editingAluno.profiles.nome}
                    onChange={(e) => setEditingAluno({ ...editingAluno, profiles: { ...editingAluno.profiles, nome: e.target.value } })}
                    className="bg-white/5 border-white/10 text-white rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/70">Observações</Label>
                  <Textarea value={editingAluno.observacoes || ""}
                    onChange={(e) => setEditingAluno({ ...editingAluno, observacoes: e.target.value })}
                    className="bg-white/5 border-white/10 text-white rounded-xl resize-none" />
                </div>
                <Button type="submit" className="w-full rounded-xl h-11 text-white font-semibold"
                  style={{ background: "var(--cp-gradient)" }}>
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
              <AlertDialogTitle className="text-white">Excluir cliente?</AlertDialogTitle>
              <AlertDialogDescription className="text-white/40">
                Esta ação não pode ser desfeita. Todos os dados do cliente serão removidos permanentemente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/8 text-white/60 hover:text-white rounded-xl">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteAluno} className="bg-red-500/80 hover:bg-red-500 text-white rounded-xl">Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Password modal */}
        <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
          <DialogContent className="bg-zinc-950 border-white/8 rounded-2xl sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">
                {reusedAccount ? "Cliente vinculado com sucesso!" : "Cliente criado com sucesso!"}
              </DialogTitle>
              <DialogDescription className="text-white/40">
                {reusedAccount
                  ? "Esse e-mail já tinha uma conta na ORBI — o cliente já pode acessar com a senha que já usa."
                  : "Copie a senha abaixo e envie ao cliente."}
              </DialogDescription>
            </DialogHeader>
            {!reusedAccount && (
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/8 rounded-xl p-4">
                  <p className="text-xs text-white/50 mb-2 uppercase tracking-wider">Senha gerada</p>
                  <p className="text-lg font-mono font-bold text-white tracking-widest">{generatedPassword}</p>
                </div>
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(generatedPassword);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="w-full rounded-xl h-10 text-white font-semibold"
                  style={{ background: "var(--cp-gradient)" }}
                >
                  {copied ? "Copiado!" : "Copiar senha"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default MeusClientes;
