import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, ChevronUp, ChevronDown, GripVertical,
  Save, ClipboardList, Loader2, Check,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
type TipoCampo = "text" | "textarea" | "number" | "radio" | "checkbox" | "file";

interface Opcao { label: string; value: string }

interface CampoEdit {
  _id:        string;        // local key
  dbId:       string | null; // real UUID (null = novo)
  tipo:       TipoCampo;
  label:      string;
  obrigatorio: boolean;
  opcoes:     Opcao[];
  configMin:  string;
  configMax:  string;
  configMultiple: boolean;
  configAccept:   string;
}

interface SecaoEdit {
  _id:      string;
  dbId:     string | null;
  titulo:   string;
  instrucao: string;
  campos:   CampoEdit[];
}

const TIPO_LABELS: Record<TipoCampo, string> = {
  text:     "Texto curto",
  textarea: "Texto longo",
  number:   "Número",
  radio:    "Múltipla escolha (única)",
  checkbox: "Múltipla escolha (múltipla)",
  file:     "Upload de arquivo",
};

const uid = () => crypto.randomUUID();

const newCampo = (): CampoEdit => ({
  _id: uid(), dbId: null,
  tipo: "textarea", label: "",
  obrigatorio: true, opcoes: [],
  configMin: "", configMax: "",
  configMultiple: false, configAccept: "",
});

const newSecao = (): SecaoEdit => ({
  _id: uid(), dbId: null,
  titulo: "Nova seção", instrucao: "", campos: [newCampo()],
});

// ─── Component ────────────────────────────────────────────────
const FormBuilder = () => {
  const { orgId } = useTenantContext();
  const { toast } = useToast();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [formId,   setFormId]   = useState<string | null>(null);

  // Form meta
  const [titulo,     setTitulo]     = useState("Atualização");
  const [avisoFinal, setAvisoFinal] = useState("");

  // Campos iniciais (sem seção)
  const [camposIniciais, setCamposIniciais] = useState<CampoEdit[]>([]);
  // Seções
  const [secoes, setSecoes] = useState<SecaoEdit[]>([]);

  // Track deleted db records so we can delete them on save
  const [deletedSecaoIds, setDeletedSecaoIds] = useState<string[]>([]);
  const [deletedCampoIds, setDeletedCampoIds] = useState<string[]>([]);

  useEffect(() => { if (orgId) loadForm(); }, [orgId]);

  // ── Load ──────────────────────────────────────────────────────
  const loadForm = async () => {
    try {
      const { data } = await supabase
        .from("atualizacao_forms")
        .select(`
          id, titulo, aviso_final,
          atualizacao_form_secoes (id, titulo, instrucao, ordem),
          atualizacao_form_campos (id, secao_id, tipo, label, obrigatorio, opcoes, config, ordem)
        `)
        .eq("org_id", orgId)
        .eq("ativo", true)
        .maybeSingle();

      if (!data) { setLoading(false); return; }

      setFormId(data.id);
      setTitulo(data.titulo ?? "Atualização");
      setAvisoFinal(data.aviso_final ?? "");

      const allCampos = (data.atualizacao_form_campos as any[]).sort((a, b) => a.ordem - b.ordem);

      const toCampoEdit = (c: any): CampoEdit => ({
        _id: c.id, dbId: c.id,
        tipo: c.tipo as TipoCampo,
        label: c.label,
        obrigatorio: c.obrigatorio,
        opcoes: (c.opcoes as Opcao[]) ?? [],
        configMin:      c.config?.min?.toString() ?? "",
        configMax:      c.config?.max?.toString() ?? "",
        configMultiple: c.config?.multiple ?? false,
        configAccept:   c.config?.accept ?? "",
      });

      setCamposIniciais(allCampos.filter((c: any) => c.secao_id === null).map(toCampoEdit));

      const secoesRaw = (data.atualizacao_form_secoes as any[]).sort((a: any, b: any) => a.ordem - b.ordem);
      setSecoes(secoesRaw.map((s: any): SecaoEdit => ({
        _id: s.id, dbId: s.id,
        titulo: s.titulo, instrucao: s.instrucao ?? "",
        campos: allCampos.filter((c: any) => c.secao_id === s.id).map(toCampoEdit),
      })));
    } catch (e: any) {
      toast({ title: "Erro ao carregar formulário", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!titulo.trim()) { toast({ title: "Defina um título para o formulário", variant: "destructive" }); return; }
    setSaving(true);
    try {
      // 1. Upsert form
      let fId = formId;
      if (fId) {
        await supabase.from("atualizacao_forms").update({ titulo, aviso_final: avisoFinal || null }).eq("id", fId);
      } else {
        const { data: newForm } = await supabase.from("atualizacao_forms")
          .insert({ org_id: orgId, titulo, aviso_final: avisoFinal || null })
          .select("id").single();
        fId = newForm!.id;
        setFormId(fId);
      }

      // 2. Delete removed sections/campos
      if (deletedCampoIds.length)
        await supabase.from("atualizacao_form_campos").delete().in("id", deletedCampoIds);
      if (deletedSecaoIds.length)
        await supabase.from("atualizacao_form_secoes").delete().in("id", deletedSecaoIds);
      setDeletedCampoIds([]);
      setDeletedSecaoIds([]);

      // 3. Upsert campos iniciais
      await upsertCampos(fId!, camposIniciais, null, setCamposIniciais);

      // 4. Upsert sections + their campos
      const updatedSecoes: SecaoEdit[] = [];
      for (let i = 0; i < secoes.length; i++) {
        const s = secoes[i];
        let sDbId = s.dbId;
        if (sDbId) {
          await supabase.from("atualizacao_form_secoes")
            .update({ titulo: s.titulo, instrucao: s.instrucao || null, ordem: i + 1 })
            .eq("id", sDbId);
        } else {
          const { data: ns } = await supabase.from("atualizacao_form_secoes")
            .insert({ form_id: fId, titulo: s.titulo, instrucao: s.instrucao || null, ordem: i + 1 })
            .select("id").single();
          sDbId = ns!.id;
        }
        const updatedCampos = await upsertCampos(fId!, s.campos, sDbId, null);
        updatedSecoes.push({ ...s, dbId: sDbId, campos: updatedCampos });
      }
      setSecoes(updatedSecoes);

      toast({ title: "Formulário salvo!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const upsertCampos = async (
    fId: string,
    campos: CampoEdit[],
    secaoId: string | null,
    setter: ((fn: (c: CampoEdit[]) => CampoEdit[]) => void) | null,
  ): Promise<CampoEdit[]> => {
    const updated: CampoEdit[] = [];
    for (let i = 0; i < campos.length; i++) {
      const c = campos[i];
      const config: Record<string, any> = {};
      if (c.tipo === "number") {
        if (c.configMin !== "") config.min = parseFloat(c.configMin);
        if (c.configMax !== "") config.max = parseFloat(c.configMax);
      }
      if (c.tipo === "file") {
        if (c.configMultiple) config.multiple = true;
        if (c.configAccept) config.accept = c.configAccept;
      }
      const row = {
        form_id: fId, secao_id: secaoId,
        tipo: c.tipo, label: c.label, obrigatorio: c.obrigatorio,
        opcoes: (c.tipo === "radio" || c.tipo === "checkbox") ? c.opcoes : null,
        config: Object.keys(config).length ? config : null,
        ordem: i + 1,
      };
      if (c.dbId) {
        await supabase.from("atualizacao_form_campos").update(row).eq("id", c.dbId);
        updated.push(c);
      } else {
        const { data: nc } = await supabase.from("atualizacao_form_campos")
          .insert(row).select("id").single();
        updated.push({ ...c, dbId: nc!.id });
      }
    }
    if (setter) setter(() => updated);
    return updated;
  };

  // ── Campos iniciais helpers ───────────────────────────────────
  const addCampoInicial = () => setCamposIniciais(c => [...c, newCampo()]);

  const removeCampoInicial = (idx: number) => {
    setCamposIniciais(c => {
      const rem = c[idx];
      if (rem.dbId) setDeletedCampoIds(d => [...d, rem.dbId!]);
      return c.filter((_, i) => i !== idx);
    });
  };

  const updateCampoInicial = (idx: number, patch: Partial<CampoEdit>) =>
    setCamposIniciais(c => c.map((x, i) => i === idx ? { ...x, ...patch } : x));

  const moveCampoInicial = (idx: number, dir: -1 | 1) =>
    setCamposIniciais(c => { const n = [...c]; [n[idx], n[idx + dir]] = [n[idx + dir], n[idx]]; return n; });

  // ── Seções helpers ────────────────────────────────────────────
  const addSecao = () => setSecoes(s => [...s, newSecao()]);

  const removeSecao = (si: number) => {
    setSecoes(s => {
      const rem = s[si];
      if (rem.dbId) setDeletedSecaoIds(d => [...d, rem.dbId!]);
      rem.campos.forEach(c => { if (c.dbId) setDeletedCampoIds(d => [...d, c.dbId!]); });
      return s.filter((_, i) => i !== si);
    });
  };

  const updateSecao = (si: number, patch: Partial<SecaoEdit>) =>
    setSecoes(s => s.map((x, i) => i === si ? { ...x, ...patch } : x));

  const moveSecao = (si: number, dir: -1 | 1) =>
    setSecoes(s => { const n = [...s]; [n[si], n[si + dir]] = [n[si + dir], n[si]]; return n; });

  // ── Campos de seção helpers ───────────────────────────────────
  const addCampo = (si: number) =>
    setSecoes(s => s.map((x, i) => i === si ? { ...x, campos: [...x.campos, newCampo()] } : x));

  const removeCampo = (si: number, ci: number) =>
    setSecoes(s => s.map((x, i) => {
      if (i !== si) return x;
      const rem = x.campos[ci];
      if (rem.dbId) setDeletedCampoIds(d => [...d, rem.dbId!]);
      return { ...x, campos: x.campos.filter((_, j) => j !== ci) };
    }));

  const updateCampo = (si: number, ci: number, patch: Partial<CampoEdit>) =>
    setSecoes(s => s.map((x, i) => i === si
      ? { ...x, campos: x.campos.map((c, j) => j === ci ? { ...c, ...patch } : c) }
      : x));

  const moveCampo = (si: number, ci: number, dir: -1 | 1) =>
    setSecoes(s => s.map((x, i) => {
      if (i !== si) return x;
      const n = [...x.campos];
      [n[ci], n[ci + dir]] = [n[ci + dir], n[ci]];
      return { ...x, campos: n };
    }));

  // ── Opções helpers (radio/checkbox) ──────────────────────────
  const addOpcao = (campo: CampoEdit, setCampo: (patch: Partial<CampoEdit>) => void) =>
    setCampo({ opcoes: [...campo.opcoes, { label: "", value: uid().slice(0, 8) }] });

  const updateOpcao = (campo: CampoEdit, setCampo: (p: Partial<CampoEdit>) => void, oi: number, label: string) =>
    setCampo({ opcoes: campo.opcoes.map((o, i) => i === oi ? { ...o, label, value: label.toLowerCase().replace(/\s+/g, "_").slice(0, 30) } : o) });

  const removeOpcao = (campo: CampoEdit, setCampo: (p: Partial<CampoEdit>) => void, oi: number) =>
    setCampo({ opcoes: campo.opcoes.filter((_, i) => i !== oi) });

  // ── Render de um campo ────────────────────────────────────────
  const renderCampoEditor = (
    c: CampoEdit,
    idx: number,
    total: number,
    onUpdate: (p: Partial<CampoEdit>) => void,
    onRemove: () => void,
    onMove: (dir: -1 | 1) => void,
  ) => (
    <div
      key={c._id}
      className="rounded-xl border p-4 space-y-3"
      style={{ borderColor: "var(--section-card-border)", backgroundColor: "var(--section-card-bg)" }}
    >
      {/* Header do campo */}
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 mt-2.5 shrink-0 text-white/20" />
        <div className="flex-1 space-y-2">
          {/* Label */}
          <input
            type="text"
            value={c.label}
            onChange={e => onUpdate({ label: e.target.value })}
            placeholder="Pergunta..."
            className="w-full h-9 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-500/40"
          />
          {/* Tipo + Obrigatório */}
          <div className="flex items-center gap-2">
            <select
              value={c.tipo}
              onChange={e => onUpdate({ tipo: e.target.value as TipoCampo, opcoes: [] })}
              className="flex-1 h-8 rounded-lg border border-white/10 text-xs px-2 outline-none"
              style={{ backgroundColor: "var(--section-card-bg)", color: "hsl(var(--foreground))", borderColor: "var(--section-card-border)" }}
            >
              {(Object.entries(TIPO_LABELS) as [TipoCampo, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={c.obrigatorio}
                onChange={e => onUpdate({ obrigatorio: e.target.checked })}
                className="accent-amber-500"
              />
              Obrigatório
            </label>
          </div>
        </div>
        {/* Ações */}
        <div className="flex flex-col gap-1 shrink-0">
          <button onClick={() => onMove(-1)} disabled={idx === 0} className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20"><ChevronUp className="w-3.5 h-3.5" /></button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1} className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20"><ChevronDown className="w-3.5 h-3.5" /></button>
          <button onClick={onRemove} className="p-1 rounded text-red-400/50 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Config de número */}
      {c.tipo === "number" && (
        <div className="flex gap-2 pl-6">
          <div className="flex-1">
            <p className="text-[10px] text-white/40 mb-0.5">Mínimo</p>
            <input type="number" value={c.configMin} onChange={e => onUpdate({ configMin: e.target.value })}
              className="w-full h-8 rounded-lg bg-white/5 border border-white/10 px-2 text-xs text-white outline-none" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-white/40 mb-0.5">Máximo</p>
            <input type="number" value={c.configMax} onChange={e => onUpdate({ configMax: e.target.value })}
              className="w-full h-8 rounded-lg bg-white/5 border border-white/10 px-2 text-xs text-white outline-none" />
          </div>
        </div>
      )}

      {/* Config de arquivo */}
      {c.tipo === "file" && (
        <div className="pl-6 space-y-2">
          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
            <input type="checkbox" checked={c.configMultiple} onChange={e => onUpdate({ configMultiple: e.target.checked })} className="accent-amber-500" />
            Permitir múltiplos arquivos
          </label>
          <input
            type="text"
            value={c.configAccept}
            onChange={e => onUpdate({ configAccept: e.target.value })}
            placeholder="Tipos aceitos (ex: image/*, .pdf)"
            className="w-full h-8 rounded-lg bg-white/5 border border-white/10 px-2 text-xs text-white placeholder:text-white/30 outline-none"
          />
        </div>
      )}

      {/* Opções radio/checkbox */}
      {(c.tipo === "radio" || c.tipo === "checkbox") && (
        <div className="pl-6 space-y-1.5">
          {c.opcoes.map((op, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <div className={`w-3.5 h-3.5 shrink-0 border border-white/30 ${c.tipo === "radio" ? "rounded-full" : "rounded"}`} />
              <input
                type="text"
                value={op.label}
                onChange={e => updateOpcao(c, onUpdate, oi, e.target.value)}
                placeholder={`Opção ${oi + 1}`}
                className="flex-1 h-7 rounded-md bg-white/5 border border-white/10 px-2 text-xs text-white placeholder:text-white/30 outline-none"
              />
              <button onClick={() => removeOpcao(c, onUpdate, oi)} className="text-red-400/50 hover:text-red-400">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => addOpcao(c, onUpdate)}
            className="flex items-center gap-1 text-xs mt-1"
            style={{ color: "var(--cp-400)" }}
          >
            <Plus className="w-3 h-3" /> Adicionar opção
          </button>
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-white/30" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
          <h1 className="text-lg font-bold text-white">Formulário de Atualização</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 h-9 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))", color: "#ffffff" }}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Salvar
        </button>
      </div>

      {/* Título do form */}
      <div
        className="rounded-2xl border p-4 space-y-3"
        style={{ borderColor: "var(--section-card-border)", backgroundColor: "var(--section-card-bg)" }}
      >
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Título do formulário</p>
          <input
            type="text"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white outline-none focus:border-amber-500/40"
          />
        </div>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Aviso exibido ao final</p>
          <textarea
            value={avisoFinal}
            onChange={e => setAvisoFinal(e.target.value)}
            rows={2}
            placeholder="Ex: ⚠️ IMPORTANTE: O prazo para envio..."
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none resize-none focus:border-amber-500/40"
          />
        </div>
      </div>

      {/* Campos iniciais */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Campos iniciais</h2>
          <button onClick={addCampoInicial} className="flex items-center gap-1 text-xs" style={{ color: "var(--cp-400)" }}>
            <Plus className="w-3.5 h-3.5" /> Campo
          </button>
        </div>
        {camposIniciais.length === 0 && (
          <p className="text-xs text-white/30 italic">Nenhum campo inicial</p>
        )}
        {camposIniciais.map((c, i) =>
          renderCampoEditor(
            c, i, camposIniciais.length,
            p => updateCampoInicial(i, p),
            () => removeCampoInicial(i),
            d => moveCampoInicial(i, d),
          )
        )}
      </section>

      {/* Seções */}
      {secoes.map((s, si) => (
        <section
          key={s._id}
          className="rounded-2xl border p-4 space-y-4"
          style={{ borderColor: "var(--section-card-border)", backgroundColor: "var(--section-card-bg)" }}
        >
          {/* Header da seção */}
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={s.titulo}
                onChange={e => updateSecao(si, { titulo: e.target.value })}
                placeholder="Título da seção"
                className="w-full h-9 rounded-xl bg-white/5 border border-white/10 px-3 text-sm font-semibold text-white outline-none focus:border-amber-500/40"
              />
              <input
                type="text"
                value={s.instrucao}
                onChange={e => updateSecao(si, { instrucao: e.target.value })}
                placeholder="Instrução (opcional)"
                className="w-full h-8 rounded-xl bg-white/5 border border-white/10 px-3 text-xs text-white/60 outline-none focus:border-amber-500/40"
              />
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => moveSecao(si, -1)} disabled={si === 0} className="p-1.5 rounded text-white/30 hover:text-white/70 disabled:opacity-20"><ChevronUp className="w-4 h-4" /></button>
              <button onClick={() => moveSecao(si, 1)} disabled={si === secoes.length - 1} className="p-1.5 rounded text-white/30 hover:text-white/70 disabled:opacity-20"><ChevronDown className="w-4 h-4" /></button>
              <button onClick={() => removeSecao(si)} className="p-1.5 rounded text-red-400/50 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>

          {/* Campos da seção */}
          <div className="space-y-3 pl-1">
            {s.campos.map((c, ci) =>
              renderCampoEditor(
                c, ci, s.campos.length,
                p => updateCampo(si, ci, p),
                () => removeCampo(si, ci),
                d => moveCampo(si, ci, d),
              )
            )}
          </div>
          <button onClick={() => addCampo(si)} className="flex items-center gap-1.5 text-xs pl-1" style={{ color: "var(--cp-400)" }}>
            <Plus className="w-3.5 h-3.5" /> Adicionar campo
          </button>
        </section>
      ))}

      {/* Adicionar seção */}
      <button
        onClick={addSecao}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed text-sm transition-colors"
        style={{ borderColor: "var(--ui-inactive-border)", color: "var(--ui-inactive-color)" }}
      >
        <Plus className="w-4 h-4" /> Adicionar seção
      </button>

      {/* Salvar (bottom) */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))", color: "#ffffff" }}
      >
        {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Check className="w-4 h-4" /> Salvar formulário</>}
      </button>
    </div>
  );
};

export default FormBuilder;
