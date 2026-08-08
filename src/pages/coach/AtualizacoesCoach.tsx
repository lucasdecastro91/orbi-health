import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import {
  Download, ChevronDown, ChevronUp, Loader2,
  User, Calendar, ImageIcon, ClipboardList, Filter, Check,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
interface Arquivo {
  id: string;
  storage_path: string;
  nome_original: string | null;
  mime_type: string | null;
}

interface Valor {
  id: string;
  campo_id: string | null;
  valor_texto: string | null;
  valor_numero: number | null;
  valor_opcoes: string[] | null;
  campo: { label: string; tipo: string; ordem: number; secao_id: string | null } | null;
}

interface Resposta {
  id: string;
  student_id: string;
  submitted_at: string;
  student_nome: string;
  student_avatar: string | null;
  concluida: boolean;
  valores: Valor[];
  arquivos: Arquivo[];
}

// ─── Helpers ──────────────────────────────────────────────────
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const displayValor = (v: Valor): string => {
  if (v.valor_numero != null) return String(v.valor_numero);
  if (v.valor_opcoes?.length) return v.valor_opcoes.join(", ");
  return v.valor_texto ?? "—";
};

// ─── Component ────────────────────────────────────────────────
const AtualizacoesCoach = () => {
  const { orgId } = useTenantContext();
  const { toast } = useToast();

  const [respostas,   setRespostas]   = useState<Resposta[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [filterAluno, setFilterAluno] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => { if (orgId) loadRespostas(); }, [orgId]);

  // ── Load ──────────────────────────────────────────────────────
  const loadRespostas = async () => {
    try {
      const { data, error } = await supabase
        .from("atualizacao_respostas")
        .select(`
          id, student_id, submitted_at, concluida,
          profiles!student_id (nome, avatar_url),
          atualizacao_resposta_valores (
            id, campo_id, valor_texto, valor_numero, valor_opcoes,
            atualizacao_form_campos (label, tipo, ordem, secao_id)
          ),
          atualizacao_resposta_arquivos (id, storage_path, nome_original, mime_type)
        `)
        .eq("org_id", orgId)
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      const mapped: Resposta[] = (data ?? []).map((r: any) => ({
        id: r.id,
        student_id: r.student_id,
        submitted_at: r.submitted_at,
        student_nome: r.profiles?.nome ?? "Aluno",
        student_avatar: r.profiles?.avatar_url ?? null,
        concluida: r.concluida ?? false,
        arquivos: r.atualizacao_resposta_arquivos ?? [],
        valores: (r.atualizacao_resposta_valores ?? [])
          .map((v: any) => ({
            id: v.id,
            campo_id: v.campo_id,
            valor_texto: v.valor_texto,
            valor_numero: v.valor_numero,
            valor_opcoes: v.valor_opcoes,
            campo: v.atualizacao_form_campos ?? null,
          }))
          .sort((a: Valor, b: Valor) => (a.campo?.ordem ?? 0) - (b.campo?.ordem ?? 0)),
      }));

      setRespostas(mapped);
    } catch (e: any) {
      toast({ title: "Erro ao carregar atualizações", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Marcar como concluída ─────────────────────────────────────
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const toggleConcluida = async (resp: Resposta) => {
    setTogglingId(resp.id);
    try {
      const { error } = await supabase
        .from("atualizacao_respostas")
        .update({ concluida: !resp.concluida })
        .eq("id", resp.id);
      if (error) throw error;
      setRespostas((rs) => rs.map((r) => r.id === resp.id ? { ...r, concluida: !resp.concluida } : r));
    } catch (e: any) {
      toast({ title: "Erro ao atualizar status", description: e.message, variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  // ── Download foto individual ─────────────────────────────────
  const downloadFoto = async (arq: Arquivo) => {
    setDownloading(arq.id);
    try {
      const { data, error } = await supabase.storage
        .from("atualizacoes")
        .createSignedUrl(arq.storage_path, 3600);
      if (error) throw error;
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = arq.nome_original ?? "foto.jpg";
      a.target = "_blank";
      a.click();
    } catch (e: any) {
      toast({ title: "Erro ao baixar foto", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  // ── Download todas as fotos de uma resposta ──────────────────
  const downloadAll = async (resp: Resposta) => {
    if (!resp.arquivos.length) return;
    for (const arq of resp.arquivos) {
      await downloadFoto(arq);
      await new Promise(r => setTimeout(r, 300)); // pequeno delay entre downloads
    }
  };

  // ── Signed URL para preview ───────────────────────────────────
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const loadPreviews = async (arquivos: Arquivo[]) => {
    for (const arq of arquivos) {
      if (previewUrls[arq.id]) continue;
      if (!arq.mime_type?.startsWith("image/")) continue;
      const { data } = await supabase.storage.from("atualizacoes").createSignedUrl(arq.storage_path, 3600);
      if (data?.signedUrl) setPreviewUrls(p => ({ ...p, [arq.id]: data.signedUrl }));
    }
  };

  const toggleExpand = (id: string, arquivos: Arquivo[]) => {
    setExpanded(e => {
      const next = e === id ? null : id;
      if (next) loadPreviews(arquivos);
      return next;
    });
  };

  // ── Filtro ────────────────────────────────────────────────────
  const filtered = respostas.filter(r =>
    !filterAluno || r.student_nome.toLowerCase().includes(filterAluno.toLowerCase())
  );

  // ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-white/30" />
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <ClipboardList className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
        <h1 className="text-lg font-bold text-white">Atualizações</h1>
        <span
          className="ml-auto text-xs px-2.5 py-0.5 rounded-full"
          style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
        >
          {respostas.length} envio{respostas.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Filtro */}
      <div className="relative">
        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          value={filterAluno}
          onChange={e => setFilterAluno(e.target.value)}
          placeholder="Filtrar por aluno..."
          className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-500/40"
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 space-y-2">
          <ClipboardList className="w-10 h-10 mx-auto text-white/15" />
          <p className="text-sm text-white/40">Nenhuma atualização recebida ainda.</p>
        </div>
      )}

      {/* Lista */}
      {filtered.map(resp => {
        const isOpen = expanded === resp.id;
        const nFotos = resp.arquivos.length;

        return (
          <div
            key={resp.id}
            className="rounded-2xl border overflow-hidden"
            style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-1)" }}
          >
            {/* Row header */}
            <div className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/3 transition-colors">
              <button
                onClick={() => toggleExpand(resp.id, resp.arquivos)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                  style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
                >
                  {resp.student_nome[0]?.toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{resp.student_nome}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Calendar className="w-3 h-3 text-white/30" />
                    <span className="text-xs text-white/40">{fmtDate(resp.submitted_at)}</span>
                    {nFotos > 0 && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: "var(--cp-400)", opacity: 0.7 }}>
                        <ImageIcon className="w-3 h-3" /> {nFotos} foto{nFotos !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
                }
              </button>

              <button
                onClick={() => toggleConcluida(resp)}
                disabled={togglingId === resp.id}
                title={resp.concluida ? "Marcar como pendente" : "Marcar como concluída"}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 h-7 rounded-lg shrink-0 transition-colors disabled:opacity-40"
                style={resp.concluida
                  ? { backgroundColor: "rgba(74,222,128,0.12)", color: "#4ade80" }
                  : { backgroundColor: "rgba(251,191,36,0.12)", color: "rgb(251,191,36)" }}
              >
                {togglingId === resp.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : resp.concluida ? <Check className="w-3 h-3" /> : null}
                {resp.concluida ? "Concluída" : "Pendente"}
              </button>
            </div>

            {/* Conteúdo expandido */}
            {isOpen && (
              <div className="border-t px-4 py-4 space-y-5" style={{ borderColor: "rgba(255,255,255,0.05)" }}>

                {/* Fotos */}
                {nFotos > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Fotos</p>
                      <button
                        onClick={() => downloadAll(resp)}
                        className="flex items-center gap-1.5 text-xs px-3 h-7 rounded-lg transition-colors"
                        style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}
                      >
                        <Download className="w-3 h-3" /> Baixar todas
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {resp.arquivos.map(arq => (
                        <div
                          key={arq.id}
                          className="relative rounded-xl overflow-hidden group"
                          style={{ backgroundColor: "rgba(255,255,255,0.05)", aspectRatio: "1" }}
                        >
                          {previewUrls[arq.id] ? (
                            <img src={previewUrls[arq.id]} alt={arq.nome_original ?? ""} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-5 h-5 text-white/20" />
                            </div>
                          )}
                          <button
                            onClick={() => downloadFoto(arq)}
                            disabled={downloading === arq.id}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                          >
                            {downloading === arq.id
                              ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                              : <Download className="w-5 h-5 text-white" />
                            }
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Respostas */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Respostas</p>
                  {resp.valores.map(v => (
                    <div key={v.id}>
                      <p className="text-xs text-white/45 mb-1 leading-snug">{v.campo?.label ?? "Campo removido"}</p>
                      <p className="text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
                        {displayValor(v)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default AtualizacoesCoach;
