import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  Activity, AlertCircle, Clock, Calendar, Heart, HeartPulse, Flame,
  Footprints, Wind, Bike, RefreshCw, Waves, Zap, Dumbbell, Loader2, ChevronDown,
  Play, Pause, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { estimateKcal } from "@/lib/cardioCalc";
import { grantXP } from "@/lib/xp";
import { startTimer, pauseTimer, clearTimer, getActiveTimer } from "@/lib/activeTimer";

const fmtMMSS = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

const ESFORCO_OPTIONS: { value: string; label: string }[] = [
  { value: "muito_facil",  label: "Muito fácil" },
  { value: "facil",        label: "Fácil" },
  { value: "moderado",     label: "Moderado" },
  { value: "dificil",      label: "Difícil" },
  { value: "muito_dificil", label: "Muito difícil" },
];

interface CardioPlano {
  id: string;
  tipo: string;
  bpm_alvo: string | null;
  frequencia_semana: number | null;
  duracao_minutos: number | null;
  observacoes: string | null;
}

interface CardioSessao {
  id: string;
  tipo: string;
  data_sessao: string;
  duracao_minutos: number;
  bpm_medio: number | null;
  kcal_estimado: number | null;
  esforco: string | null;
  feedback: string | null;
}

const TIPO_ICON: Record<string, LucideIcon> = {
  Corrida:   Wind,
  Caminhada: Footprints,
  Bike:      Bike,
  Elíptico:  RefreshCw,
  Remo:      Waves,
  Natação:   Waves,
  HIIT:      Zap,
  Outro:     Dumbbell,
};

const bpmAlvoToNumber = (bpmAlvo: string | null): number | null => {
  if (!bpmAlvo) return null;
  const match = bpmAlvo.match(/\d+/g);
  if (!match) return null;
  // Se for uma faixa ("130-140"), usa a média
  const nums = match.map(Number);
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
};

const StudentCardio = () => {
  const { toast } = useToast();
  const { orgId } = useTenantContext();

  const [planos,  setPlanos]  = useState<CardioPlano[]>([]);
  const [loading, setLoading] = useState(true);
  const [alunoId, setAlunoId] = useState<string | null>(null);
  const [studentUserId, setStudentUserId] = useState<string | null>(null);

  // Dados pro cálculo de kcal
  const [idade, setIdade] = useState<number | null>(null);
  const [sexo, setSexo] = useState<string | null>(null);
  const [pesoKg, setPesoKg] = useState<number | null>(null);

  // Formulário único de idade/sexo (alunos que nunca preencheram anamnese)
  const [idadeFormInput, setIdadeFormInput] = useState("");
  const [sexoFormInput, setSexoFormInput] = useState("");
  const [savingDados, setSavingDados] = useState(false);

  // Formulário de registro de sessão
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [duracaoInput, setDuracaoInput] = useState("");
  const [bpmInput, setBpmInput] = useState("");
  const [esforco, setEsforco] = useState<string | null>(null);
  const [feedbackInput, setFeedbackInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Sessão ao vivo — cronômetro rodando enquanto o aluno treina
  const [livePlanoId, setLivePlanoId] = useState<string | null>(null);
  const [liveStartedAt, setLiveStartedAt] = useState<number | null>(null);
  const [liveTick, setLiveTick] = useState(Date.now());
  const [liveDuracaoSegundos, setLiveDuracaoSegundos] = useState<number | null>(null);

  // Pausa da sessão ao vivo — congela o cronômetro sem cancelar
  const [isPaused, setIsPaused] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);

  // Card único e expansível de "Esforço percebido" (substitui as pills)
  const [esforcoOpen, setEsforcoOpen] = useState(false);

  const [sessoes, setSessoes] = useState<CardioSessao[]>([]);

  useEffect(() => {
    loadAll();
  }, []);

  // Alinha o tick ao segundo cheio do relógio (em vez de setInterval a partir do
  // instante de montagem) — assim este cronômetro e o da barra fixa (StudentLayout)
  // batem no mesmo segundo, sem defasagem visual entre os dois.
  useEffect(() => {
    if (!livePlanoId || isPaused) return;
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleTick = () => {
      timeoutId = setTimeout(() => {
        setLiveTick(Date.now());
        scheduleTick();
      }, 1000 - (Date.now() % 1000));
    };
    scheduleTick();
    return () => clearTimeout(timeoutId);
  }, [livePlanoId, isPaused]);

  const loadAll = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setStudentUserId(session.user.id);

      const { data: aluno } = await supabase
        .from("alunos")
        .select("id, idade, sexo")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!aluno) {
        setLoading(false);
        return;
      }
      setAlunoId(aluno.id);

      const [planosRes, anamneseRes, pesoRes, sessoesRes] = await Promise.all([
        supabase
          .from("cardio_planos")
          .select("id, tipo, bpm_alvo, frequencia_semana, duracao_minutos, observacoes")
          .eq("aluno_id", aluno.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("anamneses")
          .select("idade, sexo")
          .eq("student_id", session.user.id)
          .maybeSingle(),
        supabase
          .from("registros_evolucao")
          .select("peso_kg")
          .eq("student_id", session.user.id)
          .order("data_registro", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("cardio_sessoes")
          .select("id, tipo, data_sessao, duracao_minutos, bpm_medio, kcal_estimado, esforco, feedback")
          .eq("student_id", session.user.id)
          .order("data_sessao", { ascending: false })
          .limit(5),
      ]);

      if (planosRes.error) throw planosRes.error;
      setPlanos(planosRes.data ?? []);

      // Restaura a sessão ao vivo se o aluno saiu da tela e voltou (ex: via barra fixa) —
      // sem isso, o cronômetro local "esquecia" que havia uma sessão em andamento.
      const activeTimer = await getActiveTimer(session.user.id);
      if (
        activeTimer?.tipo === "cardio" &&
        activeTimer.ref_id &&
        (planosRes.data ?? []).some((p: any) => p.id === activeTimer.ref_id)
      ) {
        setLivePlanoId(activeTimer.ref_id);
        setLiveStartedAt(new Date(activeTimer.started_at).getTime());
        setLiveDuracaoSegundos(activeTimer.duracao_segundos);
        if (activeTimer.paused_at) {
          setIsPaused(true);
          setPausedAt(new Date(activeTimer.paused_at).getTime());
        }
      }

      const anamneseData = anamneseRes.data as any;
      const alunoIdade = (aluno as any).idade;
      const alunoSexo = (aluno as any).sexo;
      if (alunoIdade != null) setIdade(Number(alunoIdade));
      else if (anamneseData?.idade != null) setIdade(Number(anamneseData.idade));
      if (alunoSexo) setSexo(alunoSexo);
      else if (anamneseData?.sexo) setSexo(anamneseData.sexo);

      const pesoData = pesoRes.data as any;
      if (pesoData?.peso_kg != null) setPesoKg(Number(pesoData.peso_kg));

      setSessoes((sessoesRes.data as any[]) ?? []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar cardio", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  /** Inicia a sessão ao vivo — cronômetro rodando + timer ativo (aparece na barra fixa) */
  const startLiveSession = (plano: CardioPlano) => {
    const now = Date.now();
    const duracaoSegundos = (plano.duracao_minutos ?? 30) * 60;
    setLivePlanoId(plano.id);
    setLiveStartedAt(now);
    setLiveTick(now); // evita mostrar um valor negativo antes do 1º tick do setInterval
    setLiveDuracaoSegundos(duracaoSegundos);
    setIsPaused(false);
    setPausedAt(null);
    setDuracaoInput(plano.duracao_minutos ? String(plano.duracao_minutos) : "");
    setBpmInput(bpmAlvoToNumber(plano.bpm_alvo) != null ? String(bpmAlvoToNumber(plano.bpm_alvo)) : "");
    setEsforco(null);
    setFeedbackInput("");
    if (studentUserId) {
      void startTimer(studentUserId, orgId ?? null, "cardio", plano.tipo, duracaoSegundos, plano.id);
    }
  };

  /** Congela o cronômetro sem cancelar a sessão */
  const pauseLiveSession = () => {
    setIsPaused(true);
    setPausedAt(Date.now());
    if (studentUserId) void pauseTimer(studentUserId);
  };

  /** Retoma a sessão pausada, descontando o tempo parado do cronômetro */
  const resumeLiveSession = (plano: CardioPlano) => {
    if (!liveStartedAt || !pausedAt) return;
    const pauseDuration = Date.now() - pausedAt;
    const newStartedAt = liveStartedAt + pauseDuration;
    setLiveStartedAt(newStartedAt);
    setLiveTick(Date.now());
    setIsPaused(false);
    setPausedAt(null);
    if (studentUserId && liveDuracaoSegundos != null) {
      void startTimer(studentUserId, orgId ?? null, "cardio", plano.tipo, liveDuracaoSegundos, plano.id, new Date(newStartedAt));
    }
  };

  /** Abre o formulário de finalizar, pré-preenchendo a duração com o tempo já decorrido */
  const openFinalizeForm = (plano: CardioPlano) => {
    if (liveStartedAt) {
      // Usa Date.now() direto, não o state liveTick (que só atualiza 1x/segundo e
      // pode estar levemente desatualizado no instante exato do clique)
      const elapsedMin = Math.max(1, Math.round((Date.now() - liveStartedAt) / 60000));
      setDuracaoInput(String(elapsedMin));
    }
    setOpenFormId(plano.id);
  };

  const closeForm = () => {
    setOpenFormId(null);
    setEsforcoOpen(false);
  };

  /** Cancela a sessão ao vivo por completo, sem registrar nada */
  const abandonLiveSession = () => {
    if (studentUserId) void clearTimer(studentUserId);
    setLivePlanoId(null);
    setLiveStartedAt(null);
    setLiveDuracaoSegundos(null);
    setIsPaused(false);
    setPausedAt(null);
    setOpenFormId(null);
    setDuracaoInput("");
    setBpmInput("");
    setEsforco(null);
    setFeedbackInput("");
    setEsforcoOpen(false);
  };

  const registrarSessao = async (plano: CardioPlano) => {
    const duracaoMinutos = Number(duracaoInput);
    if (!duracaoMinutos || duracaoMinutos <= 0) {
      toast({ title: "Informe a duração da sessão", variant: "destructive" });
      return;
    }
    const bpmMedio = bpmInput ? Number(bpmInput) : null;

    setSaving(true);
    try {
      if (!alunoId || !studentUserId) return;

      const { kcal, metodo } = estimateKcal({
        tipo: plano.tipo,
        duracaoMinutos,
        bpmMedio,
        idade,
        sexo,
        pesoKg,
      });

      const { error } = await supabase.from("cardio_sessoes").insert({
        student_id: studentUserId,
        org_id: orgId,
        cardio_plano_id: plano.id,
        tipo: plano.tipo,
        data_sessao: new Date().toISOString().slice(0, 10),
        duracao_minutos: duracaoMinutos,
        bpm_medio: bpmMedio,
        kcal_estimado: kcal,
        metodo_calculo: metodo,
        esforco: esforco,
        feedback: feedbackInput.trim() || null,
      });
      if (error) throw error;

      if (orgId) void grantXP(studentUserId, orgId, "cardio_complete");
      void clearTimer(studentUserId);

      toast({ title: `Sessão registrada! ~${kcal} kcal` });
      setLivePlanoId(null);
      setLiveStartedAt(null);
      setLiveDuracaoSegundos(null);
      setIsPaused(false);
      setPausedAt(null);
      closeForm();
      loadAll();
    } catch (err: any) {
      toast({ title: "Erro ao registrar sessão", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const salvarDados = async () => {
    const idadeNum = Number(idadeFormInput);
    if (!idadeNum || idadeNum <= 0 || !sexoFormInput) {
      toast({ title: "Preencha idade e sexo", variant: "destructive" });
      return;
    }
    if (!alunoId) return;

    setSavingDados(true);
    try {
      // Alunos não têm permissão de UPDATE direto em `alunos` (RLS só permite treinador) —
      // essa RPC escreve só idade/sexo do próprio registro, com segurança.
      const { error } = await (supabase as any).rpc("update_own_idade_sexo", {
        p_idade: idadeNum,
        p_sexo: sexoFormInput,
      });
      if (error) throw error;

      setIdade(idadeNum);
      setSexo(sexoFormInput);
      toast({ title: "Dados salvos!" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar dados", description: err.message, variant: "destructive" });
    } finally {
      setSavingDados(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/60 animate-spin" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-6">
      {/* Page header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <HeartPulse className="w-5 h-5 shrink-0" style={{ color: "var(--cp-500)" }} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Cardio</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Seu plano de cardio prescrito</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-3">
        {!(idade && sexo) && (
          <div className="rounded-2xl border p-4 space-y-3" style={{ backgroundColor: "rgba(var(--cp-rgb),0.06)", borderColor: "rgba(var(--cp-rgb),0.2)" }}>
            <div>
              <p className="text-sm font-semibold text-foreground">Complete seus dados</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Idade e sexo deixam a estimativa de kcal do cardio bem mais precisa. É só uma vez.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Idade</label>
                <input
                  type="number" inputMode="numeric" value={idadeFormInput}
                  onChange={(e) => setIdadeFormInput(e.target.value)}
                  placeholder="Ex: 28"
                  className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-green-600/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Sexo</label>
                <select
                  value={sexoFormInput}
                  onChange={(e) => setSexoFormInput(e.target.value)}
                  className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-2.5 text-sm text-foreground focus:outline-none focus:border-green-600/50"
                >
                  <option value="" style={{ backgroundColor: "var(--sheet-bg-2)" }}>Selecione</option>
                  <option value="Masculino" style={{ backgroundColor: "var(--sheet-bg-2)" }}>Masculino</option>
                  <option value="Feminino" style={{ backgroundColor: "var(--sheet-bg-2)" }}>Feminino</option>
                </select>
              </div>
            </div>
            <button
              type="button" disabled={savingDados} onClick={salvarDados}
              className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
              style={{ background: "var(--cp-gradient)", color: "#fff" }}
            >
              {savingDados ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        )}

        {planos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/8 px-4 py-10 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground opacity-30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Nenhum plano de cardio</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Seu treinador ainda não cadastrou um plano de cardio. Entre em contato para solicitar.
            </p>
          </div>
        ) : (
          planos.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-white/8 overflow-hidden"
              style={{ backgroundColor: "var(--surface-1)" }}
            >
              {/* Card header */}
              <div
                className="px-4 py-3 border-b border-white/6 flex items-center gap-3"
              >
                {(() => {
                  const TipoIcon = TIPO_ICON[item.tipo] ?? Activity;
                  return (
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)" }}
                    >
                      <TipoIcon className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">{item.tipo}</h2>
                  {item.observacoes && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.observacoes}</p>
                  )}
                </div>
              </div>

              {/* Metrics */}
              <div className="p-4 grid grid-cols-3 gap-2">
                {item.frequencia_semana != null && (
                  <div
                    className="rounded-xl px-3 py-2.5 flex flex-col items-center gap-1"
                    style={{ backgroundColor: "var(--surface-2)" }}
                  >
                    <Calendar className="w-4 h-4 text-muted-foreground opacity-60" />
                    <p className="text-base font-bold text-foreground leading-none">{item.frequencia_semana}×</p>
                    <p className="text-[10px] text-muted-foreground">por semana</p>
                  </div>
                )}

                {item.duracao_minutos != null && (
                  <div
                    className="rounded-xl px-3 py-2.5 flex flex-col items-center gap-1"
                    style={{ backgroundColor: "var(--surface-2)" }}
                  >
                    <Clock className="w-4 h-4 text-muted-foreground opacity-60" />
                    <p className="text-base font-bold text-foreground leading-none">{item.duracao_minutos}</p>
                    <p className="text-[10px] text-muted-foreground">minutos</p>
                  </div>
                )}

                {item.bpm_alvo && (
                  <div
                    className="rounded-xl px-3 py-2.5 flex flex-col items-center gap-1"
                    style={{ backgroundColor: "var(--surface-2)" }}
                  >
                    <Heart className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
                    <p className="text-base font-bold leading-none" style={{ color: "var(--cp-400)" }}>
                      {item.bpm_alvo}
                    </p>
                    <p className="text-[10px] text-muted-foreground">BPM alvo</p>
                  </div>
                )}
              </div>

              {/* Observations */}
              {item.observacoes && (
                <div className="px-4 pb-4">
                  <div
                    className="rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: "var(--surface-2)" }}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Instruções</p>
                    <p className="text-sm text-foreground leading-relaxed">{item.observacoes}</p>
                  </div>
                </div>
              )}

              {/* Registrar sessão */}
              <div className="px-4 pb-4">
                {openFormId === item.id ? (
                  <div className="rounded-xl p-3 space-y-2.5" style={{ backgroundColor: "var(--surface-2)" }}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Duração (min)</label>
                        <input
                          type="number" inputMode="numeric" value={duracaoInput}
                          onChange={(e) => setDuracaoInput(e.target.value)}
                          className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-2.5 text-sm text-foreground focus:outline-none focus:border-green-600/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">BPM médio</label>
                        <input
                          type="number" inputMode="numeric" value={bpmInput}
                          onChange={(e) => setBpmInput(e.target.value)}
                          placeholder="opcional"
                          className="w-full h-10 rounded-lg bg-white/5 border border-white/10 px-2.5 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-green-600/50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Esforço percebido (opcional)</label>
                      <div
                        className="rounded-lg border overflow-hidden"
                        style={{ backgroundColor: "hsl(var(--foreground) / 0.05)", borderColor: "hsl(var(--foreground) / 0.1)" }}
                      >
                        <button
                          type="button"
                          onClick={() => setEsforcoOpen((v) => !v)}
                          className="w-full h-10 flex items-center gap-2 px-2.5"
                        >
                          <span
                            className="text-sm flex-1 text-left"
                            style={{
                              color: esforco ? "var(--cp-400)" : "hsl(var(--muted-foreground))",
                              fontWeight: esforco ? 600 : 400,
                            }}
                          >
                            {esforco ? ESFORCO_OPTIONS.find((o) => o.value === esforco)?.label : "Selecionar"}
                          </span>
                          <ChevronDown
                            className="w-4 h-4 text-muted-foreground shrink-0 transition-transform"
                            style={{ transform: esforcoOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                          />
                        </button>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateRows: esforcoOpen ? "1fr" : "0fr",
                            transition: "grid-template-rows 0.25s ease",
                          }}
                        >
                          <div className="overflow-hidden">
                            <div className="px-2 pb-2 space-y-1">
                              {ESFORCO_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    setEsforco(esforco === opt.value ? null : opt.value);
                                    setEsforcoOpen(false);
                                  }}
                                  className="w-full rounded-md px-2.5 py-2 flex items-center justify-between text-sm transition-colors"
                                  style={{
                                    backgroundColor: esforco === opt.value ? "rgba(var(--cp-rgb),0.18)" : "hsl(var(--foreground) / 0.03)",
                                    color: esforco === opt.value ? "var(--cp-400)" : "hsl(var(--foreground))",
                                    fontWeight: esforco === opt.value ? 600 : 400,
                                  }}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">Como foi o cardio? (opcional)</label>
                      <textarea
                        value={feedbackInput}
                        onChange={(e) => setFeedbackInput(e.target.value)}
                        rows={2}
                        placeholder="Observações sobre a sessão..."
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-green-600/50 resize-none"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button" onClick={closeForm}
                        className="flex-1 h-10 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: "hsl(var(--foreground) / 0.05)", color: "hsl(var(--muted-foreground))" }}
                      >
                        Voltar
                      </button>
                      <button
                        type="button" disabled={saving} onClick={() => registrarSessao(item)}
                        className="flex-1 h-10 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
                        style={{ background: "var(--cp-gradient)", color: "#fff" }}
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
                        Registrar
                      </button>
                    </div>
                    {!(idade && sexo && sexo !== "Prefiro não informar") && (
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Estimativa aproximada (por MET) — complete idade e sexo acima para um cálculo mais preciso por frequência cardíaca.
                      </p>
                    )}
                  </div>
                ) : livePlanoId === item.id ? (
                  <div className="rounded-xl p-4 flex flex-col items-center gap-3" style={{ backgroundColor: "var(--surface-2)" }}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {item.tipo} {isPaused ? "pausado" : "em andamento"}
                    </p>
                    <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--cp-400)" }}>
                      {fmtMMSS(Math.floor((liveTick - (liveStartedAt ?? liveTick)) / 1000))}
                    </p>
                    {isPaused ? (
                      <>
                        <button
                          type="button" onClick={() => resumeLiveSession(item)}
                          className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                          style={{ background: "var(--cp-gradient)", color: "#fff" }}
                        >
                          <Play className="w-4 h-4" />
                          Retomar sessão
                        </button>
                        <button
                          type="button" onClick={abandonLiveSession}
                          className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                          style={{ border: "1.5px solid var(--cp-500)", color: "var(--cp-400)", backgroundColor: "rgba(var(--cp-rgb),0.06)" }}
                        >
                          <X className="w-4 h-4" />
                          Cancelar sessão
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button" onClick={() => openFinalizeForm(item)}
                          className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                          style={{ background: "var(--cp-gradient)", color: "#fff" }}
                        >
                          <Flame className="w-4 h-4" />
                          Finalizar sessão
                        </button>
                        <button
                          type="button" onClick={pauseLiveSession}
                          className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                          style={{ border: "1.5px solid var(--cp-500)", color: "var(--cp-400)", backgroundColor: "rgba(var(--cp-rgb),0.06)" }}
                        >
                          <Pause className="w-4 h-4" />
                          Pausar
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <button
                    type="button" onClick={() => startLiveSession(item)}
                    className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                    style={{ border: "1.5px solid var(--cp-500)", color: "var(--cp-400)", backgroundColor: "rgba(var(--cp-rgb),0.06)" }}
                  >
                    <Flame className="w-4 h-4" />
                    Iniciar sessão
                  </button>
                )}
              </div>
            </div>
          ))
        )}

        {/* Sessões recentes */}
        {sessoes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1 mb-2">Sessões recentes</p>
            <div className="rounded-2xl border border-white/8 overflow-hidden">
              {sessoes.map((s, idx) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderBottom: idx < sessoes.length - 1 ? "1px solid hsl(var(--foreground) / 0.04)" : "none" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{s.tipo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(s.data_sessao).toLocaleDateString("pt-BR")} · {s.duracao_minutos} min
                      {s.bpm_medio ? ` · ${s.bpm_medio} bpm` : ""}
                    </p>
                    {s.esforco && (
                      <span
                        className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md mt-1"
                        style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)", color: "var(--cp-400)" }}
                      >
                        {ESFORCO_OPTIONS.find((o) => o.value === s.esforco)?.label ?? s.esforco}
                      </span>
                    )}
                  </div>
                  {s.kcal_estimado != null && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Flame className="w-3.5 h-3.5" style={{ color: "var(--cp-400)" }} />
                      <span className="text-sm font-bold" style={{ color: "var(--cp-400)" }}>{s.kcal_estimado} kcal</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentCardio;
