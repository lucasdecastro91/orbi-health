import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, Upload, Check, Loader2,
  X, AlertTriangle, ClipboardList,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
type TipoCampo = "text" | "textarea" | "number" | "radio" | "checkbox" | "file";

interface Opcao   { label: string; value: string }
interface Config  { min?: number; max?: number; multiple?: boolean; accept?: string }

interface Campo {
  id: string;
  secao_id: string | null;
  tipo: TipoCampo;
  label: string;
  obrigatorio: boolean;
  opcoes: Opcao[] | null;
  config: Config | null;
  ordem: number;
}

interface Secao {
  id: string;
  titulo: string;
  instrucao: string | null;
  campos: Campo[];
}

interface FormDef {
  id: string;
  titulo: string;
  aviso_final: string | null;
  camposIniciais: Campo[];
  secoes: Secao[];
}

// ─── Slots padrão (fallback quando org não tem configuração) ──
const DEFAULT_SLOTS = [
  { key: "front",      label: "Frente"    },
  { key: "side_left",  label: "Lado E."   },
  { key: "side_right", label: "Lado D."   },
  { key: "back",       label: "Costas"    },
  { key: "free",       label: "Livre"     },
];

// ─── Component ────────────────────────────────────────────────
const Atualizacao = () => {
  const { orgId } = useTenantContext();
  const { toast } = useToast();

  const [form,       setForm]       = useState<FormDef | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [evoSlots,   setEvoSlots]   = useState<{ key: string; label: string }[]>(DEFAULT_SLOTS);
  // slotFiles: chave = slot_key, valor = File selecionado para aquele slot
  const [slotFiles,  setSlotFiles]  = useState<Record<string, File | null>>({});
  const [step,       setStep]       = useState(0);       // 0 = inicial, 1..N = seções
  const [values,     setValues]     = useState<Record<string, string>>({});
  const [fileValues, setFileValues] = useState<Record<string, File[]>>({});
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [submitting,   setSubmitting]   = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [treinadorId,  setTreinadorId]  = useState<string | null>(null);
  const [alunoRecId,   setAlunoRecId]   = useState<string | null>(null);
  const [alunoNome,    setAlunoNome]    = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (orgId) loadForm(); }, [orgId]);
  useEffect(() => { topRef.current?.scrollIntoView({ behavior: "smooth" }); }, [step]);

  // ── Carregar form ────────────────────────────────────────────
  const loadForm = async () => {
    try {
      // Carrega dados do aluno para notificação
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const [alunoRes, profileRes] = await Promise.all([
          supabase.from("alunos").select("id, treinador_id").eq("user_id", session.user.id).maybeSingle(),
          supabase.from("profiles").select("nome").eq("id", session.user.id).maybeSingle(),
        ]);
        if (alunoRes.data?.treinador_id) setTreinadorId(alunoRes.data.treinador_id);
        if (alunoRes.data?.id) setAlunoRecId(alunoRes.data.id);
        if (profileRes.data?.nome) setAlunoNome(profileRes.data.nome);
      }

      // Carrega slots configurados pela org
      const { data: slotsData } = await supabase
        .from("evolution_photo_slots")
        .select("slot_key, label, ordem")
        .eq("org_id", orgId ?? "")
        .order("ordem", { ascending: true });
      if (slotsData && slotsData.length > 0) {
        setEvoSlots(slotsData.map(s => ({ key: s.slot_key, label: s.label })));
      }
      const { data: formData, error } = await supabase
        .from("atualizacao_forms")
        .select(`
          id, titulo, aviso_final,
          atualizacao_form_secoes (id, titulo, instrucao, ordem),
          atualizacao_form_campos (id, secao_id, tipo, label, obrigatorio, opcoes, config, ordem)
        `)
        .eq("org_id", orgId)
        .eq("ativo", true)
        .maybeSingle();

      if (error) throw error;
      if (!formData) { setLoading(false); return; }

      const campos  = (formData.atualizacao_form_campos as Campo[])
        .sort((a, b) => a.ordem - b.ordem);
      const secoes  = (formData.atualizacao_form_secoes as Omit<Secao, "campos">[])
        .sort((a, b) => a.ordem - b.ordem)
        .map(s => ({ ...s, campos: campos.filter(c => c.secao_id === s.id) }));

      setForm({
        id:              formData.id,
        titulo:          formData.titulo,
        aviso_final:     formData.aviso_final,
        camposIniciais:  campos.filter(c => c.secao_id === null),
        secoes,
      });
    } catch (e: any) {
      toast({ title: "Erro ao carregar formulário", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Campos do step atual ─────────────────────────────────────
  const currentCampos = (): Campo[] => {
    if (!form) return [];
    if (step === 0) return form.camposIniciais;
    return form.secoes[step - 1]?.campos ?? [];
  };

  const totalSteps = form ? 1 + form.secoes.length : 1; // 0..secoes.length

  // ── Validação ────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (const c of currentCampos()) {
      if (!c.obrigatorio) continue;
      if (c.tipo === "file") {
        // Campo de fotos por slot: verifica se tem ao menos uma foto
        const isPhotoSlot = c.config?.multiple || (c.config?.accept ?? "").includes("image");
        const hasSlotPhoto = isPhotoSlot && Object.values(slotFiles).some(f => f !== null);
        if (isPhotoSlot) {
          if (!hasSlotPhoto) errs[c.id] = "Envie ao menos uma foto";
        } else if (!fileValues[c.id]?.length) errs[c.id] = "Obrigatório";
      } else if (c.tipo === "checkbox") {
        const v = values[c.id];
        if (!v) errs[c.id] = "Selecione ao menos uma opção";
      } else {
        if (!values[c.id]?.trim()) errs[c.id] = "Obrigatório";
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const nextStep = () => {
    if (!validate()) return;
    setErrors({});
    setStep(s => s + 1);
  };
  const prevStep = () => { setErrors({}); setStep(s => s - 1); };

  // ── Set valor ────────────────────────────────────────────────
  const setVal = (campoId: string, val: string) => {
    setValues(v => ({ ...v, [campoId]: val }));
    if (errors[campoId]) setErrors(e => { const n = { ...e }; delete n[campoId]; return n; });
  };

  const toggleCheckbox = (campoId: string, opcaoValue: string) => {
    const current = values[campoId] ? JSON.parse(values[campoId]) as string[] : [];
    const next = current.includes(opcaoValue)
      ? current.filter(v => v !== opcaoValue)
      : [...current, opcaoValue];
    setVal(campoId, JSON.stringify(next));
  };

  // ── Upload ───────────────────────────────────────────────────
  const handleFileChange = (campoId: string, files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setFileValues(v => ({ ...v, [campoId]: arr }));
    if (errors[campoId]) setErrors(e => { const n = { ...e }; delete n[campoId]; return n; });
  };

  const removeFile = (campoId: string, idx: number) => {
    setFileValues(v => {
      const arr = [...(v[campoId] ?? [])];
      arr.splice(idx, 1);
      return { ...v, [campoId]: arr };
    });
  };

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate() || !form) return;
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Faça login novamente.");

      const respostaId = crypto.randomUUID();

      // 1. Criar resposta
      const { error: respErr } = await supabase.from("atualizacao_respostas").insert({
        id: respostaId, form_id: form.id,
        student_id: session.user.id, org_id: orgId,
      });
      if (respErr) throw respErr;

      // 2. Upload de arquivos (campo genérico não-imagem)
      const todosArquivos: { campo_id: string; file: File }[] = [];
      for (const campo of [...form.camposIniciais, ...form.secoes.flatMap(s => s.campos)]) {
        const isPhotoSlot = campo.tipo === "file" && (campo.config?.multiple || (campo.config?.accept ?? "").includes("image"));
        if (campo.tipo === "file" && !isPhotoSlot && fileValues[campo.id]?.length) {
          for (const file of fileValues[campo.id]) {
            todosArquivos.push({ campo_id: campo.id, file });
          }
        }
      }

      for (const { campo_id, file } of todosArquivos) {
        const path = `${session.user.id}/${respostaId}/${campo_id}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("atualizacoes")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        await supabase.from("atualizacao_resposta_arquivos").insert({
          resposta_id: respostaId, campo_id,
          storage_path: path, nome_original: file.name,
          mime_type: file.type, tamanho: file.size,
        });
      }

      // 2b. Upload de fotos por slot — paralelo para reduzir tempo de envio
      const EVOLUTION_BUCKET = "evolution-photos";
      const today = new Date().toISOString().split("T")[0];
      const campoFotoId = [...form.camposIniciais, ...form.secoes.flatMap(s => s.campos)]
        .find(c => c.tipo === "file" && (c.config?.multiple || (c.config?.accept ?? "").includes("image")))?.id ?? "fotos";

      const slotsComFoto = evoSlots.filter(slot => !!slotFiles[slot.key]);
      await Promise.all(slotsComFoto.map(async (slot) => {
        const file = slotFiles[slot.key]!;
        const ext     = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const atuPath = `${session.user.id}/${respostaId}/${campoFotoId}/${slot.key}_${Date.now()}.${ext}`;
        const evoPath = `${orgId}/${session.user.id}/${today}_${slot.key}.${ext}`;

        // Salva no bucket de atualizações (registro original)
        try {
          const { error: atuErr } = await supabase.storage
            .from("atualizacoes")
            .upload(atuPath, file, { contentType: file.type, upsert: false });
          if (!atuErr) {
            await supabase.from("atualizacao_resposta_arquivos").insert({
              resposta_id: respostaId, campo_id: campoFotoId,
              storage_path: atuPath, nome_original: `${slot.label}.${ext}`,
              mime_type: file.type, tamanho: file.size,
            });
          }
        } catch { /* falha silenciosa por slot — não bloqueia os demais */ }

        // Salva na Evolução com o slot correspondente
        try {
          const { error: evoUpErr } = await supabase.storage
            .from(EVOLUTION_BUCKET)
            .upload(evoPath, file, { upsert: true, contentType: file.type });
          if (!evoUpErr) {
            await supabase.from("evolution_photos").upsert({
              student_id:   session.user.id,
              org_id:       orgId,
              slot:         slot.key,
              storage_path: evoPath,
              taken_at:     today,
            }, { onConflict: "student_id,org_id,slot,taken_at" });
          }
        } catch { /* falha silenciosa por slot */ }
      }));

      // 3. Inserir valores
      const todosCampos = [...form.camposIniciais, ...form.secoes.flatMap(s => s.campos)];
      const inserts = todosCampos
        .filter(c => c.tipo !== "file")
        .map(c => {
          const raw = values[c.id] ?? "";
          if (c.tipo === "number") return { resposta_id: respostaId, campo_id: c.id, valor_numero: parseFloat(raw) || null };
          if (c.tipo === "checkbox") return { resposta_id: respostaId, campo_id: c.id, valor_opcoes: JSON.parse(raw || "[]") };
          return { resposta_id: respostaId, campo_id: c.id, valor_texto: raw };
        });

      if (inserts.length) {
        const { error: valErr } = await supabase.from("atualizacao_resposta_valores").insert(inserts);
        if (valErr) throw valErr;
      }

      // ── AJUSTE 3: espelha peso na tela de Evolução ──────────────
      // (fotos já foram espelhadas no bloco 2b acima via slotFiles)
      try {
        const todosOsCampos = [...form.camposIniciais, ...form.secoes.flatMap(s => s.campos)];
        const campoPeso = todosOsCampos.find(
          c => c.tipo === "number" && c.label.toLowerCase().includes("peso")
        );
        if (campoPeso && values[campoPeso.id]) {
          const pesoNum = parseFloat(values[campoPeso.id]);
          if (!isNaN(pesoNum) && pesoNum > 0) {
            await supabase.from("registros_evolucao").upsert({
              student_id:    session.user.id,
              org_id:        orgId,
              data_registro: today,
              peso_kg:       pesoNum,
            }, { onConflict: "student_id,data_registro" });
          }
        }
      } catch { /* falha silenciosa — não bloqueia o submit principal */ }
      // ─────────────────────────────────────────────────────────────

      // 4. Notificar treinador (silencioso — não bloqueia o submit)
      if (treinadorId) {
        void (async () => {
          try {
            await supabase.from("notificacoes").insert({
              user_id:    treinadorId,
              org_id:     orgId,
              aluno_id:   alunoRecId,
              aluno_nome: alunoNome,
              titulo:     "Nova atualização recebida",
              mensagem:   `${alunoNome ?? "Um aluno"} enviou uma nova atualização.`,
              tipo:       "atualizacao",
            });
          } catch { /* silencioso */ }
        })();
      }

      setSubmitted(true);
    } catch (e: any) {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────

  const renderCampo = (c: Campo) => {
    const err = errors[c.id];
    const inputBase = "w-full rounded-xl border px-3 py-2.5 text-sm bg-white/5 text-white placeholder:text-white/30 outline-none transition focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30";
    const borderColor = err ? "border-red-500/60" : "border-white/10";

    return (
      <div key={c.id} className="space-y-1.5">
        <label className="block text-sm text-white/85 leading-snug">
          {c.label}
          {c.obrigatorio && <span className="text-amber-500 ml-1">*</span>}
        </label>

        {/* Text */}
        {c.tipo === "text" && (
          <input
            type="text"
            value={values[c.id] ?? ""}
            onChange={e => setVal(c.id, e.target.value)}
            className={`${inputBase} ${borderColor} h-11`}
          />
        )}

        {/* Textarea */}
        {c.tipo === "textarea" && (
          <textarea
            value={values[c.id] ?? ""}
            onChange={e => setVal(c.id, e.target.value)}
            rows={4}
            className={`${inputBase} ${borderColor} resize-none leading-relaxed`}
          />
        )}

        {/* Number */}
        {c.tipo === "number" && (
          <input
            type="number"
            value={values[c.id] ?? ""}
            onChange={e => setVal(c.id, e.target.value)}
            min={c.config?.min}
            max={c.config?.max}
            className={`${inputBase} ${borderColor} h-11`}
          />
        )}

        {/* Radio */}
        {c.tipo === "radio" && (
          <div className="space-y-2 pt-0.5">
            {(c.opcoes ?? []).map(op => {
              const sel = values[c.id] === op.value;
              return (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setVal(c.id, op.value)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm transition-all"
                  style={{
                    borderColor: sel ? "rgba(var(--cp-rgb),0.6)" : "rgba(255,255,255,0.08)",
                    backgroundColor: sel ? "rgba(var(--cp-rgb),0.1)" : "rgba(255,255,255,0.03)",
                    color: sel ? "var(--cp-400)" : "rgba(255,255,255,0.75)",
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                    style={{ borderColor: sel ? "var(--cp-500)" : "rgba(255,255,255,0.25)" }}
                  >
                    {sel && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--cp-500)" }} />}
                  </div>
                  {op.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Checkbox */}
        {c.tipo === "checkbox" && (
          <div className="space-y-2 pt-0.5">
            {(c.opcoes ?? []).map(op => {
              const checked = (values[c.id] ? JSON.parse(values[c.id]) as string[] : []).includes(op.value);
              return (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => toggleCheckbox(c.id, op.value)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left text-sm transition-all"
                  style={{
                    borderColor: checked ? "rgba(var(--cp-rgb),0.6)" : "rgba(255,255,255,0.08)",
                    backgroundColor: checked ? "rgba(var(--cp-rgb),0.1)" : "rgba(255,255,255,0.03)",
                    color: checked ? "var(--cp-400)" : "rgba(255,255,255,0.75)",
                  }}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center shrink-0 border-2"
                    style={{ borderColor: checked ? "var(--cp-500)" : "rgba(255,255,255,0.25)", backgroundColor: checked ? "var(--cp-500)" : "transparent" }}
                  >
                    {checked && <Check className="w-2.5 h-2.5 text-black" />}
                  </div>
                  {op.label}
                </button>
              );
            })}
          </div>
        )}

        {/* File — fotos por slot */}
        {c.tipo === "file" && (c.config?.multiple || (c.config?.accept ?? "").includes("image")) && (
          <div>
            <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${Math.min(evoSlots.length, 5)}, 1fr)` }}>
              {evoSlots.map(slot => {
                const file = slotFiles[slot.key] ?? null;
                const previewUrl = file ? URL.createObjectURL(file) : null;
                return (
                  <label key={slot.key} className="flex flex-col items-center gap-1.5 cursor-pointer group">
                    <div
                      className="w-full aspect-square rounded-xl overflow-hidden relative"
                      style={{
                        backgroundColor: file ? undefined : "rgba(255,255,255,0.05)",
                        border: `1px solid ${file ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >
                      {previewUrl ? (
                        <img src={previewUrl} alt={slot.label} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Upload className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors" />
                        </div>
                      )}
                      {file && (
                        <button
                          type="button"
                          onClick={e => { e.preventDefault(); setSlotFiles(v => ({ ...v, [slot.key]: null })); }}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      )}
                    </div>
                    <span className="text-[9px] text-white/40 font-medium text-center leading-tight">{slot.label}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) setSlotFiles(v => ({ ...v, [slot.key]: f }));
                        e.target.value = "";
                      }}
                    />
                  </label>
                );
              })}
            </div>
            {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
          </div>
        )}

        {/* File — campo genérico (não-imagem) */}
        {c.tipo === "file" && !c.config?.multiple && !(c.config?.accept ?? "").includes("image") && (
          <div>
            <label
              className="flex flex-col items-center gap-2 w-full py-5 rounded-xl border-2 border-dashed cursor-pointer transition-colors"
              style={{
                borderColor: err ? "rgba(239,68,68,0.5)" : "var(--border-subtle)",
                backgroundColor: "var(--surface-2)",
              }}
            >
              <Upload className="w-6 h-6" style={{ color: "var(--cp-400)", opacity: 0.7 }} />
              <span className="text-sm" style={{ color: "var(--text-mid)" }}>Toque para selecionar arquivo</span>
              <input
                type="file"
                accept={c.config?.accept ?? "*"}
                className="hidden"
                onChange={e => handleFileChange(c.id, e.target.files)}
              />
            </label>
            {fileValues[c.id]?.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {fileValues[c.id].map((f, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
                    <div className="h-16 flex items-center justify-center text-xs text-white/50 px-2 text-center">{f.name}</div>
                    <button
                      type="button"
                      onClick={() => removeFile(c.id, i)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {err && <p className="text-xs text-red-400 mt-0.5">{err}</p>}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="px-4 py-12 text-center space-y-3">
        <ClipboardList className="w-10 h-10 mx-auto text-white/20" />
        <p className="text-white/50 text-sm">Nenhum formulário de atualização configurado ainda.</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Sucesso
  // ─────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="px-4 py-12 flex flex-col items-center gap-5 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, hsl(142 72% 46%), hsl(142 72% 36%))" }}
        >
          <Check className="w-8 h-8 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-1">Atualização enviada!</h2>
          <p className="text-sm text-white/50">Seu treinador já pode visualizar suas respostas.</p>
        </div>
        {form.aviso_final && (
          <div
            className="w-full text-left rounded-2xl p-4 text-sm leading-relaxed"
            style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "rgba(253,230,138,0.85)" }}
          >
            {form.aviso_final}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Formulário multi-step
  // ─────────────────────────────────────────────────────────────
  const isLastStep  = step === form.secoes.length;
  const secaoAtual  = step === 0 ? null : form.secoes[step - 1];
  const camposAtuais = currentCampos();

  return (
    <div ref={topRef} className="px-4 py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-white">{form.titulo}</h1>

        {/* Progress */}
        <div className="mt-3 flex items-center gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                backgroundColor: i <= step
                  ? "var(--cp-500)"
                  : "rgba(255,255,255,0.1)",
              }}
            />
          ))}
        </div>
        <p className="text-xs text-white/40 mt-1.5">
          {step === 0 ? "Informações iniciais" : secaoAtual?.titulo} · Etapa {step + 1} de {totalSteps}
        </p>
      </div>

      {/* Instrução da seção */}
      {secaoAtual?.instrucao && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)", color: "var(--cp-400)" }}
        >
          {secaoAtual.instrucao}
        </div>
      )}

      {/* Campos */}
      <div className="space-y-5">
        {camposAtuais.map(c => renderCampo(c))}
      </div>

      {/* Aviso final (último step) */}
      {isLastStep && form.aviso_final && (
        <div
          className="rounded-2xl p-4 text-sm leading-relaxed flex gap-3"
          style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "rgba(253,230,138,0.85)" }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
          <span>{form.aviso_final}</span>
        </div>
      )}

      {/* Erros gerais */}
      {Object.keys(errors).length > 0 && (
        <p className="text-xs text-red-400">Preencha todos os campos obrigatórios antes de continuar.</p>
      )}

      {/* Navegação */}
      <div className="flex gap-3 pt-2 pb-6">
        {step > 0 && (
          <button
            onClick={prevStep}
            className="flex items-center gap-1.5 px-5 h-11 rounded-xl border text-sm font-medium text-white/70 transition-colors"
            style={{ borderColor: "rgba(255,255,255,0.1)", backgroundColor: "rgba(255,255,255,0.04)" }}
          >
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
        )}

        {!isLastStep ? (
          <button
            onClick={nextStep}
            className="flex-1 flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))", color: "#ffffff" }}
          >
            Próximo <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))", color: "#ffffff" }}
          >
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</> : <><Check className="w-4 h-4" /> Enviar Atualização</>}
          </button>
        )}
      </div>
    </div>
  );
};

export default Atualizacao;
