import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, User, MoreVertical, Pencil, Power, Trash2, Users, Dumbbell, Utensils, HeartPulse,
  ClipboardCheck, Clock, Search, Upload, FileText, CheckCircle2, XCircle, AlertTriangle, Loader2,
} from "lucide-react";
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
const CARD_BG     = "var(--section-card-bg)";
const CARD_BORDER = "var(--section-card-border)";
const CARD_SHADOW = "var(--section-card-shadow)";

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

// ── Import em massa ──────────────────────────────────────────────
type ImportRowStatus = "pending" | "creating" | "success" | "reused" | "error" | "skipped";

interface ImportRow {
  nome: string;
  email: string;
  telefone: string;
  error?: string;
  status: ImportRowStatus;
  resultMessage?: string;
}

const IMPORT_ERROR_MESSAGES: Record<string, string> = {
  already_client_of_this_trainer: "Já é seu cliente",
  email_already_registered: "E-mail já cadastrado, não foi possível vincular",
  org_id_forbidden: "Sem permissão nesta organização",
};

/** Aceita texto colado ou CSV — uma linha por cliente, com nome/email/telefone
 *  separados por tab, vírgula ou ponto-e-vírgula. Tab entra primeiro porque é o
 *  que vem ao colar células copiadas direto do Excel/Google Sheets — o jeito
 *  mais comum de usar isso na prática, não digitar/exportar um .csv à mão.
 *  Pula a primeira linha se parecer cabeçalho. */
const parseImportText = (text: string): ImportRow[] => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : (lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",");
  const splitLine = (l: string) => l.split(delimiter).map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
  const firstCols = splitLine(lines[0]);
  const col0 = (firstCols[0] ?? "").trim().toLowerCase();
  const col1 = (firstCols[1] ?? "").trim().toLowerCase();
  // Detecta cabeçalho com cuidado: um e-mail de verdade quase sempre contém a
  // palavra "email" no domínio (ex: "joao@gmail.com" não, mas "ana@email.com"
  // sim) — checar só a substring "email" na coluna 2 derrubava a primeira
  // linha de dados real como se fosse cabeçalho. Cabeçalho de verdade nunca
  // tem "@"; dado de verdade sempre tem.
  const looksLikeHeader = col0 === "nome" || ((col1.includes("email") || col1.includes("e-mail")) && !col1.includes("@"));
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const cols = splitLine(line);
    return { nome: cols[0] ?? "", email: cols[1] ?? "", telefone: cols[2] ?? "", status: "pending" as const };
  });
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Recalcula os erros de validação de cada linha — inclusive duplicidade de
 *  e-mail entre linhas, que só dá pra saber olhando a lista inteira de novo. */
const validateImportRows = (rows: ImportRow[]): ImportRow[] => {
  const emailCounts: Record<string, number> = {};
  rows.forEach((r) => {
    const e = r.email.trim().toLowerCase();
    if (e) emailCounts[e] = (emailCounts[e] ?? 0) + 1;
  });
  return rows.map((r) => {
    const email = r.email.trim();
    let error: string | undefined;
    if (!r.nome.trim()) error = "Nome obrigatório";
    else if (!email) error = "E-mail obrigatório";
    else if (!EMAIL_RE.test(email)) error = "E-mail inválido";
    else if (emailCounts[email.toLowerCase()] > 1) error = "E-mail duplicado na lista";
    return { ...r, error };
  });
};

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

  // Import em massa
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "running" | "done">("upload");
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importProgress, setImportProgress] = useState(0);

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

  // ── Import em massa ────────────────────────────────────────────
  const closeImportDialog = () => {
    if (importStep === "running") return; // não deixa fechar no meio do lote
    setImportDialogOpen(false);
    setImportStep("upload");
    setImportText("");
    setImportRows([]);
    setImportProgress(0);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ""));
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const handleImportContinue = () => {
    const rows = validateImportRows(parseImportText(importText));
    if (rows.length === 0) {
      toast({ title: "Nenhuma linha encontrada", description: "Cole ou envie uma lista com nome e e-mail por linha.", variant: "destructive" });
      return;
    }
    setImportRows(rows);
    setImportStep("preview");
  };

  const updateImportRow = (idx: number, field: "nome" | "email" | "telefone", value: string) => {
    setImportRows((prev) => validateImportRows(prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))));
  };

  const removeImportRow = (idx: number) => {
    setImportRows((prev) => validateImportRows(prev.filter((_, i) => i !== idx)));
  };

  const runImport = async () => {
    if (!orgId) { toast({ title: "Organização ainda carregando", description: "Tente novamente em instantes.", variant: "destructive" }); return; }
    const accessToken = getAccessTokenDirect();
    if (!accessToken) { navigate("/auth"); return; }

    const rows = [...importRows];
    const validIndexes = rows.map((_, i) => i).filter((i) => !rows[i].error);
    setImportStep("running");
    setImportProgress(0);

    let done = 0;
    for (const i of validIndexes) {
      rows[i] = { ...rows[i], status: "creating" };
      setImportRows([...rows]);
      try {
        const resp = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-student`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              nome: rows[i].nome.trim(),
              email: rows[i].email.trim(),
              telefone: rows[i].telefone.trim() || undefined,
              org_id: orgId,
            }),
          }
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || !data?.ok) {
          const code = data?.error || `Erro ${resp.status}`;
          rows[i] = { ...rows[i], status: "error", resultMessage: IMPORT_ERROR_MESSAGES[code] ?? code };
        } else {
          rows[i] = { ...rows[i], status: data.reused_existing_account ? "reused" : "success" };
        }
      } catch (err: any) {
        rows[i] = { ...rows[i], status: "error", resultMessage: err?.message || "Erro de conexão" };
      }
      done++;
      setImportProgress(done);
      setImportRows([...rows]);
    }

    setImportStep("done");
    loadAlunos();
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
          <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm" variant="outline"
            onClick={() => setImportDialogOpen(true)}
            className="rounded-xl h-9 px-4 text-white/70 hover:text-white font-semibold text-sm border-white/10 hover:bg-white/5"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Importar
          </Button>
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

          {/* Import em massa */}
          <Dialog open={importDialogOpen} onOpenChange={(open) => (open ? setImportDialogOpen(true) : closeImportDialog())}>
            <DialogContent className="bg-zinc-950 border-white/8 sm:max-w-2xl max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle className="text-white">Importar clientes em massa</DialogTitle>
                <DialogDescription className="text-white/40">
                  {importStep === "upload" && "Cole uma lista ou envie um arquivo CSV com nome, e-mail e telefone (opcional)."}
                  {importStep === "preview" && "Confira os dados antes de criar as contas — linhas com erro serão ignoradas."}
                  {importStep === "running" && "Criando contas, um instante..."}
                  {importStep === "done" && "Importação concluída."}
                </DialogDescription>
              </DialogHeader>

              {importStep === "upload" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-white/70 mb-2 block">Colar lista</Label>
                    <Textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder={"Nome, Email, Telefone\nJoão Silva, joao@email.com, 11999999999\nMaria Souza, maria@email.com"}
                      rows={7}
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/25 rounded-xl font-mono text-xs resize-none"
                    />
                    <p className="text-[11px] text-white/30 mt-1.5">
                      Cole direto de uma planilha (Excel, Google Sheets) ou digite/cole de um Word, Bloco de Notas etc. —
                      um cliente por linha, com nome, e-mail e telefone (opcional) separados por vírgula. Nome e e-mail
                      são obrigatórios.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/8" />
                    <span className="text-[11px] text-white/30 uppercase tracking-wider">ou</span>
                    <div className="h-px flex-1 bg-white/8" />
                  </div>
                  <label className="flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed border-white/15 text-white/50 hover:text-white/80 hover:border-white/25 cursor-pointer transition-colors text-sm">
                    <FileText className="w-4 h-4" />
                    Enviar arquivo CSV
                    <input type="file" accept=".csv,.txt" className="hidden" onChange={handleImportFile} />
                  </label>
                  <Button
                    onClick={handleImportContinue}
                    disabled={!importText.trim()}
                    className="w-full rounded-xl h-11 text-white font-semibold disabled:opacity-40"
                    style={{ background: "var(--cp-gradient)" }}
                  >
                    Continuar
                  </Button>
                </div>
              )}

              {importStep === "preview" && (() => {
                const invalidCount = importRows.filter((r) => r.error).length;
                const validCount   = importRows.length - invalidCount;
                return (
                  <>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-white/50">{importRows.length} linha{importRows.length !== 1 ? "s" : ""}</span>
                      {invalidCount > 0 && (
                        <span className="flex items-center gap-1" style={{ color: "#fbbf24" }}>
                          <AlertTriangle className="w-3 h-3" /> {invalidCount} com erro (serão ignoradas)
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 -mr-1">
                      {importRows.map((row, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl p-2.5"
                          style={{ backgroundColor: "var(--section-card-bg-2)", border: `1px solid ${row.error ? "rgba(248,113,113,0.35)" : "var(--section-card-border)"}` }}
                        >
                          <div className="grid grid-cols-[1fr_1fr_100px_28px] gap-1.5 items-center">
                            <Input value={row.nome} onChange={(e) => updateImportRow(idx, "nome", e.target.value)}
                              placeholder="Nome" className="bg-white/5 border-white/10 text-white rounded-lg h-8 text-xs px-2" />
                            <Input value={row.email} onChange={(e) => updateImportRow(idx, "email", e.target.value)}
                              placeholder="E-mail" className="bg-white/5 border-white/10 text-white rounded-lg h-8 text-xs px-2" />
                            <Input value={row.telefone} onChange={(e) => updateImportRow(idx, "telefone", e.target.value)}
                              placeholder="Telefone" className="bg-white/5 border-white/10 text-white rounded-lg h-8 text-xs px-2" />
                            <button onClick={() => removeImportRow(idx)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {row.error && <p className="text-[11px] mt-1.5" style={{ color: "#f87171" }}>{row.error}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" onClick={() => setImportStep("upload")}
                        className="rounded-xl h-11 border-white/10 text-white/60 hover:text-white">
                        Voltar
                      </Button>
                      <Button onClick={runImport} disabled={validCount === 0}
                        className="flex-1 rounded-xl h-11 text-white font-semibold disabled:opacity-40"
                        style={{ background: "var(--cp-gradient)" }}>
                        Criar {validCount} cliente{validCount !== 1 ? "s" : ""}
                      </Button>
                    </div>
                  </>
                );
              })()}

              {importStep === "running" && (() => {
                const total = importRows.filter((r) => !r.error).length || 1;
                return (
                  <div className="py-8 flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--cp-400)" }} />
                    <p className="text-white/60 text-sm">{importProgress} de {total} processados...</p>
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--progress-track-bg)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${(importProgress / total) * 100}%`, background: "var(--cp-gradient)" }} />
                    </div>
                  </div>
                );
              })()}

              {importStep === "done" && (() => {
                const successCount = importRows.filter((r) => r.status === "success").length;
                const reusedCount  = importRows.filter((r) => r.status === "reused").length;
                const errorCount   = importRows.filter((r) => r.status === "error" || !!r.error).length;
                return (
                  <>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1.5" style={{ color: "#4ade80" }}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> {successCount} criado{successCount !== 1 ? "s" : ""}
                      </span>
                      {reusedCount > 0 && (
                        <span className="flex items-center gap-1.5 text-white/50">
                          <User className="w-3.5 h-3.5" /> {reusedCount} já existia{reusedCount !== 1 ? "m" : ""}
                        </span>
                      )}
                      {errorCount > 0 && (
                        <span className="flex items-center gap-1.5" style={{ color: "#f87171" }}>
                          <XCircle className="w-3.5 h-3.5" /> {errorCount} com erro
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 -mr-1">
                      {importRows.map((row, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
                          style={{ backgroundColor: "var(--section-card-bg-2)", border: "1px solid var(--section-card-border)" }}>
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{row.nome}</p>
                            <p className="text-xs text-white/40 truncate">{row.email}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            {row.status === "success" && <span className="text-xs font-medium" style={{ color: "#4ade80" }}>Criado</span>}
                            {row.status === "reused" && <span className="text-xs font-medium text-white/50">Já existia</span>}
                            {(row.status === "error" || row.status === "skipped") && (
                              <span className="text-xs font-medium" style={{ color: "#f87171" }}>{row.resultMessage || row.error || "Erro"}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-white/30 text-center">
                      E-mails de boas-vindas com a senha de acesso foram enviados automaticamente pros clientes criados.
                    </p>
                    <Button onClick={closeImportDialog} className="w-full rounded-xl h-11 text-white font-semibold" style={{ background: "var(--cp-gradient)" }}>
                      Concluir
                    </Button>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
          </div>
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
                                <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--foreground) / 0.08)" strokeWidth="3" />
                                <circle
                                  cx="24" cy="24" r={r} fill="none" stroke={ringColor} strokeWidth="3" strokeLinecap="round"
                                  strokeDasharray={`${(done / total) * circ} ${circ}`}
                                />
                              </svg>
                            )}
                            <div
                              className="absolute inset-1 rounded-full flex items-center justify-center text-white font-bold text-sm"
                              style={aluno.ativo ? { background: "var(--cp-gradient)" } : { background: "var(--avatar-inactive-bg)" }}
                            >
                              <span className={aluno.ativo ? "text-white" : ""} style={aluno.ativo ? undefined : { color: "var(--avatar-inactive-text)" }}>{initials}</span>
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
