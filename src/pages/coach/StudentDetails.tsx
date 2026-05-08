import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Utensils, Dumbbell, FileText, MessageSquare, Weight, ClipboardList, Star, ChevronDown, ChevronUp, Image as ImageIcon, TrendingUp, TrendingDown, Minus, Plus, Loader2 as Spinner, Sparkles, RefreshCw, ClipboardCheck, AlertCircle, Camera, X as XIcon, ChevronLeft as ChevLeft, ChevronRight as ChevRight } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import TrainingPlanManager from "./TrainingPlanManager";
import DietManager from "./DietManager";
import UpdateFormManager from "./UpdateFormManager";
import FeedbackManager from "@/components/coach/FeedbackManager";
import { useTenantContext } from "@/contexts/TenantContext";

interface StudentData {
  id: string;
  user_id: string;
  observacoes: string | null;
  profiles: { nome: string };
}

type TabKey = "treinos" | "dieta" | "checkins" | "evolucao" | "anamnese" | "formulario" | "feedbacks";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "treinos",    label: "Treinos",    icon: Dumbbell        },
  { key: "dieta",      label: "Dieta",      icon: Utensils        },
  { key: "checkins",   label: "Check-ins",  icon: ClipboardList   },
  { key: "evolucao",   label: "Evolução",   icon: TrendingUp      },
  { key: "anamnese",   label: "Anamnese",   icon: ClipboardCheck  },
  { key: "formulario", label: "Formulário", icon: FileText        },
  { key: "feedbacks",  label: "Feedbacks",  icon: MessageSquare   },
];

// ── Photo slot constants ───────────────────────────────────────────
const PHOTO_SLOTS = [
  { key: "front",      label: "Frente"  },
  { key: "side_left",  label: "Lado E." },
  { key: "side_right", label: "Lado D." },
  { key: "back",       label: "Costas"  },
  { key: "free",       label: "Livre"   },
] as const;
const BUCKET = "evolution-photos";

// ── Evolução de peso viewer ────────────────────────────────────────
const EvolucaoViewer = ({ studentUserId }: { studentUserId: string }) => {
  const { toast } = useToast();
  const { orgId } = useTenantContext();
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [peso,      setPeso]      = useState("");
  const [data,      setData]      = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving,    setSaving]    = useState(false);

  // Photos
  const [photos,      setPhotos]      = useState<any[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => { load(); }, [studentUserId]);

  const load = async () => {
    setLoading(true);
    try {
      const [weightRes, photoRes] = await Promise.all([
        supabase
          .from("registros_evolucao")
          .select("*")
          .eq("student_id", studentUserId)
          .order("data_registro", { ascending: false }),
        supabase
          .from("evolution_photos")
          .select("id, slot, storage_path, taken_at")
          .eq("student_id", studentUserId)
          .order("taken_at", { ascending: false }),
      ]);
      if (weightRes.error) throw weightRes.error;
      setRegistros(weightRes.data ?? []);
      if (!photoRes.error && photoRes.data) {
        setPhotos(photoRes.data.map((p: any) => ({
          ...p,
          url: supabase.storage.from(BUCKET).getPublicUrl(p.storage_path).data.publicUrl,
        })));
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar evolução", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peso) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("registros_evolucao").upsert({
        student_id: studentUserId,
        org_id: orgId,
        data_registro: data,
        peso_kg: Number(peso),
      }, { onConflict: "student_id,data_registro" });
      if (error) throw error;
      toast({ title: "Registro adicionado!" });
      setPeso("");
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const sorted = [...registros].filter(r => r.peso_kg != null).sort((a, b) => a.data_registro.localeCompare(b.data_registro));
  const pesoInicial = sorted[0]?.peso_kg ?? null;
  const pesoAtual   = sorted[sorted.length - 1]?.peso_kg ?? null;
  const variacao    = pesoInicial != null && pesoAtual != null ? pesoAtual - pesoInicial : null;
  const chartData   = sorted.slice(-30).map(r => ({ date: format(parseISO(r.data_registro), "dd/MM", { locale: ptBR }), peso: r.peso_kg }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-white/10 px-3 py-2" style={{ backgroundColor: "#1a1a1d" }}>
        <p className="text-[11px] text-white/40">{label}</p>
        <p className="text-sm font-bold text-green-500">{payload[0].value} kg</p>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Stats */}
      {sorted.length >= 2 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Peso inicial", value: pesoInicial != null ? `${pesoInicial} kg` : "—" },
            { label: "Peso atual",   value: pesoAtual   != null ? `${pesoAtual} kg`   : "—" },
            {
              label: "Variação",
              value: variacao != null ? `${variacao > 0 ? "+" : ""}${variacao.toFixed(1)} kg` : "—",
              color: variacao == null ? undefined : variacao < 0 ? "var(--cp-400)" : variacao > 0 ? "hsl(0 70% 55%)" : undefined,
            },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/8 px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
              <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">{s.label}</p>
              <p className="text-base font-bold" style={{ color: s.color ?? "#fff" }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {chartData.length >= 2 && (
        <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Gráfico de evolução</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis domain={["auto", "auto"]} tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="peso" stroke="var(--cp-500)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--cp-500)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Manual add */}
      <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
        <p className="text-xs font-semibold text-foreground/40 uppercase tracking-wider mb-3">Adicionar registro</p>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-foreground/40 uppercase tracking-wider mb-1.5 block">Peso (kg)</label>
              <input type="number" step="0.1" value={peso} onChange={e => setPeso(e.target.value)} placeholder="72.5" className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-green-600/50 transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <label className="text-[11px] text-foreground/40 uppercase tracking-wider mb-1.5 block">Data</label>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-foreground focus:outline-none focus:border-green-600/50 transition-colors" />
            </div>
          </div>
          <button type="submit" disabled={saving || !peso} className="h-10 px-5 rounded-xl text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50" style={{ background: "var(--cp-gradient)" }}>
            {saving ? <Spinner className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar
          </button>
        </form>
      </div>

      {/* History list */}
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-white/30 justify-center"><Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando...</span></div>
      ) : registros.length === 0 ? (
        <div className="rounded-2xl border border-white/8 py-10 text-center" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
          <p className="text-white/30 text-sm">Nenhum registro de peso ainda.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/8 overflow-hidden">
          {registros.slice(0, 20).map((r, idx) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: idx < Math.min(registros.length, 20) - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <span className="text-sm text-white/60">{format(parseISO(r.data_registro), "dd 'de' MMMM yyyy", { locale: ptBR })}</span>
              <span className="text-base font-bold text-green-500">{r.peso_kg} kg</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Photo gallery ── */}
      {(() => {
        if (photos.length === 0) {
          return (
            <div className="rounded-2xl border border-white/8 py-8 text-center" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
              <Camera className="w-7 h-7 text-white/10 mx-auto mb-2" />
              <p className="text-white/25 text-sm">Nenhuma foto de evolução ainda</p>
            </div>
          );
        }

        // Group by date
        const byDate: Record<string, any[]> = {};
        for (const p of photos) {
          if (!byDate[p.taken_at]) byDate[p.taken_at] = [];
          byDate[p.taken_at].push(p);
        }
        const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
        const flat  = dates.flatMap((d) => byDate[d]);

        return (
          <>
            {/* Lightbox */}
            {lightboxIdx !== null && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center"
                style={{ backgroundColor: "rgba(0,0,0,0.92)" }}
                onClick={() => setLightboxIdx(null)}
              >
                <div className="relative w-full max-w-md px-4" onClick={(e) => e.stopPropagation()}>
                  <img src={flat[lightboxIdx].url} alt="" className="w-full rounded-2xl object-contain max-h-[75vh]" />
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-sm text-white/50">
                      {PHOTO_SLOTS.find((s) => s.key === flat[lightboxIdx].slot)?.label} — {format(parseISO(flat[lightboxIdx].taken_at), "dd/MM/yyyy")}
                    </p>
                    <button onClick={() => setLightboxIdx(null)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
                      <XIcon className="w-4 h-4 text-white/70" />
                    </button>
                  </div>
                  {flat.length > 1 && (
                    <>
                      <button onClick={() => setLightboxIdx((i) => Math.max(0, (i ?? 0) - 1))} disabled={lightboxIdx === 0} className="absolute left-6 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                        <ChevLeft className="w-5 h-5 text-white" />
                      </button>
                      <button onClick={() => setLightboxIdx((i) => Math.min(flat.length - 1, (i ?? 0) + 1))} disabled={lightboxIdx === flat.length - 1} className="absolute right-6 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-30" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
                        <ChevRight className="w-5 h-5 text-white" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Fotos de evolução</p>
              {dates.map((date) => (
                <div key={date}>
                  <p className="text-[11px] text-white/30 uppercase tracking-wider mb-2">
                    {format(parseISO(date), "dd 'de' MMMM yyyy", { locale: ptBR })}
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {PHOTO_SLOTS.map(({ key, label }) => {
                      const photo = byDate[date]?.find((p) => p.slot === key);
                      if (!photo) {
                        return (
                          <div key={key} className="flex flex-col items-center gap-1">
                            <div className="w-full aspect-square rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.07)" }} />
                            <span className="text-[9px] text-white/20">{label}</span>
                          </div>
                        );
                      }
                      const flatIdx = flat.indexOf(photo);
                      return (
                        <div key={key} className="flex flex-col items-center gap-1">
                          <button onClick={() => setLightboxIdx(flatIdx)} className="w-full aspect-square rounded-xl overflow-hidden">
                            <img src={photo.url} alt={label} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                          </button>
                          <span className="text-[9px] text-white/35">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
};

// ── Anamnese viewer ────────────────────────────────────────────────
const AnamneseViewer = ({ studentUserId }: { studentUserId: string }) => {
  const { toast } = useToast();
  const { orgId } = useTenantContext();
  const [data,       setData]       = useState<any | null>(null);
  const [template,   setTemplate]   = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => { load(); }, [studentUserId]);

  const load = async () => {
    setLoading(true);
    try {
      const [anamneseRes, templateRes] = await Promise.all([
        supabase.from("anamneses").select("*").eq("student_id", studentUserId).maybeSingle(),
        orgId
          ? supabase.from("anamnese_templates").select("perguntas").eq("org_id", orgId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setData(anamneseRes.data ?? null);
      setTemplate((templateRes as any)?.data?.perguntas ?? []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar anamnese", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const requestNew = async () => {
    if (!data) return;
    setRequesting(true);
    try {
      const { error } = await supabase
        .from("anamneses")
        .update({ pendente: true })
        .eq("id", data.id);
      if (error) throw error;

      // Notifica o aluno
      await supabase.from("notificacoes").insert({
        user_id:  studentUserId,
        org_id:   orgId,
        titulo:   "Seu treinador solicitou uma nova anamnese",
        mensagem: "Acesse a seção de Anamnese e atualize suas informações.",
        tipo:     "anamnese",
      });

      setData((d: any) => ({ ...d, pendente: true }));
      toast({ title: "Solicitação enviada!", description: "O aluno será notificado para atualizar a anamnese." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setRequesting(false); }
  };

  // Solicitar preenchimento quando não existe anamnese
  const requestFirst = async () => {
    setRequesting(true);
    try {
      await supabase.from("notificacoes").insert({
        user_id:  studentUserId,
        org_id:   orgId,
        titulo:   "Seu treinador solicitou o preenchimento da anamnese",
        mensagem: "Acesse a seção Anamnese no app para preencher sua ficha.",
        tipo:     "anamnese",
      });
      toast({ title: "Solicitação enviada!", description: "O aluno foi notificado para preencher a anamnese." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setRequesting(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-14 gap-2 text-white/25">
      <Spinner className="w-4 h-4 animate-spin" /><span className="text-sm">Carregando anamnese...</span>
    </div>
  );

  if (!data) return (
    <div className="rounded-2xl border border-white/8 py-14 flex flex-col items-center gap-4 text-center" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)" }}>
        <ClipboardCheck className="w-6 h-6 text-green-500/50" />
      </div>
      <div>
        <p className="text-white/50 font-medium text-sm">Anamnese não preenchida</p>
        <p className="text-white/25 text-xs mt-1 max-w-xs">O aluno ainda não preencheu a ficha de anamnese.</p>
      </div>
      <button
        onClick={requestFirst}
        disabled={requesting}
        className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50"
        style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)", color: "var(--cp-400)" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(var(--cp-rgb),0.2)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(var(--cp-rgb),0.12)"; }}
      >
        {requesting ? <Spinner className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
        Solicitar preenchimento
      </button>
    </div>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-2xl border border-white/8 p-4" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
      <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-3">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </div>
  );

  const Field = ({ label, value }: { label: string; value: string | number | null | undefined }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex gap-3">
        <span className="text-xs text-white/35 shrink-0 w-44">{label}</span>
        <span className="text-xs text-white/75 leading-relaxed flex-1">{String(value)}</span>
      </div>
    );
  };

  const ArrayField = ({ label, value }: { label: string; value: string[] | null | undefined }) => {
    if (!value || !Array.isArray(value) || value.length === 0) return null;
    return (
      <div className="flex gap-3">
        <span className="text-xs text-white/35 shrink-0 w-44">{label}</span>
        <div className="flex flex-wrap gap-1.5 flex-1">
          {value.map((v) => (
            <span key={v} className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)" }}>
              {v}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {data.pendente && (
        <div className="rounded-2xl border px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "rgba(var(--cp-rgb),0.06)", borderColor: "rgba(var(--cp-rgb),0.2)" }}>
          <AlertCircle className="w-4 h-4 text-green-500 shrink-0" />
          <p className="text-sm text-green-500/80">Atualização solicitada — aguardando resposta do aluno.</p>
        </div>
      )}

      {/* Header + request button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-white/35">
          Preenchida em {format(parseISO(data.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          {data.updated_at !== data.created_at && ` · Atualizada em ${format(parseISO(data.updated_at), "dd/MM/yyyy", { locale: ptBR })}`}
        </p>
        {!data.pendente && (
          <button
            onClick={requestNew}
            disabled={requesting}
            className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)", color: "var(--cp-400)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(var(--cp-rgb),0.18)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(var(--cp-rgb),0.1)"; }}
          >
            {requesting ? <Spinner className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Solicitar nova anamnese
          </button>
        )}
      </div>

      {/* Etapa 1 — Dados pessoais */}
      <Section title="Dados pessoais">
        <Field label="Nome completo"  value={data.nome_completo} />
        <Field label="Idade"          value={data.idade ? `${data.idade} anos` : null} />
        <Field label="Altura"         value={data.altura} />
        <Field label="Peso atual"     value={data.peso_atual ? `${data.peso_atual} kg` : null} />
        <Field label="WhatsApp"       value={data.whatsapp} />
        <Field label="Sexo"           value={data.sexo} />
      </Section>

      {/* Etapa 2 — Objetivo */}
      <Section title="Objetivo e atividade física">
        <Field label="Objetivo principal"      value={data.objetivo} />
        <Field label="Pratica atividade física" value={data.pratica_atividade} />
        <Field label="Há quanto tempo"         value={data.tempo_pratica} />
        <Field label="Frequência semanal"      value={data.frequencia_treino_opcao} />
        <Field label="Tempo por sessão"        value={data.tempo_por_sessao} />
      </Section>

      {/* Etapa 3 — Saúde */}
      <Section title="Saúde">
        <ArrayField label="Condições de saúde"  value={data.condicoes_saude} />
        <Field label="Lesões / cirurgias"        value={data.lesoes_cirurgias} />
        <Field label="Medicações"               value={data.medicamentos} />
        <Field label="Dor ao exercitar"          value={data.desconforto_dor} />
      </Section>

      {/* Etapa 4 — Alimentação */}
      <Section title="Alimentação">
        <Field label="Restrições / alergias"   value={data.restricoes_alimentares} />
        <Field label="Qualidade alimentar"     value={data.qualidade_alimentacao} />
        <Field label="Suplementos"             value={data.suplementos} />
        <Field label="Álcool"                  value={data.alcool} />
      </Section>

      {/* Etapa 5 — Hábitos */}
      <Section title="Hábitos">
        <Field label="Sono"                    value={data.sono} />
        <Field label="Nível de estresse"        value={data.estresse} />
        {data.observacoes && (
          <div className="pt-1 border-t border-white/6">
            <p className="text-[11px] text-white/30 uppercase tracking-wider mb-1.5">Observações</p>
            <p className="text-xs text-white/65 leading-relaxed">{data.observacoes}</p>
          </div>
        )}
      </Section>

      {/* Etapa 6 — Perguntas do treinador */}
      {template.length > 0 && data.respostas_extras && Object.keys(data.respostas_extras).length > 0 && (
        <Section title="Perguntas personalizadas">
          {template.map((p: any) => (
            <Field key={p.id} label={p.texto} value={data.respostas_extras?.[p.id]} />
          ))}
        </Section>
      )}
    </div>
  );
};

// ── Check-in types ─────────────────────────────────────────────────
interface CheckInRecord {
  id: string;
  weight: number | null;
  fotos: string[] | null;
  treino_avaliacao: number | null;
  treino_obs: string | null;
  dieta_avaliacao: number | null;
  dieta_obs: string | null;
  aderencia: number | null;
  obs_geral: string | null;
  relatorio_ia: string | null;
  relatorio_gerado_em: string | null;
  relatorio_visualizado: boolean | null;
  created_at: string;
}

const ratingLabel = (v: number) =>
  ["", "Péssimo", "Ruim", "Regular", "Bom", "Excelente"][v] ?? "";

const StarDisplay = ({ value, color }: { value: number | null; color: string }) => {
  if (!value) return <span className="text-xs text-white/25">—</span>;
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className="w-3.5 h-3.5"
          style={{ color: n <= value ? color : "rgba(255,255,255,0.12)", fill: n <= value ? color : "none" }}
        />
      ))}
      <span className="text-xs ml-1" style={{ color }}>{ratingLabel(value)}</span>
    </div>
  );
};

// ── Check-ins viewer ───────────────────────────────────────────────
const CheckInsViewer = ({ studentUserId }: { studentUserId: string }) => {
  const { toast } = useToast();
  const [checkins,          setCheckins]          = useState<CheckInRecord[]>([]);
  const [loading,           setLoading]           = useState(true);
  const [expanded,          setExpanded]          = useState<string | null>(null);
  const [generatingReport,  setGeneratingReport]  = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("check_ins")
          .select("*")
          .eq("student_id", studentUserId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        setCheckins(data as CheckInRecord[]);
      } catch (err: any) {
        toast({ title: "Erro ao carregar check-ins", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [studentUserId]);

  const generateReport = async (ciId: string) => {
    setGeneratingReport(ciId);
    try {
      const res = await supabase.functions.invoke("analisar-checkin", {
        body: { check_in_id: ciId },
      });
      if (res.error) throw new Error(res.error.message);

      // Re-fetch the updated record to get relatorio_ia
      const { data: updated } = await supabase
        .from("check_ins")
        .select("relatorio_ia, relatorio_gerado_em, relatorio_visualizado")
        .eq("id", ciId)
        .single();

      if (updated) {
        setCheckins((prev) =>
          prev.map((c) => (c.id === ciId ? { ...c, ...updated } : c))
        );
      }
      toast({ title: "Análise gerada com sucesso!" });
    } catch (err: any) {
      toast({ title: "Erro ao gerar análise", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingReport(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-white/30">
        <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
        <span className="text-sm">Carregando check-ins...</span>
      </div>
    );
  }

  if (checkins.length === 0) {
    return (
      <div className="rounded-2xl border border-white/8 bg-white/2 py-14 flex flex-col items-center gap-3 text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)" }}>
          <ClipboardList className="w-6 h-6 text-green-500/50" />
        </div>
        <p className="text-white/50 font-medium text-sm">Nenhum check-in enviado ainda</p>
        <p className="text-white/25 text-xs max-w-xs">Quando o aluno fizer um check-in, ele aparecerá aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {checkins.map((ci) => {
        const isOpen = expanded === ci.id;
        const date   = new Date(ci.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
        const hasPhotos = ci.fotos && ci.fotos.length > 0;

        return (
          <div key={ci.id} className="rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
            {/* Header row */}
            <button
              onClick={() => setExpanded(isOpen ? null : ci.id)}
              className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-white/3 transition-colors"
            >
              {/* Date */}
              <div className="text-left shrink-0">
                <p className="text-xs font-semibold text-white/70">{date}</p>
              </div>

              {/* Quick stats */}
              <div className="flex-1 flex items-center gap-4 flex-wrap">
                {ci.weight && (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--cp-400)" }}>
                    <Weight className="w-3 h-3" />
                    {ci.weight} kg
                  </span>
                )}
                {ci.treino_avaliacao && (
                  <span className="text-xs text-white/45 flex items-center gap-1">
                    <Dumbbell className="w-3 h-3" />
                    {ci.treino_avaliacao}/5
                  </span>
                )}
                {ci.dieta_avaliacao && (
                  <span className="text-xs text-white/45 flex items-center gap-1">
                    <Utensils className="w-3 h-3" />
                    {ci.dieta_avaliacao}/5
                  </span>
                )}
                {ci.aderencia && (
                  <span className="text-xs text-white/45 flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {ci.aderencia}/5
                  </span>
                )}
                {hasPhotos && (
                  <span className="text-xs text-white/30 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />
                    {ci.fotos!.length} foto{ci.fotos!.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {isOpen
                ? <ChevronUp className="w-4 h-4 text-white/30 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-white/30 shrink-0" />
              }
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-white/6 pt-4">
                {/* Fotos */}
                {hasPhotos && (
                  <div>
                    <p className="text-[11px] text-white/35 uppercase tracking-wider mb-2">Fotos</p>
                    <div className="flex flex-wrap gap-2">
                      {ci.fotos!.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt={`foto ${i + 1}`} className="w-20 h-20 rounded-xl object-cover border border-white/8 hover:opacity-90 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Treino */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Dumbbell className="w-3 h-3" />Treino
                    </p>
                    <StarDisplay value={ci.treino_avaliacao} color="hsl(217 91% 65%)" />
                    {ci.treino_obs && <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{ci.treino_obs}</p>}
                  </div>
                  <div>
                    <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Utensils className="w-3 h-3" />Alimentação
                    </p>
                    <StarDisplay value={ci.dieta_avaliacao} color="var(--cp-400)" />
                    {ci.dieta_obs && <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{ci.dieta_obs}</p>}
                  </div>
                </div>

                {/* Aderência */}
                <div>
                  <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Star className="w-3 h-3" />Aderência geral
                  </p>
                  <StarDisplay value={ci.aderencia} color="hsl(280 65% 65%)" />
                  {ci.obs_geral && <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{ci.obs_geral}</p>}
                </div>

                {/* IA Report */}
                <div
                  className="rounded-2xl border p-4"
                  style={{
                    backgroundColor: "rgba(var(--cp-rgb),0.03)",
                    borderColor: ci.relatorio_ia ? "rgba(var(--cp-rgb),0.18)" : "rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 font-semibold"
                       style={{ color: ci.relatorio_ia ? "var(--cp-400)" : "rgba(255,255,255,0.35)" }}>
                      <Sparkles className="w-3 h-3" />
                      Análise IA
                    </p>
                    <button
                      onClick={() => generateReport(ci.id)}
                      disabled={generatingReport === ci.id}
                      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                      style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)", color: "var(--cp-400)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(var(--cp-rgb),0.2)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(var(--cp-rgb),0.12)"; }}
                    >
                      {generatingReport === ci.id ? (
                        <><Spinner className="w-3 h-3 animate-spin" />Gerando...</>
                      ) : ci.relatorio_ia ? (
                        <><RefreshCw className="w-3 h-3" />Regenerar</>
                      ) : (
                        <><Sparkles className="w-3 h-3" />Gerar análise</>
                      )}
                    </button>
                  </div>

                  {generatingReport === ci.id ? (
                    <div className="flex items-center gap-2 py-3 text-white/30">
                      <Spinner className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Analisando check-in com IA...</span>
                    </div>
                  ) : ci.relatorio_ia ? (
                    <>
                      <p className="text-sm text-white/75 leading-relaxed whitespace-pre-line">{ci.relatorio_ia}</p>
                      {ci.relatorio_gerado_em && (
                        <p className="text-[10px] text-white/20 mt-3">
                          Gerado em {format(parseISO(ci.relatorio_gerado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-white/25 py-1">
                      Clique em "Gerar análise" para obter um relatório personalizado com base nos dados deste check-in.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Sidebar color — keeps header band consistent with sidebar
const BAND_BG = "#0f0f11";

const StudentDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();

  const [student,       setStudent]       = useState<StudentData | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [activeTab,     setActiveTab]     = useState<TabKey>("treinos");
  const [studentWeight, setStudentWeight] = useState<number | null>(null);

  useEffect(() => {
    checkAuth();
    if (id) loadStudentData();
  }, [id]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    const { data: profile } = await supabase
      .from("profiles").select("tipo_usuario").eq("id", session.user.id).single();
    if (profile?.tipo_usuario !== "treinador") navigate(`/${slug}/aluno`);
  };

  const loadStudentData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data, error } = await supabase
        .from("alunos")
        .select("id, user_id, observacoes, profiles!alunos_user_id_fkey(nome)")
        .eq("id", id)
        .eq("treinador_id", session.user.id)
        .single();
      if (error) throw error;
      setStudent(data as StudentData);
      // Busca peso do último check-in
      loadWeight((data as StudentData).user_id);
    } catch (err: any) {
      toast({ title: "Erro ao carregar dados do aluno", description: err.message, variant: "destructive" });
      navigate(`/${slug}/treinador`);
    } finally {
      setLoading(false);
    }
  };

  const loadWeight = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("check_ins")
        .select("weight")
        .eq("student_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.weight) setStudentWeight(data.weight);
    } catch {}
  };

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-green-600/30 border-t-green-600 animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Aluno não encontrado</p>
      </div>
    );
  }

  const initials = student.profiles.nome
    .split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-background">

      {/* ══════════════════════════════════════════════════════
          HEADER — dark band (sempre escuro, como a sidebar)
      ══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-30" style={{ backgroundColor: BAND_BG }}>

        {/* Identity strip */}
        <div className="px-6 lg:px-8 pt-4 pb-4 flex items-center gap-4">

          {/* Voltar */}
          <button
            onClick={() => navigate(`/${slug}/treinador`)}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0"
            style={{ color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.5)")}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Avatar */}
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base text-white shrink-0"
            style={{ background: "var(--cp-gradient)", boxShadow: "0 0 0 3px rgba(var(--cp-rgb),0.2)" }}
          >
            {initials || <User className="w-5 h-5" />}
          </div>

          {/* Name + badges */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight" style={{ color: "#ffffff" }}>
              {student.profiles.nome}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Badge aluno */}
              <span
                className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
              >
                Aluno
              </span>
              {/* Badge peso */}
              {studentWeight && (
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"
                  style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)", color: "var(--cp-400)" }}
                >
                  <Weight className="w-3 h-3" />
                  {studentWeight} kg
                </span>
              )}
              {/* Observações */}
              {student.observacoes && (
                <span
                  className="text-[11px] truncate max-w-[200px]"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {student.observacoes}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar — still on the dark band, underline marks the page break */}
        <div
          className="px-6 lg:px-8 flex gap-0 overflow-x-auto scrollbar-none"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors"
                style={{
                  color: active ? "#ffffff" : "rgba(255,255,255,0.45)",
                  borderBottomColor: active ? "var(--cp-500)" : "transparent",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.75)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)"; }}
              >
                <tab.icon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: active ? "var(--cp-500)" : undefined }}
                />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CONTEÚDO DA TAB
      ══════════════════════════════════════════════════════ */}
      <div className="px-6 lg:px-8 py-6 max-w-5xl">

        {activeTab === "treinos" && <TrainingPlanManager studentId={id!} />}

        {activeTab === "dieta" && (
          <DietManager
            studentId={id!}
            studentUserId={student.user_id}
            orgId={orgId}
          />
        )}

        {activeTab === "checkins" && <CheckInsViewer studentUserId={student.user_id} />}

        {activeTab === "evolucao" && <EvolucaoViewer studentUserId={student.user_id} />}

        {activeTab === "anamnese" && <AnamneseViewer studentUserId={student.user_id} />}

        {activeTab === "formulario" && <UpdateFormManager studentId={id!} />}

        {activeTab === "feedbacks" && <FeedbackManager studentId={id!} />}

      </div>
    </div>
  );
};

export default StudentDetails;
