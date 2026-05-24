import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, ChevronUp, ChevronDown,
  Save, ScanLine, Loader2, Check, RotateCcw,
  Bold, Italic, Underline, Link, X as XIcon, AlignLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
interface TesteEdit {
  _id:         string;
  label:       string;
  emoji:       string;
  numFotos:    number;       // 1 ou 2
  photoLabels: string[];     // length = numFotos
  instrucoes:  string[];
}

const uid = () => crypto.randomUUID();

const newTeste = (): TesteEdit => ({
  _id: uid(), label: "", emoji: "", numFotos: 1,
  photoLabels: [""], instrucoes: [""],
});

// ── Defaults (espelham o hardcode do app do aluno) ────────────
const DEFAULT_TESTES: Omit<TesteEdit, "_id">[] = [
  {
    label: "Frontal", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Deixe os braços relaxados ao lado do corpo — não force nenhuma postura",
      "Olhar para frente em direção ao horizonte",
      "Pés no afastamento ideal (largura da Espinha Ilíaca Antero Superior)",
      "Nivele a câmera e aponte-a para a cicatriz umbilical",
    ],
  },
  {
    label: "Costas", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Deixe os braços relaxados ao lado do corpo — não force nenhuma postura",
      "Olhar para frente em direção ao horizonte",
      "Pés no afastamento ideal",
      "Nivele a câmera e aponte-a para o meio das costas",
    ],
  },
  {
    label: "Perfil Esquerdo e Direito", emoji: "", numFotos: 2,
    photoLabels: ["Perfil Esquerdo", "Perfil Direito"],
    instrucoes: [
      "Deixe os braços relaxados ao lado do corpo — não force nenhuma postura",
      "Olhar para frente em direção ao horizonte",
      "Pés no afastamento ideal",
      "Nivele a câmera e aponte-a para o centro da barriga",
    ],
  },
  {
    label: "Ombros em Máxima Flexão", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Eleve os ombros em máxima flexão (braços apontando para cima)",
      "Olhar para frente em direção ao horizonte",
      "Pés no afastamento ideal",
      "Nivele a câmera e aponte-a para o centro da barriga",
    ],
  },
  {
    label: "Apoio Unipodal Esquerdo e Direito", emoji: "", numFotos: 2,
    photoLabels: ["Pé Esquerdo", "Pé Direito"],
    instrucoes: [
      "Deixe os braços relaxados ao lado do corpo — não force nenhuma postura",
      "Olhar para frente em direção ao horizonte",
      "Flexione o joelho livre a 90°",
      "Nivele a câmera e aponte-a para a cicatriz umbilical",
    ],
  },
  {
    label: "Agachamento de Perfil", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Mantenha os pés na largura dos ombros, levemente abduzidos",
      "Estenda os braços horizontalmente à frente do corpo (altura dos ombros)",
      "Desça o agachamento o máximo possível e pare",
      "Tire a foto nessa posição",
    ],
  },
  {
    label: "Agachamento de Costas", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera atrás do indivíduo",
      "Mantenha os pés na largura dos ombros, levemente abduzidos",
      "Mantenha as mãos atrás do corpo",
      "Desça o agachamento o máximo possível e pare",
      "Tire a foto nessa posição",
    ],
  },
  {
    label: "Ajoelhado de Perfil", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Ajoelhe-se sobre um joelho (posição de ajoelhado)",
      "Estenda os braços horizontalmente à frente do corpo (altura dos ombros)",
      "Tire a foto nessa posição",
    ],
  },
  {
    label: "Flexão de Quadril em Decúbito Dorsal", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Deite-se de costas (decúbito dorsal) com o corpo totalmente alinhado ao solo",
      "Posicione a câmera de perfil ao nível do solo",
      "Mantenha uma perna estendida e apoiada no chão",
      "Eleve a outra perna com o joelho estendido o máximo possível",
      "Tire a foto no limite da amplitude",
    ],
  },
  {
    label: "Sentar e Alcançar Adaptado", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Sente com as pernas estendidas e juntas",
      "Incline o tronco para frente estendendo os braços em direção aos pés",
      "Ao chegar no limite, tire a foto",
    ],
  },
  {
    label: "Flexão da Coluna", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Em pé, com os pés levemente afastados",
      "Incline o tronco para baixo tentando alcançar a ponta dos pés",
      "Mantenha os joelhos estendidos",
      "Ao chegar no limite, tire a foto",
    ],
  },
];

// ─── Component ────────────────────────────────────────────────
const PosturalEvalBuilder = () => {
  const { orgId } = useTenantContext();
  const { toast } = useToast();

  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [testes,      setTestes]      = useState<TesteEdit[]>([]);
  const [collapsed,   setCollapsed]   = useState<Set<string>>(new Set());
  const [introLoaded, setIntroLoaded] = useState(false);

  const introRef  = useRef<HTMLDivElement>(null);
  const introHtml = useRef<string>("");

  // Sync innerHTML after load
  useEffect(() => {
    if (introLoaded && introRef.current) {
      introRef.current.innerHTML = introHtml.current;
    }
  }, [introLoaded]);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  // ── Load ─────────────────────────────────────────────────────
  const load = async () => {
    try {
      const { data } = await (supabase as any)
        .from("avaliacao_postural_config")
        .select("introducao, testes")
        .eq("org_id", orgId)
        .maybeSingle();

      introHtml.current = data?.introducao ?? "";
      setIntroLoaded(true);

      if (data?.testes && Array.isArray(data.testes) && data.testes.length > 0) {
        setTestes((data.testes as any[]).map((t: any): TesteEdit => ({
          _id:         t.id   ?? uid(),
          label:       t.label       ?? "",
          emoji:       t.emoji       ?? "📸",
          numFotos:    t.numFotos    ?? 1,
          photoLabels: t.photoLabels ?? [""],
          instrucoes:  t.instrucoes  ?? [""],
        })));
      } else {
        resetToDefaults();
      }
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () =>
    setTestes(DEFAULT_TESTES.map(t => ({ ...t, _id: uid() })));

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = testes.map(t => ({
        id:          t._id,
        label:       t.label,
        emoji:       t.emoji,
        numFotos:    t.numFotos,
        photoLabels: t.photoLabels,
        instrucoes:  t.instrucoes.filter(i => i.trim() !== ""),
      }));

      const { error } = await (supabase as any)
        .from("avaliacao_postural_config")
        .upsert(
          { org_id: orgId, testes: payload, introducao: introHtml.current || null },
          { onConflict: "org_id" },
        );

      if (error) throw error;
      toast({ title: "Avaliação postural salva!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────
  const toggleCollapse = (id: string) =>
    setCollapsed(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const moveTeste = (i: number, dir: -1 | 1) =>
    setTestes(ts => { const n = [...ts]; [n[i], n[i + dir]] = [n[i + dir], n[i]]; return n; });

  const removeTeste = (i: number) =>
    setTestes(ts => ts.filter((_, j) => j !== i));

  const updateTeste = (i: number, patch: Partial<TesteEdit>) =>
    setTestes(ts => ts.map((t, j) => j === i ? { ...t, ...patch } : t));

  const setNumFotos = (i: number, n: number) => {
    const t = testes[i];
    const labels = n === 2
      ? [t.photoLabels[0] ?? "", t.photoLabels[1] ?? ""]
      : [t.photoLabels[0] ?? ""];
    updateTeste(i, { numFotos: n, photoLabels: labels });
  };

  const addInstrucao = (ti: number) =>
    updateTeste(ti, { instrucoes: [...testes[ti].instrucoes, ""] });

  const updateInstrucao = (ti: number, ii: number, val: string) =>
    updateTeste(ti, { instrucoes: testes[ti].instrucoes.map((x, j) => j === ii ? val : x) });

  const removeInstrucao = (ti: number, ii: number) =>
    updateTeste(ti, { instrucoes: testes[ti].instrucoes.filter((_, j) => j !== ii) });

  const moveInstrucao = (ti: number, ii: number, dir: -1 | 1) =>
    updateTeste(ti, {
      instrucoes: (() => {
        const n = [...testes[ti].instrucoes];
        [n[ii], n[ii + dir]] = [n[ii + dir], n[ii]];
        return n;
      })(),
    });

  // Toolbar helper for intro editor
  const execIntro = (cmd: string, val?: string) => {
    introRef.current?.focus();
    document.execCommand(cmd, false, val);
    introHtml.current = introRef.current?.innerHTML ?? "";
  };

  // ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-white/30" />
    </div>
  );

  const totalFotos = testes.reduce((s, t) => s + t.numFotos, 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
          <h1 className="text-lg font-bold text-white">Avaliação Postural</h1>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
            {testes.length} teste{testes.length !== 1 ? "s" : ""} · {totalFotos} foto{totalFotos !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={resetToDefaults} title="Restaurar padrões"
            className="flex items-center gap-1.5 px-3 h-9 rounded-xl text-xs font-medium transition-colors"
            style={{ border: "1px solid var(--cp-500)", color: "var(--cp-500)", backgroundColor: "transparent" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--btn-soft-bg)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}>
            <RotateCcw className="w-3.5 h-3.5" /> Restaurar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 h-9 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))", color: "#ffffff" }}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-xl border border-white/8 px-4 py-3 text-xs text-white/45 leading-relaxed"
        style={{ backgroundColor: "var(--section-card-bg)" }}>
        Configure a descrição inicial e os testes funcionais que o aluno verá ao realizar a avaliação postural. A ordem aqui é a ordem que aparece no app.
      </div>

      {/* ── Editor de introdução ────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "var(--section-card-border)", backgroundColor: "var(--section-card-bg)" }}>
        <div className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--section-header-border)", backgroundColor: "var(--section-header-bg)" }}>
          <AlignLeft className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
          <span className="text-sm font-semibold text-white flex-1">Instruções iniciais</span>
          <span className="text-xs text-white/35">Mostradas antes dos testes</span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2"
          style={{ borderBottom: "1px solid var(--section-header-border)", backgroundColor: "var(--section-header-bg)" }}>
          {[
            { icon: Bold,      cmd: "bold"      },
            { icon: Italic,    cmd: "italic"    },
            { icon: Underline, cmd: "underline" },
          ].map(({ icon: Icon, cmd }) => (
            <button key={cmd} type="button"
              onMouseDown={e => { e.preventDefault(); execIntro(cmd); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: "var(--btn-ghost-color)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--ui-inactive-bg)"; (e.currentTarget as HTMLElement).style.color = "hsl(var(--foreground))"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--btn-ghost-color)"; }}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
          <div className="w-px h-4 mx-1" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          <button type="button"
            onMouseDown={e => { e.preventDefault(); const url = window.prompt("URL:"); if (url) execIntro("createLink", url); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
          >
            <Link className="w-3.5 h-3.5" />
          </button>
          <button type="button"
            onMouseDown={e => { e.preventDefault(); execIntro("removeFormat"); execIntro("unlink"); }}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          ref={introRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => { introHtml.current = introRef.current?.innerHTML ?? ""; }}
          className="min-h-[120px] px-4 py-3 text-sm text-white/80 outline-none leading-relaxed"
          style={{ caretColor: "var(--cp-400)" }}
          data-placeholder="Descreva as instruções gerais da avaliação (vestuário, como se posicionar, etc.)..."
        />
        <style>{`[data-placeholder]:empty::before { content: attr(data-placeholder); color: rgba(255,255,255,0.2); pointer-events: none; }`}</style>
      </div>

      {/* ── Testes ──────────────────────────────────────────── */}
      <div className="space-y-3">
        {testes.map((t, ti) => {
          const isCollapsed = collapsed.has(t._id);
          return (
            <div key={t._id} className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "var(--section-card-border)", backgroundColor: "var(--section-card-bg)" }}>

              {/* Cabeçalho do teste */}
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: isCollapsed ? "none" : "1px solid var(--section-header-border)", backgroundColor: "var(--section-header-bg)" }}>
                <button onClick={() => toggleCollapse(t._id)} className="shrink-0 text-white/30 hover:text-white/70">
                  <ChevronDown className="w-4 h-4 transition-transform duration-200"
                    style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }} />
                </button>
                <span className="text-[10px] font-bold uppercase tracking-widest shrink-0" style={{ color: "var(--cp-400)" }}>
                  Teste {ti + 1}
                </span>
                {/* Label */}
                <input
                  value={t.label}
                  onChange={e => updateTeste(ti, { label: e.target.value })}
                  placeholder="Nome do teste..."
                  className="flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/25"
                />
                <span className="text-[10px] text-white/25 shrink-0">{t.numFotos} foto{t.numFotos !== 1 ? "s" : ""}</span>
                <button onClick={() => moveTeste(ti, -1)} disabled={ti === 0} className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => moveTeste(ti, 1)} disabled={ti === testes.length - 1} className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20"><ChevronDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => removeTeste(ti)} className="p-1 rounded text-red-400/40 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>

              {!isCollapsed && (
                <div className="p-4 space-y-4">

                  {/* Número de fotos */}
                  <div>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Número de fotos</p>
                    <div className="flex gap-2">
                      {[1, 2].map(n => (
                        <button key={n} type="button" onClick={() => setNumFotos(ti, n)}
                          className="px-4 h-9 rounded-xl text-sm font-medium transition-all"
                          style={{
                            backgroundColor: t.numFotos === n ? "rgba(var(--cp-rgb),0.15)" : "var(--ui-inactive-bg)",
                            border: `1.5px solid ${t.numFotos === n ? "var(--cp-500)" : "var(--ui-inactive-border)"}`,
                            color: t.numFotos === n ? "var(--cp-400)" : "var(--ui-inactive-color)",
                          }}>
                          {n} foto{n > 1 ? "s" : ""}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Labels das fotos (quando 2 fotos) */}
                  {t.numFotos === 2 && (
                    <div className="grid grid-cols-2 gap-2">
                      {[0, 1].map(pi => (
                        <div key={pi}>
                          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Rótulo foto {pi + 1}</p>
                          <input
                            value={t.photoLabels[pi] ?? ""}
                            onChange={e => {
                              const labels = [...t.photoLabels];
                              labels[pi] = e.target.value;
                              updateTeste(ti, { photoLabels: labels });
                            }}
                            placeholder={pi === 0 ? "Ex: Perfil Esquerdo" : "Ex: Perfil Direito"}
                            className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-amber-500/40"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Instruções */}
                  <div>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Instruções</p>
                    <div className="space-y-1.5">
                      {t.instrucoes.map((inst, ii) => (
                        <div key={ii} className="flex items-center gap-1.5">
                          <span className="text-xs text-white/25 w-4 shrink-0">{ii + 1}.</span>
                          <input
                            value={inst}
                            onChange={e => updateInstrucao(ti, ii, e.target.value)}
                            placeholder="Instrução..."
                            className="flex-1 h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-amber-500/40"
                          />
                          <button onClick={() => moveInstrucao(ti, ii, -1)} disabled={ii === 0} className="p-1 text-white/25 hover:text-white/60 disabled:opacity-20"><ChevronUp className="w-3.5 h-3.5" /></button>
                          <button onClick={() => moveInstrucao(ti, ii, 1)} disabled={ii === t.instrucoes.length - 1} className="p-1 text-white/25 hover:text-white/60 disabled:opacity-20"><ChevronDown className="w-3.5 h-3.5" /></button>
                          <button onClick={() => removeInstrucao(ti, ii)} className="p-1 text-red-400/40 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <button onClick={() => addInstrucao(ti)}
                        className="flex items-center gap-1 text-xs mt-1"
                        style={{ color: "var(--cp-400)" }}>
                        <Plus className="w-3 h-3" /> Adicionar instrução
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Adicionar teste */}
      <button onClick={() => setTestes(ts => [...ts, newTeste()])}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed text-sm transition-colors"
        style={{ borderColor: "var(--ui-inactive-border)", color: "var(--ui-inactive-color)" }}>
        <Plus className="w-4 h-4" /> Adicionar teste
      </button>

      {/* Salvar bottom */}
      <button onClick={handleSave} disabled={saving}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))", color: "#ffffff" }}>
        {saving
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          : <><Check className="w-4 h-4" /> Salvar avaliação postural</>
        }
      </button>
    </div>
  );
};

export default PosturalEvalBuilder;
