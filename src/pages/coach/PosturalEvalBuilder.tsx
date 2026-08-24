import { useState, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext, useDraggable, useDroppable, useSensor, useSensors,
  PointerSensor, TouchSensor, pointerWithin, type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, ChevronDown, GripVertical,
  Save, ScanLine, Loader2, Check, RotateCcw,
  X as XIcon, AlignLeft,
  ImagePlus, Youtube,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
interface TesteEdit {
  _id:         string;
  label:       string;
  emoji:       string;
  numFotos:    number;       // 1 ou 2
  photoLabels: string[];     // length = numFotos
  instrucoes:  string[];
  imagens?:    (string | null)[]; // length = numFotos — URL própria da org, sobrepõe o fallback estático
  videoUrl?:   string | null;     // vídeo de demonstração do teste (opcional)
}

// Cada seção vira um card na tela do aluno — `corpo` com mais de 1 linha
// renderiza como lista (uma linha = um item); linha única vira parágrafo.
// `destaque` dá o estilo de aviso (amarelo), usado na primeira seção.
interface IntroSecao {
  _id:      string;
  titulo:   string;
  corpo:    string;
  destaque: boolean;
}

const uid = () => crypto.randomUUID();

const BUCKET = "postural-media";

const newSecao = (): IntroSecao => ({ _id: uid(), titulo: "", corpo: "", destaque: false });

// Espelha o texto que era hardcoded em AvaliacaoPostural.tsx (INSTRUCOES_GERAIS)
// — antes existia só como 4 cards fixos no código, invisíveis e não editáveis
// no construtor. Agora é dado real por org, editável e reordenável.
const DEFAULT_INTRO_SECOES: IntroSecao[] = [
  {
    _id: "aviso", destaque: true, titulo: "Aviso",
    corpo: "É de extrema importância que sejam respeitados todos os critérios do protocolo para que não ocorram falhas na análise. O não cumprimento dos critérios poderá acarretar num planejamento não condizente com seu quadro atual.",
  },
  {
    _id: "vestuario", destaque: false, titulo: "Vestuário",
    corpo: "Homens: fotos de sunga preta (caso não tenha, utilize a cor mais escura possível).\nMulheres: fotos de biquíni preto (caso não tenha, utilize a cor mais escura possível). A alça deve ser fina e não pode bloquear a visão das escápulas. A parte baixa não pode estar desnivelada.",
  },
  {
    _id: "observacoes", destaque: false, titulo: "Observações gerais",
    corpo: "Não force nenhum tipo de postura\nNas fotos de frente, costas, perfil E/D: mantenha os braços relaxados ao lado do corpo\nOs pés devem ficar aproximadamente a um palmo afastados (largura da Espinha Ilíaca Antero Superior)\nOs pés devem estar alinhados — um não pode estar mais à frente que o outro\nOlhar sempre para frente em direção ao horizonte",
  },
  {
    _id: "enquadramento", destaque: false, titulo: "Enquadramento",
    corpo: "As fotos devem estar em perfeito nivelamento. Apoie o celular num tripé ou use o rodapé da parede como referência. Aponte a câmera em direção à cicatriz umbilical.",
  },
];

const newTeste = (): TesteEdit => ({
  _id: uid(), label: "", emoji: "", numFotos: 1,
  photoLabels: [""], instrucoes: [""], imagens: [null], videoUrl: null,
});

// ── Defaults (espelham o hardcode do app do aluno) ────────────
// _id fixo (em vez de crypto.randomUUID()) — precisa bater com as chaves
// hardcoded em AvaliacaoPostural.tsx (TESTES_DEFAULT/RefImage), senão salvar
// aqui quebra o casamento com as fotos de referência estáticas do aluno.
const DEFAULT_TESTES: TesteEdit[] = [
  {
    _id: "frontal", label: "Frontal", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Deixe os braços relaxados ao lado do corpo — não force nenhuma postura",
      "Olhar para frente em direção ao horizonte",
      "Pés no afastamento ideal (largura da Espinha Ilíaca Antero Superior)",
      "Nivele a câmera e aponte-a para a cicatriz umbilical",
    ],
  },
  {
    _id: "costas", label: "Costas", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Deixe os braços relaxados ao lado do corpo — não force nenhuma postura",
      "Olhar para frente em direção ao horizonte",
      "Pés no afastamento ideal",
      "Nivele a câmera e aponte-a para o meio das costas",
    ],
  },
  {
    _id: "perfil", label: "Perfil Esquerdo e Direito", emoji: "", numFotos: 2,
    photoLabels: ["Perfil Esquerdo", "Perfil Direito"],
    instrucoes: [
      "Deixe os braços relaxados ao lado do corpo — não force nenhuma postura",
      "Olhar para frente em direção ao horizonte",
      "Pés no afastamento ideal",
      "Nivele a câmera e aponte-a para o centro da barriga",
    ],
  },
  {
    _id: "perfil_ombros", label: "Ombros em Máxima Flexão", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Eleve os ombros em máxima flexão (braços apontando para cima)",
      "Olhar para frente em direção ao horizonte",
      "Pés no afastamento ideal",
      "Nivele a câmera e aponte-a para o centro da barriga",
    ],
  },
  {
    _id: "unipodal", label: "Apoio Unipodal Esquerdo e Direito", emoji: "", numFotos: 2,
    photoLabels: ["Pé Esquerdo", "Pé Direito"],
    instrucoes: [
      "Deixe os braços relaxados ao lado do corpo — não force nenhuma postura",
      "Olhar para frente em direção ao horizonte",
      "Flexione o joelho livre a 90°",
      "Nivele a câmera e aponte-a para a cicatriz umbilical",
    ],
  },
  {
    _id: "agachamento_perfil", label: "Agachamento de Perfil", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Mantenha os pés na largura dos ombros, levemente abduzidos",
      "Estenda os braços horizontalmente à frente do corpo (altura dos ombros)",
      "Desça o agachamento o máximo possível e pare",
      "Tire a foto nessa posição",
    ],
  },
  {
    _id: "agachamento_costas", label: "Agachamento de Costas", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera atrás do indivíduo",
      "Mantenha os pés na largura dos ombros, levemente abduzidos",
      "Mantenha as mãos atrás do corpo",
      "Desça o agachamento o máximo possível e pare",
      "Tire a foto nessa posição",
    ],
  },
  {
    _id: "ajoelhado", label: "Ajoelhado de Perfil", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Ajoelhe-se sobre um joelho (posição de ajoelhado)",
      "Estenda os braços horizontalmente à frente do corpo (altura dos ombros)",
      "Tire a foto nessa posição",
    ],
  },
  {
    _id: "flexao_quadril", label: "Flexão de Quadril em Decúbito Dorsal", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Deite-se de costas (decúbito dorsal) com o corpo totalmente alinhado ao solo",
      "Posicione a câmera de perfil ao nível do solo",
      "Mantenha uma perna estendida e apoiada no chão",
      "Eleve a outra perna com o joelho estendido o máximo possível",
      "Tire a foto no limite da amplitude",
    ],
  },
  {
    _id: "sentar_alcancar", label: "Sentar e Alcançar Adaptado", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Sente com as pernas estendidas e juntas",
      "Incline o tronco para frente estendendo os braços em direção aos pés",
      "Ao chegar no limite, tire a foto",
    ],
  },
  {
    _id: "flexao_coluna", label: "Flexão da Coluna", emoji: "", numFotos: 1, photoLabels: [""],
    instrucoes: [
      "Posicione a câmera de perfil",
      "Em pé, com os pés levemente afastados",
      "Incline o tronco para baixo tentando alcançar a ponta dos pés",
      "Mantenha os joelhos estendidos",
      "Ao chegar no limite, tire a foto",
    ],
  },
];

// ── DraggableCard — wrapper arrastável/soltável reutilizado por testes E
// seções de introdução. Mesmo padrão já usado em DietManager.tsx (FoodBlock):
// useDraggable + useDroppable no mesmo nó, handle dedicado via render-prop
// (attributes/listeners) pra não roubar clique/seleção de texto dos inputs do card.
const DraggableCard = ({
  id, background, borderColor, children,
}: {
  id: string;
  background?: string;
  borderColor?: string;
  children: (handle: {
    attributes: ReturnType<typeof useDraggable>["attributes"];
    listeners: ReturnType<typeof useDraggable>["listeners"];
  }) => ReactNode;
}) => {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging, transform } = useDraggable({ id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const setRefs = (n: HTMLElement | null) => { setDragRef(n); setDropRef(n); };

  return (
    <div
      ref={setRefs}
      className="rounded-2xl border overflow-hidden transition-colors"
      style={{
        borderColor: isOver ? "var(--cp-500)" : (borderColor ?? "var(--section-card-border)"),
        backgroundColor: background ?? "var(--section-card-bg)",
        boxShadow: "var(--section-card-shadow)",
        opacity: isDragging ? 0.4 : 1,
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
      }}
    >
      {children({ attributes, listeners })}
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────
const PosturalEvalBuilder = () => {
  const { orgId, slug } = useTenantContext();
  const { hasAvaliacaoPostural } = usePlanFeatures();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Feature reservada por org — bloqueia acesso direto por URL se a org não tiver.
  useEffect(() => {
    if (orgId && !hasAvaliacaoPostural) navigate(`/${slug}/treinador`);
  }, [orgId, hasAvaliacaoPostural, slug, navigate]);

  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [testes,      setTestes]      = useState<TesteEdit[]>([]);
  const [secoes,      setSecoes]      = useState<IntroSecao[]>([]);
  const [collapsed,   setCollapsed]   = useState<Set<string>>(new Set());
  // true só quando a org nunca salvou nenhuma configuração — mostra a escolha
  // "Começar do zero" / "Usar modelo padrão" em vez de pré-popular sozinho.
  // Se a org já salvou (mesmo que com 0 testes, de propósito), isso fica false.
  const [neverConfigured, setNeverConfigured] = useState(false);
  // chave da mídia em envio agora (`${testId}:foto:${pi}` ou `${testId}:video`) — só pra loading spinner
  const [uploadingMedia, setUploadingMedia] = useState<string | null>(null);

  useEffect(() => { if (orgId) load(); }, [orgId]);

  // ── Load ─────────────────────────────────────────────────────
  const load = async () => {
    try {
      const { data } = await (supabase as any)
        .from("avaliacao_postural_config")
        .select("introducao_secoes, testes")
        .eq("org_id", orgId)
        .maybeSingle();

      if (!data) {
        // Nunca salvou nada — pergunta como começar, não pré-popula sozinho.
        setNeverConfigured(true);
      } else {
        if (data.introducao_secoes && Array.isArray(data.introducao_secoes) && data.introducao_secoes.length > 0) {
          setSecoes((data.introducao_secoes as any[]).map((s: any): IntroSecao => ({
            _id:      s.id ?? uid(),
            titulo:   s.titulo ?? "",
            corpo:    s.corpo  ?? "",
            destaque: !!s.destaque,
          })));
        }
        if (data.testes && Array.isArray(data.testes) && data.testes.length > 0) {
          setTestes((data.testes as any[]).map((t: any): TesteEdit => ({
            _id:         t.id   ?? uid(),
            label:       t.label       ?? "",
            emoji:       t.emoji       ?? "📸",
            numFotos:    t.numFotos    ?? 1,
            photoLabels: t.photoLabels ?? [""],
            instrucoes:  t.instrucoes  ?? [""],
            imagens:     t.imagens     ?? [],
            videoUrl:    t.videoUrl    ?? null,
          })));
        }
      }
      // else: já salvou antes, mas de propósito com 0 testes — respeita, deixa vazio
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // _id fixo (frontal, costas...) preservado — não gera UUID novo, senão perde
  // o casamento com as fotos de referência estáticas do app do aluno. Também
  // repõe as seções de introdução padrão — "modelo padrão" cobre testes + intro juntos.
  const resetToDefaults = () => {
    setTestes(DEFAULT_TESTES.map(t => ({ ...t })));
    setSecoes(DEFAULT_INTRO_SECOES.map(s => ({ ...s })));
  };

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
        imagens:     t.imagens ?? [],
        videoUrl:    t.videoUrl ?? null,
      }));
      const secoesPayload = secoes.map(s => ({
        id: s._id, titulo: s.titulo, corpo: s.corpo, destaque: s.destaque,
      }));

      const { error } = await (supabase as any)
        .from("avaliacao_postural_config")
        .upsert(
          { org_id: orgId, testes: payload, introducao_secoes: secoesPayload },
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

  const addSecao = () => setSecoes(s => [...s, newSecao()]);
  const removeSecao = (i: number) => setSecoes(s => s.filter((_, j) => j !== i));
  const updateSecao = (i: number, patch: Partial<IntroSecao>) =>
    setSecoes(s => s.map((sec, j) => j === i ? { ...sec, ...patch } : sec));

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleTesteDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setTestes(ts => {
      const de   = ts.findIndex(t => t._id === active.id);
      const para = ts.findIndex(t => t._id === over.id);
      if (de === -1 || para === -1) return ts;
      const next = [...ts];
      const [movido] = next.splice(de, 1);
      next.splice(para, 0, movido);
      return next;
    });
  };

  const handleSecaoDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSecoes(ss => {
      const de   = ss.findIndex(s => s._id === active.id);
      const para = ss.findIndex(s => s._id === over.id);
      if (de === -1 || para === -1) return ss;
      const next = [...ss];
      const [movido] = next.splice(de, 1);
      next.splice(para, 0, movido);
      return next;
    });
  };

  const removeTeste = (i: number) =>
    setTestes(ts => ts.filter((_, j) => j !== i));

  const updateTeste = (i: number, patch: Partial<TesteEdit>) =>
    setTestes(ts => ts.map((t, j) => j === i ? { ...t, ...patch } : t));

  const setNumFotos = (i: number, n: number) => {
    const t = testes[i];
    const labels = n === 2
      ? [t.photoLabels[0] ?? "", t.photoLabels[1] ?? ""]
      : [t.photoLabels[0] ?? ""];
    const imagens = n === 2
      ? [t.imagens?.[0] ?? null, t.imagens?.[1] ?? null]
      : [t.imagens?.[0] ?? null];
    updateTeste(i, { numFotos: n, photoLabels: labels, imagens });
  };

  // Abre o seletor de arquivo nativo sem precisar de um <input> fixo por slot
  // (a lista de testes/fotos é dinâmica — um ref por slot seria mais código à toa).
  const pickFile = (accept: string, onFile: (f: File) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) onFile(f);
    };
    input.click();
  };

  const uploadPhoto = async (ti: number, pi: number, file: File) => {
    if (!orgId) return;
    const testId = testes[ti]._id;
    const key = `${testId}:foto:${pi}`;
    setUploadingMedia(key);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${orgId}/${testId}/foto_${pi}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const imagens = [...(testes[ti].imagens ?? [])];
      imagens[pi] = `${data.publicUrl}?t=${Date.now()}`; // cache-bust: mesma URL, arquivo trocado
      updateTeste(ti, { imagens });
    } catch (e: any) {
      toast({ title: "Erro ao enviar foto", description: e.message, variant: "destructive" });
    } finally {
      setUploadingMedia(null);
    }
  };

  const removePhoto = (ti: number, pi: number) => {
    const imagens = [...(testes[ti].imagens ?? [])];
    imagens[pi] = null;
    updateTeste(ti, { imagens });
  };

  const addInstrucao = (ti: number) =>
    updateTeste(ti, { instrucoes: [...testes[ti].instrucoes, ""] });

  const updateInstrucao = (ti: number, ii: number, val: string) =>
    updateTeste(ti, { instrucoes: testes[ti].instrucoes.map((x, j) => j === ii ? val : x) });

  const removeInstrucao = (ti: number, ii: number) =>
    updateTeste(ti, { instrucoes: testes[ti].instrucoes.filter((_, j) => j !== ii) });

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
        {!neverConfigured && (
          <div className="flex items-center gap-2">
            <button onClick={resetToDefaults} title="Restaurar modelo padrão"
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
        )}
      </div>

      {neverConfigured ? (
        <div className="rounded-2xl border border-dashed p-8 text-center space-y-4"
          style={{ borderColor: "var(--ui-inactive-border)" }}>
          <ScanLine className="w-8 h-8 mx-auto" style={{ color: "var(--cp-400)" }} />
          <div>
            <p className="text-sm font-semibold text-white">Avaliação postural ainda não configurada</p>
            <p className="text-xs text-white/40 mt-1">Escolha como começar — dá pra editar tudo depois. Se você não pretende usar essa avaliação, pode deixar sem nenhum teste.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button onClick={() => setNeverConfigured(false)}
              className="px-4 h-10 rounded-xl text-sm font-medium transition-colors"
              style={{ border: "1px solid var(--ui-inactive-border)", color: "var(--ui-inactive-color)" }}>
              Começar do zero
            </button>
            <button onClick={() => { resetToDefaults(); setNeverConfigured(false); }}
              className="px-4 h-10 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))" }}>
              Usar modelo padrão
            </button>
          </div>
        </div>
      ) : (
      <>
      {/* Info */}
      <div className="rounded-xl border border-white/8 px-4 py-3 text-xs text-white/45 leading-relaxed"
        style={{ backgroundColor: "var(--section-card-bg)" }}>
        Configure a descrição inicial e os testes funcionais que o aluno verá ao realizar a avaliação postural. A ordem aqui é a ordem que aparece no app.
      </div>

      {/* ── Instruções iniciais — uma seção = um card na tela do aluno ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <AlignLeft className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
          <span className="text-sm font-semibold text-white flex-1">Instruções iniciais</span>
          <span className="text-xs text-white/35">Mostradas antes dos testes</span>
        </div>

        <DndContext sensors={dndSensors} collisionDetection={pointerWithin} onDragEnd={handleSecaoDragEnd}>
        {secoes.map((s, si) => (
          <DraggableCard
            key={s._id}
            id={s._id}
            background={s.destaque ? "rgba(234,179,8,0.06)" : undefined}
            borderColor={s.destaque ? "rgba(234,179,8,0.35)" : undefined}
          >
            {({ attributes, listeners }) => (
            <>
            <div className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid var(--section-header-border)", backgroundColor: "var(--section-header-bg)" }}>
              <button
                type="button"
                {...attributes}
                {...listeners}
                title="Arrastar para reordenar"
                className="shrink-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none text-white/30 hover:text-white/70 transition-colors"
              >
                <GripVertical className="w-4 h-4" />
              </button>
              <input
                value={s.titulo}
                onChange={e => updateSecao(si, { titulo: e.target.value })}
                placeholder="Título da seção..."
                className="flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/25"
              />
              <button type="button" onClick={() => updateSecao(si, { destaque: !s.destaque })}
                title="Destacar como aviso"
                className="text-[10px] px-2 py-1 rounded-lg font-medium shrink-0 transition-colors"
                style={{
                  backgroundColor: s.destaque ? "rgba(234,179,8,0.15)" : "var(--ui-inactive-bg)",
                  color: s.destaque ? "#fbbf24" : "var(--ui-inactive-color)",
                  border: `1px solid ${s.destaque ? "rgba(234,179,8,0.4)" : "var(--ui-inactive-border)"}`,
                }}>
                Aviso
              </button>
              <button onClick={() => removeSecao(si)} className="p-1 rounded text-red-400/40 hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <textarea
              value={s.corpo}
              onChange={e => updateSecao(si, { corpo: e.target.value })}
              placeholder="Uma linha = um item de lista. Um parágrafo só = texto corrido."
              rows={3}
              className="w-full px-4 py-3 text-sm text-white/80 bg-transparent outline-none leading-relaxed resize-y placeholder:text-white/20"
            />
            </>
            )}
          </DraggableCard>
        ))}
        </DndContext>

        <button onClick={addSecao}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed text-sm transition-colors"
          style={{ borderColor: "var(--ui-inactive-border)", color: "var(--ui-inactive-color)" }}>
          <Plus className="w-4 h-4" /> Adicionar seção
        </button>
      </div>

      {/* ── Testes ──────────────────────────────────────────── */}
      <DndContext sensors={dndSensors} collisionDetection={pointerWithin} onDragEnd={handleTesteDragEnd}>
      <div className="space-y-3">
        {testes.map((t, ti) => {
          const isCollapsed = collapsed.has(t._id);
          return (
            <DraggableCard key={t._id} id={t._id}>
              {({ attributes, listeners }) => (
              <>

              {/* Cabeçalho do teste */}
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: isCollapsed ? "none" : "1px solid var(--section-header-border)", backgroundColor: "var(--section-header-bg)" }}>
                <button
                  type="button"
                  {...attributes}
                  {...listeners}
                  title="Arrastar para reordenar"
                  className="shrink-0 w-5 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none text-white/30 hover:text-white/70 transition-colors"
                >
                  <GripVertical className="w-4 h-4" />
                </button>
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

                  {/* Fotos de referência — sobrepõem o fallback estático quando enviadas */}
                  <div>
                    <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Fotos de referência (opcional)</p>
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: t.numFotos }).map((_, pi) => {
                        const url = t.imagens?.[pi];
                        const key = `${t._id}:foto:${pi}`;
                        return (
                          <div key={pi} className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border"
                            style={{ borderColor: "var(--ui-inactive-border)", backgroundColor: "var(--ui-inactive-bg)" }}>
                            {url ? (
                              <>
                                <img src={url} alt="" className="w-full h-full object-cover" />
                                <button type="button" onClick={() => removePhoto(ti, pi)}
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white">
                                  <XIcon className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <button type="button"
                                onClick={() => pickFile("image/*", f => uploadPhoto(ti, pi, f))}
                                disabled={uploadingMedia === key}
                                className="w-full h-full flex flex-col items-center justify-center gap-0.5 text-white/25 hover:text-white/50 transition-colors">
                                {uploadingMedia === key
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <ImagePlus className="w-4 h-4" />}
                                <span className="text-[9px]">Foto{t.numFotos > 1 ? ` ${pi + 1}` : ""}</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vídeo de demonstração — URL (YouTube/Vimeo), mesmo padrão da Biblioteca de Exercícios */}
                  <div>
                    <label className="text-[10px] text-white/40 uppercase tracking-wider mb-2 block">Vídeo de demonstração (opcional, YouTube/Vimeo)</label>
                    <div className="relative">
                      <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
                      <input
                        type="url"
                        value={t.videoUrl ?? ""}
                        onChange={e => updateTeste(ti, { videoUrl: e.target.value || null })}
                        placeholder="https://youtube.com/watch?v=..."
                        className="w-full h-10 rounded-xl bg-white/5 border border-white/10 pl-9 pr-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-amber-500/40 transition-colors"
                      />
                    </div>
                  </div>

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
              </>
              )}
            </DraggableCard>
          );
        })}
      </div>
      </DndContext>

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
      </>
      )}
    </div>
  );
};

export default PosturalEvalBuilder;
