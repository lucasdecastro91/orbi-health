import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  User, Target, Heart, Utensils, Moon, MessageSquare,
  ChevronRight, ChevronLeft, Check, Loader2, Upload, X as XIcon,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────
type TipoCampo = "text" | "textarea" | "number" | "radio" | "checkbox" | "file";

interface CampoTemplate {
  id:             string;
  tipo:           TipoCampo;
  label:          string;
  obrigatorio:    boolean;
  opcoes:         { label: string; value: string }[] | null;
  configMultiple: boolean | null;
  configAccept:   string | null;
  ordem:          number;
}

interface SecaoTemplate {
  id:     string;
  titulo: string;
  ordem:  number;
  campos: CampoTemplate[];
}

interface FormData {
  nome_completo: string; idade: string; altura: string; peso_atual: string;
  whatsapp: string; sexo: string; objetivo: string; pratica_atividade: string;
  tempo_pratica: string; frequencia_treino_opcao: string; tempo_por_sessao: string;
  condicoes_saude: string[]; lesoes_cirurgias: string; medicamentos: string;
  desconforto_dor: string; restricoes_alimentares: string; qualidade_alimentacao: string;
  suplementos: string; alcool: string; sono: string; estresse: string; observacoes: string;
}

const EMPTY: FormData = {
  nome_completo: "", idade: "", altura: "", peso_atual: "", whatsapp: "", sexo: "",
  objetivo: "", pratica_atividade: "", tempo_pratica: "", frequencia_treino_opcao: "", tempo_por_sessao: "",
  condicoes_saude: [], lesoes_cirurgias: "", medicamentos: "", desconforto_dor: "",
  restricoes_alimentares: "", qualidade_alimentacao: "", suplementos: "", alcool: "",
  sono: "", estresse: "", observacoes: "",
};

const STEPS_CONFIG = [
  { id: 1, label: "Dados pessoais",         icon: User,          color: "var(--cp-500)"    },
  { id: 2, label: "Objetivo e atividade",   icon: Target,        color: "hsl(217 91% 65%)" },
  { id: 3, label: "Saúde",                  icon: Heart,         color: "hsl(0 70% 55%)"   },
  { id: 4, label: "Alimentação",            icon: Utensils,      color: "var(--cp-400)"    },
  { id: 5, label: "Hábitos",                icon: Moon,          color: "hsl(280 65% 60%)" },
  { id: 6, label: "Perguntas do treinador", icon: MessageSquare, color: "hsl(var(--primary))" },
];

const CAMPOS_PER_PAGE = 5;

// ── Helpers ────────────────────────────────────────────────────
const OptionBtn = ({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick}
    className="px-3 py-2 rounded-xl text-sm font-medium text-left transition-all"
    style={{
      backgroundColor: active ? "rgba(var(--cp-rgb),0.15)" : "rgba(255,255,255,0.04)",
      border: `1.5px solid ${active ? "var(--cp-500)" : "rgba(255,255,255,0.08)"}`,
      color: active ? "var(--cp-400)" : "rgba(255,255,255,0.6)",
    }}>
    {value}
  </button>
);

const MultiBtn = ({ value, active, onClick }: { value: string; active: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick}
    className="px-3 py-2 rounded-xl text-sm font-medium text-left transition-all flex items-center gap-2"
    style={{
      backgroundColor: active ? "rgba(var(--cp-rgb),0.12)" : "rgba(255,255,255,0.04)",
      border: `1.5px solid ${active ? "var(--cp-500)" : "rgba(255,255,255,0.08)"}`,
      color: active ? "var(--cp-400)" : "rgba(255,255,255,0.6)",
    }}>
    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
      style={{ backgroundColor: active ? "var(--cp-500)" : "transparent", border: active ? "none" : "1.5px solid rgba(255,255,255,0.2)" }}>
      {active && <Check className="w-2.5 h-2.5 text-white" />}
    </div>
    {value}
  </button>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="text-[11px] text-white/40 uppercase tracking-wider mb-1.5 block">{label}</label>
    {hint && <p className="text-xs text-white/25 mb-2">{hint}</p>}
    {children}
  </div>
);

const TextInput = ({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-green-600/40 transition-colors" />
);

const TextArea = ({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) => (
  <textarea value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder ?? "Descreva aqui..."}
    rows={rows}
    className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-green-600/40 transition-colors resize-none" />
);

// ── Componente principal ───────────────────────────────────────
const Anamnese = () => {
  const navigate  = useNavigate();
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();

  const [step,         setStep]         = useState(1);
  const [form,         setForm]         = useState<FormData>(EMPTY);
  const [extrasAns,    setExtrasAns]    = useState<Record<string, string>>({});
  const [fileAns,      setFileAns]      = useState<Record<string, File[]>>({});
  const [templateCampos, setTemplate]   = useState<CampoTemplate[]>([]);
  const [isTemplateMode, setTplMode]    = useState(false);
  const [secoesTpl,    setSecoesTpl]    = useState<SecaoTemplate[]>([]);
  const [isSectionMode, setSectionMode] = useState(false);
  const [treinadorId,  setTreinadorId]  = useState<string | null>(null);
  const [alunoRecId,   setAlunoRecId]   = useState<string | null>(null);
  const [studentId,    setStudentId]    = useState<string | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [done,         setDone]         = useState(false);
  const [loadingInit,  setLoading]      = useState(true);
  const [isEditing,    setIsEditing]    = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setStudentId(session.user.id);

    const [alunoRes, anamneseRes, templateRes] = await Promise.all([
      supabase.from("alunos").select("id, treinador_id").eq("user_id", session.user.id).maybeSingle(),
      supabase.from("anamneses").select("*").eq("student_id", session.user.id).maybeSingle(),
      orgId
        ? supabase.from("anamnese_templates").select("perguntas").eq("org_id", orgId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (alunoRes.data?.treinador_id) setTreinadorId(alunoRes.data.treinador_id);
    if (alunoRes.data?.id) setAlunoRecId(alunoRes.data.id);

    // Detect template mode — sectioned (titulo) > flat (tipo) > classic
    const perguntas   = (templateRes as any)?.data?.perguntas ?? [];
    const sectionMode = perguntas.length > 0 && perguntas[0]?.titulo !== undefined;
    const richMode    = !sectionMode && perguntas.length > 0 && perguntas[0]?.tipo !== undefined;

    setSectionMode(sectionMode);
    setTplMode(richMode);

    if (sectionMode) {
      setSecoesTpl(perguntas.sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0)));
    } else if (richMode) {
      setTemplate(perguntas.sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0)));
    }

    if (anamneseRes.data) {
      setIsEditing(true);
      const a = anamneseRes.data as any;
      if (sectionMode || richMode) {
        // Template / section mode: restore from respostas_extras
        if (a.respostas_extras) setExtrasAns(a.respostas_extras);
      } else {
        setForm({
          nome_completo:           a.nome_completo ?? "",
          idade:                   a.idade != null ? String(a.idade) : "",
          altura:                  a.altura ?? "",
          peso_atual:              a.peso_atual != null ? String(a.peso_atual) : "",
          whatsapp:                a.whatsapp ?? "",
          sexo:                    a.sexo ?? "",
          objetivo:                a.objetivo ?? "",
          pratica_atividade:       a.pratica_atividade ?? "",
          tempo_pratica:           a.tempo_pratica ?? "",
          frequencia_treino_opcao: a.frequencia_treino_opcao ?? "",
          tempo_por_sessao:        a.tempo_por_sessao ?? "",
          condicoes_saude:         Array.isArray(a.condicoes_saude) ? a.condicoes_saude : [],
          lesoes_cirurgias:        a.lesoes_cirurgias ?? "",
          medicamentos:            a.medicamentos ?? "",
          desconforto_dor:         a.desconforto_dor ?? "",
          restricoes_alimentares:  a.restricoes_alimentares ?? "",
          qualidade_alimentacao:   a.qualidade_alimentacao ?? "",
          suplementos:             a.suplementos ?? "",
          alcool:                  a.alcool ?? "",
          sono:                    a.sono ?? "",
          estresse:                a.estresse ?? "",
          observacoes:             a.observacoes ?? "",
        });
        if (a.respostas_extras) setExtrasAns(a.respostas_extras);
      }
    }
    setLoading(false);
  };

  const set = (key: keyof FormData) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));
  const toggleCondicao = (val: string) =>
    setForm(f => ({
      ...f,
      condicoes_saude: f.condicoes_saude.includes(val)
        ? f.condicoes_saude.filter(x => x !== val)
        : [...f.condicoes_saude, val],
    }));

  // ── Section mode ──────────────────────────────────────────────
  const currentSecao   = isSectionMode ? secoesTpl[step - 1] : null;

  // ── Flat template mode pagination ────────────────────────────
  const totalTplPages = Math.ceil(templateCampos.length / CAMPOS_PER_PAGE);
  const tplPageCampos = templateCampos.slice((step - 1) * CAMPOS_PER_PAGE, step * CAMPOS_PER_PAGE);

  // ── Classic mode steps ────────────────────────────────────────
  const hasExtras    = !isTemplateMode && !isSectionMode && extrasAns && Object.keys(extrasAns).length > 0;
  const totalClassic = hasExtras ? 6 : 5;
  const visibleSteps = STEPS_CONFIG.slice(0, totalClassic);
  const totalSteps   = isSectionMode
    ? secoesTpl.length
    : isTemplateMode
    ? totalTplPages
    : totalClassic;

  // ── Upload file helper ────────────────────────────────────────
  const uploadFiles = async (campoId: string, files: File[]): Promise<string[]> => {
    const paths: string[] = [];
    for (const file of files) {
      const path = `${studentId}/anamnese/${campoId}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("atualizacoes").upload(path, file, { upsert: true });
      if (!error) paths.push(path);
    }
    return paths;
  };

  // ── Save ─────────────────────────────────────────────────────
  const saveProgress = async (final = false): Promise<boolean> => {
    if (!studentId || !orgId) return false;
    setSaving(true);
    try {
      let extras = { ...extrasAns };

      // Upload files on final step in template/section mode
      if (final && (isTemplateMode || isSectionMode)) {
        for (const [campoId, files] of Object.entries(fileAns)) {
          if (files.length > 0) {
            const paths = await uploadFiles(campoId, files);
            if (paths.length) extras[campoId] = JSON.stringify(paths);
          }
        }
      }

      const row: any = {
        student_id:   studentId,
        org_id:       orgId,
        respostas_extras: extras,
        pendente:     false,
      };

      if (!isTemplateMode) {
        Object.assign(row, {
          nome_completo:           form.nome_completo           || null,
          idade:                   form.idade                   ? Number(form.idade)      : null,
          altura:                  form.altura                  || null,
          peso_atual:              form.peso_atual              ? Number(form.peso_atual) : null,
          whatsapp:                form.whatsapp                || null,
          sexo:                    form.sexo                    || null,
          objetivo:                form.objetivo                || null,
          pratica_atividade:       form.pratica_atividade       || null,
          tempo_pratica:           form.tempo_pratica           || null,
          frequencia_treino_opcao: form.frequencia_treino_opcao || null,
          tempo_por_sessao:        form.tempo_por_sessao        || null,
          condicoes_saude:         form.condicoes_saude.length  ? form.condicoes_saude : null,
          lesoes_cirurgias:        form.lesoes_cirurgias        || null,
          medicamentos:            form.medicamentos            || null,
          desconforto_dor:         form.desconforto_dor         || null,
          restricoes_alimentares:  form.restricoes_alimentares  || null,
          qualidade_alimentacao:   form.qualidade_alimentacao   || null,
          suplementos:             form.suplementos             || null,
          alcool:                  form.alcool                  || null,
          sono:                    form.sono                    || null,
          estresse:                form.estresse                || null,
          observacoes:             form.observacoes             || null,
        });
      }

      const { error } = await supabase.from("anamneses").upsert(row, { onConflict: "student_id,org_id" });
      if (error) throw error;

      // Zera o flag de pendência no registro do aluno (fire-and-forget, nunca propaga erro)
      if (alunoRecId) {
        void (async () => {
          try {
            await (supabase as any).from("alunos").update({ anamnese_pendente: false }).eq("id", alunoRecId);
          } catch { /* silencioso */ }
        })();
      }

      if (final && !isEditing && treinadorId) {
        supabase.from("notificacoes").insert({
          user_id: treinadorId, org_id: orgId,
          titulo:  "Anamnese preenchida",
          mensagem: "Um aluno preencheu a ficha de anamnese. Acesse o perfil para visualizar.",
          tipo: "anamnese",
        }).catch(() => {});
      }
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
      return false;
    } finally { setSaving(false); }
  };

  const handleNext = async () => {
    const isLast = step === totalSteps;
    const ok = await saveProgress(isLast);
    if (!ok) return;
    if (!isLast) setStep(s => s + 1);
    else setDone(true);
  };

  const handleBack = () => { if (step > 1) setStep(s => s - 1); };

  const progress = Math.round((step / totalSteps) * 100);

  // ── Toggle multi-select in template mode ─────────────────────
  const toggleTplCheckbox = (campoId: string, val: string) => {
    setExtrasAns(prev => {
      const cur: string[] = (() => { try { return JSON.parse(prev[campoId] ?? "[]"); } catch { return []; } })();
      const next = cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val];
      return { ...prev, [campoId]: JSON.stringify(next) };
    });
  };
  const getCheckboxVals = (campoId: string): string[] => {
    try { return JSON.parse(extrasAns[campoId] ?? "[]"); } catch { return []; }
  };

  // ── Render campo em template mode ────────────────────────────
  const renderCampo = (c: CampoTemplate) => {
    const val = extrasAns[c.id] ?? "";

    if (c.tipo === "text") return (
      <Field key={c.id} label={c.label}>
        <input type="text" value={val}
          onChange={e => setExtrasAns(p => ({ ...p, [c.id]: e.target.value }))}
          className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-green-600/40 transition-colors" />
      </Field>
    );

    if (c.tipo === "textarea") return (
      <Field key={c.id} label={c.label}>
        <TextArea value={val}
          onChange={v => setExtrasAns(p => ({ ...p, [c.id]: v }))}
          rows={4} />
      </Field>
    );

    if (c.tipo === "number") return (
      <Field key={c.id} label={c.label}>
        <input type="number" value={val}
          onChange={e => setExtrasAns(p => ({ ...p, [c.id]: e.target.value }))}
          className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-green-600/40 transition-colors" />
      </Field>
    );

    if (c.tipo === "radio" && c.opcoes?.length) return (
      <Field key={c.id} label={c.label}>
        <div className="flex flex-col gap-2">
          {c.opcoes.map(op => (
            <OptionBtn key={op.value} value={op.label}
              active={val === op.value}
              onClick={() => setExtrasAns(p => ({ ...p, [c.id]: op.value }))} />
          ))}
        </div>
      </Field>
    );

    if (c.tipo === "checkbox" && c.opcoes?.length) {
      const checked = getCheckboxVals(c.id);
      return (
        <Field key={c.id} label={c.label} hint="Selecione todas que se aplicam">
          <div className="flex flex-col gap-2">
            {c.opcoes.map(op => (
              <MultiBtn key={op.value} value={op.label}
                active={checked.includes(op.value)}
                onClick={() => toggleTplCheckbox(c.id, op.value)} />
            ))}
          </div>
        </Field>
      );
    }

    if (c.tipo === "file") {
      const files = fileAns[c.id] ?? [];
      return (
        <Field key={c.id} label={c.label}>
          <div className="space-y-2">
            <input
              ref={el => { fileRefs.current[c.id] = el; }}
              type="file"
              multiple={c.configMultiple ?? false}
              accept={c.configAccept ?? "image/*"}
              className="hidden"
              onChange={e => {
                const selected = Array.from(e.target.files ?? []);
                setFileAns(p => ({ ...p, [c.id]: [...(p[c.id] ?? []), ...selected] }));
              }}
            />
            <button
              type="button"
              onClick={() => fileRefs.current[c.id]?.click()}
              className="flex items-center gap-2 px-4 h-10 rounded-xl border border-dashed text-sm transition-colors"
              style={{ borderColor: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}
            >
              <Upload className="w-4 h-4" />
              {c.configMultiple ? "Selecionar arquivos" : "Selecionar arquivo"}
            </button>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                    style={{ backgroundColor: "rgba(var(--cp-rgb),0.1)", color: "var(--cp-400)" }}>
                    {f.name}
                    <button type="button" onClick={() =>
                      setFileAns(p => ({ ...p, [c.id]: (p[c.id] ?? []).filter((_, j) => j !== i) }))}
                      className="text-white/40 hover:text-red-400 ml-1">
                      <XIcon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>
      );
    }

    return null;
  };

  // ─────────────────────────────────────────────────────────────
  if (loadingInit) return (
    <div className="flex items-center justify-center py-20 gap-2 text-white/30">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">Carregando...</span>
    </div>
  );

  if (done) return (
    <div className="max-w-lg mx-auto px-4 py-16 flex flex-col items-center gap-6 text-center">
      <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "var(--cp-gradient)" }}>
        <Check className="w-10 h-10 text-white" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">
          {isEditing ? "Anamnese atualizada!" : "Anamnese enviada!"}
        </h2>
        <p className="text-white/50 text-sm leading-relaxed max-w-xs">
          {isEditing
            ? "Suas informações foram atualizadas com sucesso."
            : "Seu treinador já pode visualizar suas informações e personalizar seu plano."
          }
        </p>
      </div>
      <button onClick={() => navigate(`/${slug}/aluno`)}
        className="h-12 px-8 rounded-2xl text-white text-sm font-semibold"
        style={{ background: "var(--cp-gradient)" }}>
        Ir para o início
      </button>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-white mb-0.5">
          {isEditing ? "Editar Anamnese" : "Preencher Anamnese"}
        </h1>
        <p className="text-white/40 text-sm">
          Suas respostas ajudam o profissional a criar um plano personalizado
        </p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          {isSectionMode ? (
            <span className="text-sm font-semibold text-white">
              {currentSecao?.titulo ?? `Parte ${step}`}
            </span>
          ) : isTemplateMode ? (
            <span className="text-sm font-semibold text-white">
              Parte {step} de {totalSteps}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              {(() => {
                const meta = visibleSteps[step - 1];
                const Icon = meta?.icon ?? User;
                return (
                  <>
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${meta?.color ?? "var(--cp-500)"}20` }}>
                      <Icon className="w-3.5 h-3.5" style={{ color: meta?.color ?? "var(--cp-500)" }} />
                    </div>
                    <span className="text-sm font-semibold text-white">{meta?.label}</span>
                  </>
                );
              })()}
            </div>
          )}
          <span className="text-xs text-white/35">{step} / {totalSteps}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--cp-500), hsl(var(--primary)))" }} />
        </div>
        <div className="flex gap-1.5 mt-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full transition-all"
              style={{ backgroundColor: i < step ? "var(--cp-500)" : "rgba(255,255,255,0.1)" }} />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-white/8 p-5 mb-5 space-y-5" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>

        {/* ── Section mode ───────────────────────────────────────── */}
        {isSectionMode && currentSecao && currentSecao.campos.map(c => renderCampo(c))}

        {/* ── Flat template mode ─────────────────────────────────── */}
        {isTemplateMode && tplPageCampos.map(c => renderCampo(c))}

        {/* ── Classic mode ───────────────────────────────────────── */}
        {!isTemplateMode && step === 1 && (
          <>
            <Field label="Nome completo">
              <TextInput value={form.nome_completo} onChange={set("nome_completo")} placeholder="Seu nome completo" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Idade"><TextInput type="number" value={form.idade} onChange={set("idade")} placeholder="28" /></Field>
              <Field label="Altura"><TextInput value={form.altura} onChange={set("altura")} placeholder="1,75m" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Peso atual (kg)"><TextInput type="number" value={form.peso_atual} onChange={set("peso_atual")} placeholder="75" /></Field>
              <Field label="WhatsApp"><TextInput value={form.whatsapp} onChange={set("whatsapp")} placeholder="(11) 99999-9999" /></Field>
            </div>
            <Field label="Sexo">
              <div className="flex flex-wrap gap-2">
                {["Masculino", "Feminino", "Prefiro não informar"].map(o => (
                  <OptionBtn key={o} value={o} active={form.sexo === o} onClick={() => set("sexo")(o)} />
                ))}
              </div>
            </Field>
          </>
        )}

        {!isTemplateMode && step === 2 && (
          <>
            <Field label="Objetivo principal">
              <div className="flex flex-wrap gap-2">
                {["Emagrecimento", "Hipertrofia", "Performance", "Saúde e qualidade de vida", "Reabilitação", "Outro"].map(o => (
                  <OptionBtn key={o} value={o} active={form.objetivo === o} onClick={() => set("objetivo")(o)} />
                ))}
              </div>
            </Field>
            <Field label="Você já pratica atividade física regularmente?">
              <div className="flex gap-2">
                {["Sim", "Não"].map(o => (<OptionBtn key={o} value={o} active={form.pratica_atividade === o} onClick={() => set("pratica_atividade")(o)} />))}
              </div>
            </Field>
            <Field label="Há quanto tempo?">
              <div className="flex flex-wrap gap-2">
                {["Menos de 6 meses", "6 meses a 1 ano", "1 a 3 anos", "Mais de 3 anos", "Não pratico"].map(o => (
                  <OptionBtn key={o} value={o} active={form.tempo_pratica === o} onClick={() => set("tempo_pratica")(o)} />
                ))}
              </div>
            </Field>
            <Field label="Quantas vezes por semana pode treinar?">
              <div className="flex flex-wrap gap-2">
                {["2x", "3x", "4x", "5x", "6x ou mais"].map(o => (
                  <OptionBtn key={o} value={o} active={form.frequencia_treino_opcao === o} onClick={() => set("frequencia_treino_opcao")(o)} />
                ))}
              </div>
            </Field>
            <Field label="Quanto tempo disponível por sessão?">
              <div className="flex flex-wrap gap-2">
                {["Menos de 1h", "1h", "1h30", "2h", "Mais de 2h"].map(o => (
                  <OptionBtn key={o} value={o} active={form.tempo_por_sessao === o} onClick={() => set("tempo_por_sessao")(o)} />
                ))}
              </div>
            </Field>
          </>
        )}

        {!isTemplateMode && step === 3 && (
          <>
            <Field label="Possui alguma condição de saúde diagnosticada?" hint="Selecione todas que se aplicam">
              <div className="flex flex-wrap gap-2">
                {["Hipertensão", "Diabetes", "Problemas cardíacos", "Problemas na coluna", "Dislipidemia", "Nenhuma", "Outra"].map(o => (
                  <MultiBtn key={o} value={o} active={form.condicoes_saude.includes(o)} onClick={() => toggleCondicao(o)} />
                ))}
              </div>
            </Field>
            <Field label="Já teve alguma lesão ou fez cirurgia?">
              <TextArea value={form.lesoes_cirurgias} onChange={set("lesoes_cirurgias")} placeholder="Ex: fratura no tornozelo em 2021..." />
            </Field>
            <Field label="Faz uso de alguma medicação contínua? Se sim, qual?">
              <TextArea value={form.medicamentos} onChange={set("medicamentos")} placeholder="Ex: losartana 50mg..." />
            </Field>
            <Field label="Sente algum desconforto ou dor ao se exercitar?">
              <TextArea value={form.desconforto_dor} onChange={set("desconforto_dor")} placeholder="Ex: dor no joelho ao agachar..." />
            </Field>
          </>
        )}

        {!isTemplateMode && step === 4 && (
          <>
            <Field label="Possui alguma restrição alimentar ou alergia?">
              <TextArea value={form.restricoes_alimentares} onChange={set("restricoes_alimentares")} placeholder="Ex: intolerante à lactose..." />
            </Field>
            <Field label="Como classifica sua alimentação atual?">
              <div className="flex flex-col gap-2">
                {[["Muito desregrada","Muitos ultraprocessados"],["Regular","Sem muito controle"],["Boa","Razoavelmente equilibrada"],["Ótima","Segue dieta estruturada"]].map(([val, desc]) => (
                  <button key={val} type="button" onClick={() => set("qualidade_alimentacao")(val)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all"
                    style={{ backgroundColor: form.qualidade_alimentacao === val ? "rgba(var(--cp-rgb),0.12)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${form.qualidade_alimentacao === val ? "var(--cp-500)" : "rgba(255,255,255,0.08)"}` }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: form.qualidade_alimentacao === val ? "var(--cp-400)" : "hsl(var(--foreground))" }}>{val}</p>
                      <p className="text-xs text-white/30 mt-0.5">{desc}</p>
                    </div>
                    {form.qualidade_alimentacao === val && <Check className="w-4 h-4 shrink-0" style={{ color: "var(--cp-500)" }} />}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Faz uso de algum suplemento atualmente?">
              <TextArea value={form.suplementos} onChange={set("suplementos")} placeholder="Ex: whey protein, creatina 5g/dia..." />
            </Field>
            <Field label="Consome bebida alcoólica?">
              <div className="flex flex-wrap gap-2">
                {["Sim, frequentemente", "Sim, mas raramente", "Não"].map(o => (
                  <OptionBtn key={o} value={o} active={form.alcool === o} onClick={() => set("alcool")(o)} />
                ))}
              </div>
            </Field>
          </>
        )}

        {!isTemplateMode && step === 5 && (
          <>
            <Field label="Como é sua rotina de sono?">
              <div className="flex flex-col gap-2">
                {[["Durmo bem (7-8h por noite)","Acordo descansado"],["Sono irregular (menos de 6h)","Horários variados"],["Insônia ou dificuldades para dormir","Dificuldade em adormecer"]].map(([val, desc]) => (
                  <button key={val} type="button" onClick={() => set("sono")(val)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all"
                    style={{ backgroundColor: form.sono === val ? "rgba(var(--cp-rgb),0.12)" : "rgba(255,255,255,0.04)", border: `1.5px solid ${form.sono === val ? "var(--cp-500)" : "rgba(255,255,255,0.08)"}` }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: form.sono === val ? "var(--cp-400)" : "hsl(var(--foreground))" }}>{val}</p>
                      <p className="text-xs text-white/30 mt-0.5">{desc}</p>
                    </div>
                    {form.sono === val && <Check className="w-4 h-4 shrink-0" style={{ color: "var(--cp-500)" }} />}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Qual seu nível de estresse diário?">
              <div className="flex flex-wrap gap-2">
                {["Baixo", "Moderado", "Alto"].map(o => (
                  <OptionBtn key={o} value={o} active={form.estresse === o} onClick={() => set("estresse")(o)} />
                ))}
              </div>
            </Field>
            <Field label="Observações adicionais" hint="Algo que considera importante o profissional saber">
              <TextArea value={form.observacoes} onChange={set("observacoes")} rows={4} />
            </Field>
          </>
        )}

        {!isTemplateMode && step === 6 && (
          Object.keys(extrasAns).length > 0 ? (
            Object.entries(extrasAns).map(([id, val]) => (
              <Field key={id} label={id}>
                <TextArea value={val} onChange={v => setExtrasAns(p => ({ ...p, [id]: v }))} />
              </Field>
            ))
          ) : null
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 1 && (
          <button type="button" onClick={handleBack}
            className="h-12 px-5 rounded-2xl flex items-center gap-2 text-sm font-medium transition-colors"
            style={{ color: "rgba(255,255,255,0.6)", backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
        )}
        <button type="button" onClick={handleNext} disabled={saving}
          className="flex-1 h-12 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
          style={{ background: "var(--cp-gradient)" }}>
          {saving
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : step < totalSteps
            ? <><span>Próximo</span><ChevronRight className="w-4 h-4" /></>
            : <><Check className="w-4 h-4" /><span>{isEditing ? "Salvar alterações" : "Enviar anamnese"}</span></>
          }
        </button>
      </div>

      <p className="text-center text-xs text-white/20 mt-4">
        Suas respostas são salvas automaticamente a cada etapa.
      </p>
    </div>
  );
};

export default Anamnese;
