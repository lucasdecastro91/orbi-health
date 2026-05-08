import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  User, Target, Heart, Utensils, Moon, MessageSquare,
  ChevronRight, ChevronLeft, Check, Loader2,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────
interface PerguntaExtra {
  id: string;
  texto: string;
  tipo: "texto_livre" | "multipla_escolha";
  opcoes?: string[];
}

interface FormData {
  // Etapa 1 — Dados pessoais
  nome_completo: string;
  idade: string;
  altura: string;
  peso_atual: string;
  whatsapp: string;
  sexo: string;
  // Etapa 2 — Objetivo e atividade
  objetivo: string;
  pratica_atividade: string;
  tempo_pratica: string;
  frequencia_treino_opcao: string;
  tempo_por_sessao: string;
  // Etapa 3 — Saúde
  condicoes_saude: string[];
  lesoes_cirurgias: string;
  medicamentos: string;
  desconforto_dor: string;
  // Etapa 4 — Alimentação
  restricoes_alimentares: string;
  qualidade_alimentacao: string;
  suplementos: string;
  alcool: string;
  // Etapa 5 — Hábitos + observações
  sono: string;
  estresse: string;
  observacoes: string;
}

const EMPTY: FormData = {
  nome_completo: "", idade: "", altura: "", peso_atual: "", whatsapp: "", sexo: "",
  objetivo: "", pratica_atividade: "", tempo_pratica: "", frequencia_treino_opcao: "", tempo_por_sessao: "",
  condicoes_saude: [], lesoes_cirurgias: "", medicamentos: "", desconforto_dor: "",
  restricoes_alimentares: "", qualidade_alimentacao: "", suplementos: "", alcool: "",
  sono: "", estresse: "", observacoes: "",
};

// ── Steps config ───────────────────────────────────────────────────────
const STEPS_CONFIG = [
  { id: 1, label: "Dados pessoais",         icon: User,           color: "var(--cp-500)"  },
  { id: 2, label: "Objetivo e atividade",   icon: Target,         color: "hsl(217 91% 65%)" },
  { id: 3, label: "Saúde",                  icon: Heart,          color: "hsl(0 70% 55%)"   },
  { id: 4, label: "Alimentação",            icon: Utensils,       color: "var(--cp-400)" },
  { id: 5, label: "Hábitos",               icon: Moon,           color: "hsl(280 65% 60%)" },
  { id: 6, label: "Perguntas do treinador", icon: MessageSquare,  color: "hsl(var(--primary))"  },
];

// ── Sub-componentes ────────────────────────────────────────────────────
const OptionBtn = ({
  value, active, onClick,
}: { value: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="px-3 py-2 rounded-xl text-sm font-medium text-left transition-all"
    style={{
      backgroundColor: active ? "rgba(var(--cp-rgb),0.15)" : "rgba(255,255,255,0.04)",
      border: `1.5px solid ${active ? "var(--cp-500)" : "rgba(255,255,255,0.08)"}`,
      color: active ? "var(--cp-400)" : "rgba(255,255,255,0.6)",
    }}
  >
    {value}
  </button>
);

const MultiBtn = ({
  value, active, onClick,
}: { value: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="px-3 py-2 rounded-xl text-sm font-medium text-left transition-all flex items-center gap-2"
    style={{
      backgroundColor: active ? "rgba(var(--cp-rgb),0.12)" : "rgba(255,255,255,0.04)",
      border: `1.5px solid ${active ? "var(--cp-500)" : "rgba(255,255,255,0.08)"}`,
      color: active ? "var(--cp-400)" : "rgba(255,255,255,0.6)",
    }}
  >
    <div
      className="w-4 h-4 rounded flex items-center justify-center shrink-0"
      style={{
        backgroundColor: active ? "var(--cp-500)" : "transparent",
        border: active ? "none" : "1.5px solid rgba(255,255,255,0.2)",
      }}
    >
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

const TextInput = ({
  value, onChange, placeholder, type = "text",
}: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className="w-full h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-green-600/40 transition-colors"
  />
);

const TextArea = ({
  value, onChange, placeholder, rows = 3,
}: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder ?? "Descreva aqui... (ou deixe em branco se não se aplicar)"}
    rows={rows}
    className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-green-600/40 transition-colors resize-none"
  />
);

// ── Componente principal ───────────────────────────────────────────────
const Anamnese = () => {
  const navigate    = useNavigate();
  const { toast }   = useToast();
  const { slug, orgId } = useTenantContext();

  const [step,           setStep]           = useState(1);
  const [form,           setForm]           = useState<FormData>(EMPTY);
  const [extrasAnswers,  setExtrasAnswers]  = useState<Record<string, string>>({});
  const [perguntas,      setPerguntas]      = useState<PerguntaExtra[]>([]);
  const [treinadorId,    setTreinadorId]    = useState<string | null>(null);
  const [studentId,      setStudentId]      = useState<string | null>(null);
  const [saving,         setSaving]         = useState(false);
  const [done,           setDone]           = useState(false);
  const [loadingInit,    setLoadingInit]    = useState(true);
  const [isEditing,      setIsEditing]      = useState(false);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setStudentId(session.user.id);

    const [alunoRes, anamneseRes, templateRes] = await Promise.all([
      supabase.from("alunos").select("treinador_id").eq("user_id", session.user.id).maybeSingle(),
      supabase.from("anamneses").select("*").eq("student_id", session.user.id).maybeSingle(),
      orgId
        ? supabase.from("anamnese_templates").select("perguntas").eq("org_id", orgId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (alunoRes.data?.treinador_id) setTreinadorId(alunoRes.data.treinador_id);
    if ((templateRes as any)?.data?.perguntas) setPerguntas((templateRes as any).data.perguntas);

    if (anamneseRes.data) {
      setIsEditing(true);
      const a = anamneseRes.data as any;
      setForm({
        nome_completo:          a.nome_completo          ?? "",
        idade:                  a.idade                  != null ? String(a.idade)      : "",
        altura:                 a.altura                 ?? "",
        peso_atual:             a.peso_atual             != null ? String(a.peso_atual) : "",
        whatsapp:               a.whatsapp               ?? "",
        sexo:                   a.sexo                   ?? "",
        objetivo:               a.objetivo               ?? "",
        pratica_atividade:      a.pratica_atividade      ?? "",
        tempo_pratica:          a.tempo_pratica          ?? "",
        frequencia_treino_opcao: a.frequencia_treino_opcao ?? "",
        tempo_por_sessao:       a.tempo_por_sessao       ?? "",
        condicoes_saude:        Array.isArray(a.condicoes_saude) ? a.condicoes_saude : [],
        lesoes_cirurgias:       a.lesoes_cirurgias       ?? "",
        medicamentos:           a.medicamentos           ?? "",
        desconforto_dor:        a.desconforto_dor        ?? "",
        restricoes_alimentares: a.restricoes_alimentares ?? "",
        qualidade_alimentacao:  a.qualidade_alimentacao  ?? "",
        suplementos:            a.suplementos            ?? "",
        alcool:                 a.alcool                 ?? "",
        sono:                   a.sono                   ?? "",
        estresse:               a.estresse               ?? "",
        observacoes:            a.observacoes            ?? "",
      });
      if (a.respostas_extras) setExtrasAnswers(a.respostas_extras);
    }

    setLoadingInit(false);
  };

  const set = (key: keyof FormData) => (val: string) =>
    setForm((f) => ({ ...f, [key]: val }));

  const toggleCondicao = (val: string) =>
    setForm((f) => ({
      ...f,
      condicoes_saude: f.condicoes_saude.includes(val)
        ? f.condicoes_saude.filter((x) => x !== val)
        : [...f.condicoes_saude, val],
    }));

  const totalSteps = perguntas.length > 0 ? 6 : 5;

  const saveProgress = async (final = false): Promise<boolean> => {
    if (!studentId || !orgId) return false;
    setSaving(true);
    try {
      const { error } = await supabase.from("anamneses").upsert({
        student_id:              studentId,
        org_id:                  orgId,
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
        respostas_extras:        extrasAnswers,
        pendente:                false,
      }, { onConflict: "student_id,org_id" });

      if (error) throw error;

      // Notifica o treinador apenas no envio final (novo preenchimento)
      if (final && !isEditing && treinadorId) {
        supabase.from("notificacoes").insert({
          user_id:  treinadorId,
          org_id:   orgId,
          titulo:   "Anamnese preenchida",
          mensagem: "Um aluno preencheu a ficha de anamnese. Acesse o perfil para visualizar.",
          tipo:     "anamnese",
        }).catch(() => {});
      }
      return true;
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
      return false;
    } finally { setSaving(false); }
  };

  const handleNext = async () => {
    const ok = await saveProgress(step === totalSteps);
    if (!ok) return;
    if (step < totalSteps) setStep((s) => s + 1);
    else setDone(true);
  };

  const handleBack = () => { if (step > 1) setStep((s) => s - 1); };

  const visibleSteps = perguntas.length > 0 ? STEPS_CONFIG : STEPS_CONFIG.filter((s) => s.id !== 6);
  const currentMeta  = visibleSteps[step - 1];
  const StepIcon     = currentMeta?.icon ?? User;
  const stepColor    = currentMeta?.color ?? "var(--cp-500)";
  const progress     = Math.round((step / totalSteps) * 100);

  // ── Loading ──────────────────────────────────────────────────────────
  if (loadingInit) return (
    <div className="flex items-center justify-center py-20 gap-2 text-white/30">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">Carregando...</span>
    </div>
  );

  // ── Tela de conclusão ────────────────────────────────────────────────
  if (done) return (
    <div className="max-w-lg mx-auto px-4 py-16 flex flex-col items-center gap-6 text-center">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ background: "var(--cp-gradient)" }}
      >
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
      <button
        onClick={() => navigate(`/${slug}/aluno`)}
        className="h-12 px-8 rounded-2xl text-white text-sm font-semibold"
        style={{ background: "var(--cp-gradient)" }}
      >
        Ir para o início
      </button>
    </div>
  );

  // ── Render principal ─────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-6">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-white mb-0.5">
          {isEditing ? "Editar Anamnese" : "Preencher Anamnese"}
        </h1>
        <p className="text-white/40 text-sm">
          Suas respostas ajudam o treinador a criar um plano personalizado
        </p>
      </div>

      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${stepColor}20` }}
            >
              <StepIcon className="w-3.5 h-3.5" style={{ color: stepColor }} />
            </div>
            <span className="text-sm font-semibold text-white">{currentMeta?.label}</span>
          </div>
          <span className="text-xs text-white/35">{step} / {totalSteps}</span>
        </div>
        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--cp-500), hsl(var(--primary)))" }}
          />
        </div>
        <div className="flex gap-1.5 mt-2">
          {visibleSteps.map((s, i) => (
            <div
              key={s.id}
              className="h-1 flex-1 rounded-full transition-all"
              style={{ backgroundColor: i < step ? "var(--cp-500)" : "rgba(255,255,255,0.1)" }}
            />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div
        className="rounded-2xl border border-white/8 p-5 mb-5 space-y-5"
        style={{ backgroundColor: "rgba(255,255,255,0.02)" }}
      >

        {/* ── Etapa 1: Dados pessoais ─────────────────────────────── */}
        {step === 1 && (
          <>
            <Field label="Nome completo">
              <TextInput value={form.nome_completo} onChange={set("nome_completo")} placeholder="Seu nome completo" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Idade">
                <TextInput type="number" value={form.idade} onChange={set("idade")} placeholder="28" />
              </Field>
              <Field label="Altura">
                <TextInput value={form.altura} onChange={set("altura")} placeholder="1,75m" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Peso atual (kg)">
                <TextInput type="number" value={form.peso_atual} onChange={set("peso_atual")} placeholder="75" />
              </Field>
              <Field label="WhatsApp">
                <TextInput value={form.whatsapp} onChange={set("whatsapp")} placeholder="(11) 99999-9999" />
              </Field>
            </div>

            <Field label="Sexo">
              <div className="flex flex-wrap gap-2">
                {["Masculino", "Feminino", "Prefiro não informar"].map((o) => (
                  <OptionBtn key={o} value={o} active={form.sexo === o} onClick={() => set("sexo")(o)} />
                ))}
              </div>
            </Field>
          </>
        )}

        {/* ── Etapa 2: Objetivo e atividade ──────────────────────── */}
        {step === 2 && (
          <>
            <Field label="Objetivo principal">
              <div className="flex flex-wrap gap-2">
                {["Emagrecimento", "Hipertrofia", "Performance", "Saúde e qualidade de vida", "Reabilitação", "Outro"].map((o) => (
                  <OptionBtn key={o} value={o} active={form.objetivo === o} onClick={() => set("objetivo")(o)} />
                ))}
              </div>
            </Field>

            <Field label="Você já pratica atividade física regularmente?">
              <div className="flex gap-2">
                {["Sim", "Não"].map((o) => (
                  <OptionBtn key={o} value={o} active={form.pratica_atividade === o} onClick={() => set("pratica_atividade")(o)} />
                ))}
              </div>
            </Field>

            <Field label="Há quanto tempo?">
              <div className="flex flex-wrap gap-2">
                {["Menos de 6 meses", "6 meses a 1 ano", "1 a 3 anos", "Mais de 3 anos", "Não pratico"].map((o) => (
                  <OptionBtn key={o} value={o} active={form.tempo_pratica === o} onClick={() => set("tempo_pratica")(o)} />
                ))}
              </div>
            </Field>

            <Field label="Quantas vezes por semana pode treinar?">
              <div className="flex flex-wrap gap-2">
                {["2x", "3x", "4x", "5x", "6x ou mais"].map((o) => (
                  <OptionBtn key={o} value={o} active={form.frequencia_treino_opcao === o} onClick={() => set("frequencia_treino_opcao")(o)} />
                ))}
              </div>
            </Field>

            <Field label="Quanto tempo disponível por sessão?">
              <div className="flex flex-wrap gap-2">
                {["Menos de 1h", "1h", "1h30", "2h", "Mais de 2h"].map((o) => (
                  <OptionBtn key={o} value={o} active={form.tempo_por_sessao === o} onClick={() => set("tempo_por_sessao")(o)} />
                ))}
              </div>
            </Field>
          </>
        )}

        {/* ── Etapa 3: Saúde ────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <Field label="Possui alguma condição de saúde diagnosticada?" hint="Selecione todas que se aplicam">
              <div className="flex flex-wrap gap-2">
                {["Hipertensão", "Diabetes", "Problemas cardíacos", "Problemas na coluna", "Dislipidemia", "Nenhuma", "Outra"].map((o) => (
                  <MultiBtn
                    key={o} value={o}
                    active={form.condicoes_saude.includes(o)}
                    onClick={() => toggleCondicao(o)}
                  />
                ))}
              </div>
            </Field>

            <Field label="Já teve alguma lesão ou fez cirurgia?">
              <TextArea
                value={form.lesoes_cirurgias}
                onChange={set("lesoes_cirurgias")}
                placeholder="Ex: fratura no tornozelo em 2021, cirurgia no joelho..."
              />
            </Field>

            <Field label="Faz uso de alguma medicação contínua? Se sim, qual?">
              <TextArea
                value={form.medicamentos}
                onChange={set("medicamentos")}
                placeholder="Ex: losartana 50mg, levotiroxina 50mcg..."
              />
            </Field>

            <Field label="Sente algum desconforto ou dor ao se exercitar? Se sim, descreva">
              <TextArea
                value={form.desconforto_dor}
                onChange={set("desconforto_dor")}
                placeholder="Ex: dor no joelho ao agachar, limitação de amplitude no ombro..."
              />
            </Field>
          </>
        )}

        {/* ── Etapa 4: Alimentação ────────────────────────────────── */}
        {step === 4 && (
          <>
            <Field label="Possui alguma restrição alimentar ou alergia?">
              <TextArea
                value={form.restricoes_alimentares}
                onChange={set("restricoes_alimentares")}
                placeholder="Ex: intolerante à lactose, alergia a frutos do mar, vegetariano..."
              />
            </Field>

            <Field label="Como classifica sua alimentação atual?">
              <div className="flex flex-col gap-2">
                {[
                  ["Muito desregrada", "Muitos ultraprocessados, sem horários fixos"],
                  ["Regular",          "Come de tudo mas sem muito controle"],
                  ["Boa",              "Razoavelmente equilibrada"],
                  ["Ótima",            "Segue uma dieta bem estruturada"],
                ].map(([val, desc]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set("qualidade_alimentacao")(val)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all"
                    style={{
                      backgroundColor: form.qualidade_alimentacao === val ? "rgba(var(--cp-rgb),0.12)" : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${form.qualidade_alimentacao === val ? "var(--cp-500)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: form.qualidade_alimentacao === val ? "var(--cp-400)" : "hsl(var(--foreground))" }}>{val}</p>
                      <p className="text-xs text-white/30 mt-0.5">{desc}</p>
                    </div>
                    {form.qualidade_alimentacao === val && <Check className="w-4 h-4 shrink-0" style={{ color: "var(--cp-500)" }} />}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Faz uso de algum suplemento atualmente? Se sim, qual?">
              <TextArea
                value={form.suplementos}
                onChange={set("suplementos")}
                placeholder="Ex: whey protein, creatina 5g/dia, vitamina D..."
              />
            </Field>

            <Field label="Consome bebida alcoólica?">
              <div className="flex flex-wrap gap-2">
                {["Sim, frequentemente", "Sim, mas raramente", "Não"].map((o) => (
                  <OptionBtn key={o} value={o} active={form.alcool === o} onClick={() => set("alcool")(o)} />
                ))}
              </div>
            </Field>
          </>
        )}

        {/* ── Etapa 5: Hábitos + observações ──────────────────────── */}
        {step === 5 && (
          <>
            <Field label="Como é sua rotina de sono?">
              <div className="flex flex-col gap-2">
                {[
                  ["Durmo bem (7-8h por noite)", "Acordo descansado e com energia"],
                  ["Sono irregular (menos de 6h)", "Horários variados, acordo cansado"],
                  ["Insônia ou dificuldades para dormir", "Dificuldade em adormecer ou manter o sono"],
                ].map(([val, desc]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set("sono")(val)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all"
                    style={{
                      backgroundColor: form.sono === val ? "rgba(var(--cp-rgb),0.12)" : "rgba(255,255,255,0.04)",
                      border: `1.5px solid ${form.sono === val ? "var(--cp-500)" : "rgba(255,255,255,0.08)"}`,
                    }}
                  >
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
                {["Baixo", "Moderado", "Alto"].map((o) => (
                  <OptionBtn key={o} value={o} active={form.estresse === o} onClick={() => set("estresse")(o)} />
                ))}
              </div>
            </Field>

            <Field
              label="Observações adicionais"
              hint="Algo que considera importante o profissional saber"
            >
              <TextArea
                value={form.observacoes}
                onChange={set("observacoes")}
                placeholder="Ex: viajo frequentemente, tenho dificuldade com horários fixos, prefiro exercícios em casa..."
                rows={4}
              />
            </Field>
          </>
        )}

        {/* ── Etapa 6: Perguntas do treinador ─────────────────────── */}
        {step === 6 && perguntas.length > 0 && (
          <>
            {perguntas.map((p) => (
              <Field key={p.id} label={p.texto}>
                {p.tipo === "multipla_escolha" && p.opcoes ? (
                  <div className="flex flex-wrap gap-2">
                    {p.opcoes.map((o) => (
                      <OptionBtn
                        key={o} value={o}
                        active={extrasAnswers[p.id] === o}
                        onClick={() => setExtrasAnswers((prev) => ({ ...prev, [p.id]: o }))}
                      />
                    ))}
                  </div>
                ) : (
                  <TextArea
                    value={extrasAnswers[p.id] ?? ""}
                    onChange={(v) => setExtrasAnswers((prev) => ({ ...prev, [p.id]: v }))}
                  />
                )}
              </Field>
            ))}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={handleBack}
            className="h-12 px-5 rounded-2xl flex items-center gap-2 text-sm font-medium transition-colors"
            style={{
              color: "rgba(255,255,255,0.6)",
              backgroundColor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)"; }}
          >
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={saving}
          className="flex-1 h-12 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
          style={{ background: "var(--cp-gradient)" }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : step < totalSteps ? (
            <><span>Próximo</span><ChevronRight className="w-4 h-4" /></>
          ) : (
            <><Check className="w-4 h-4" /><span>{isEditing ? "Salvar alterações" : "Enviar anamnese"}</span></>
          )}
        </button>
      </div>

      <p className="text-center text-xs text-white/20 mt-4">
        Suas respostas são salvas automaticamente a cada etapa.
      </p>
    </div>
  );
};

export default Anamnese;
