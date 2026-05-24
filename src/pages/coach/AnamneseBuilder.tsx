import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, ChevronUp, ChevronDown, GripVertical,
  Save, ClipboardCheck, Loader2, Check, RotateCcw, FolderPlus,
  Bold, Italic, Underline, Link, X as XIcon, AlignLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
type TipoCampo = "text" | "textarea" | "number" | "radio" | "checkbox" | "file";

interface Opcao { label: string; value: string }

interface CampoEdit {
  _id:            string;
  tipo:           TipoCampo;
  label:          string;
  obrigatorio:    boolean;
  opcoes:         Opcao[];
  configMultiple: boolean;
  configAccept:   string;
}

interface SecaoEdit {
  _id:    string;
  titulo: string;
  campos: CampoEdit[];
}

// Tipos para seeds (sem _id)
type CampoSeed = Omit<CampoEdit, "_id">;
interface SecaoSeed { titulo: string; campos: CampoSeed[] }

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
  _id: uid(), tipo: "textarea", label: "",
  obrigatorio: true, opcoes: [],
  configMultiple: false, configAccept: "",
});

const newSecao = (): SecaoEdit => ({
  _id: uid(), titulo: "", campos: [newCampo()],
});

// ── Defaults genéricos — 1 seção ──────────────────────────────
const DEFAULT_SECOES: SecaoSeed[] = [
  {
    titulo: "Informações gerais",
    campos: [
      {
        tipo: "radio", label: "Objetivo principal", obrigatorio: true,
        opcoes: [
          { label: "Emagrecimento", value: "emagrecimento" },
          { label: "Hipertrofia",   value: "hipertrofia"   },
          { label: "Performance",   value: "performance"   },
          { label: "Saúde e qualidade de vida", value: "saude" },
          { label: "Reabilitação",  value: "reabilitacao"  },
          { label: "Outro",         value: "outro"         },
        ], configMultiple: false, configAccept: "",
      },
      {
        tipo: "radio", label: "Nível de atividade física atual", obrigatorio: true,
        opcoes: [
          { label: "Sedentário",             value: "sedentario" },
          { label: "Levemente ativo",        value: "leve"       },
          { label: "Moderadamente ativo",    value: "moderado"   },
          { label: "Muito ativo",            value: "ativo"      },
        ], configMultiple: false, configAccept: "",
      },
      {
        tipo: "radio", label: "Frequência semanal disponível para treino", obrigatorio: true,
        opcoes: [
          { label: "2x", value: "2x" }, { label: "3x", value: "3x" },
          { label: "4x", value: "4x" }, { label: "5x", value: "5x" },
          { label: "6x ou mais", value: "6x" },
        ], configMultiple: false, configAccept: "",
      },
      { tipo: "textarea", label: "Histórico de lesões e cirurgias",         obrigatorio: true,  opcoes: [], configMultiple: false, configAccept: "" },
      { tipo: "textarea", label: "Doenças, medicamentos e suplementos",     obrigatorio: true,  opcoes: [], configMultiple: false, configAccept: "" },
      { tipo: "textarea", label: "Restrições alimentares e alergias",       obrigatorio: true,  opcoes: [], configMultiple: false, configAccept: "" },
      { tipo: "textarea", label: "Qualidade do sono, estresse e hidratação",obrigatorio: true,  opcoes: [], configMultiple: false, configAccept: "" },
      { tipo: "textarea", label: "Observações gerais",                      obrigatorio: false, opcoes: [], configMultiple: false, configAccept: "" },
    ],
  },
];

// ── Defaults GS — 8 seções temáticas ─────────────────────────
const GS_SECOES: SecaoSeed[] = [
  {
    titulo: "Dados Pessoais",
    campos: [
      { tipo: "text",   label: "E-mail",       obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "" },
      { tipo: "text",   label: "Nome completo", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "" },
      { tipo: "number", label: "Idade",         obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "" },
      { tipo: "text",   label: "Altura",        obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "" },
      { tipo: "number", label: "Peso (kg)",     obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "" },
      { tipo: "text",   label: "WhatsApp",      obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "" },
    ],
  },
  {
    titulo: "Objetivos e Experiência",
    campos: [
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Qual o seu principal objetivo com o nosso projeto?" },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Você já é praticante de musculação?",
        opcoes: [{ label: "Sim", value: "sim" }, { label: "Não", value: "nao" }] },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Há quanto tempo treina?",
        opcoes: [
          { label: "Menos de 6 meses", value: "menos_6m" },
          { label: "6 meses a 1 ano",  value: "6m_1a"    },
          { label: "1 a 3 anos",       value: "1_3a"     },
          { label: "Mais de 3 anos",   value: "mais_3a"  },
          { label: "Não pratico",      value: "nao_pratico" },
        ] },
      { tipo: "textarea", obrigatorio: false, opcoes: [], configMultiple: false, configAccept: "",
        label: "Caso já seja praticante de musculação, detalhe como é a divisão atual do seu treino (explicar detalhadamente, informando quantas sessões, quais exercícios em cada sessão de treino, quantas séries, repetições e qual carga estava utilizando em cada exercício)" },
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Qual ou quais grupos musculares você gostaria mais de desenvolver e quais acha que tem mais dificuldade em desenvolver?" },
    ],
  },
  {
    titulo: "Rotina e Disponibilidade",
    campos: [
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Quantas vezes por semana você pode treinar?",
        opcoes: [
          { label: "2x", value: "2x" }, { label: "3x", value: "3x" },
          { label: "4x", value: "4x" }, { label: "5x", value: "5x" },
          { label: "6x ou mais", value: "6x" },
        ] },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Quanto tempo por dia tem disponível para treinar?",
        opcoes: [
          { label: "Menos de 1h", value: "menos_1h" },
          { label: "1h",          value: "1h"        },
          { label: "1h30",        value: "1h30"      },
          { label: "2h",          value: "2h"        },
          { label: "Mais de 2h",  value: "mais_2h"   },
        ] },
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Detalhadamente me diga, do momento que acorda até a hora de dormir, como é sua rotina? Horários etc." },
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Tem alguma limitação na rotina que pode afetar sua adesão ao treino/dieta? (Ex: trabalho, tempo, filhos, motivação)" },
    ],
  },
  {
    titulo: "Saúde e Histórico",
    campos: [
      { tipo: "checkbox", obrigatorio: true, configMultiple: true, configAccept: "",
        label: "Possui alguma condição de saúde diagnosticada?",
        opcoes: [
          { label: "Hipertensão",        value: "hipertensao"        },
          { label: "Diabetes",           value: "diabetes"           },
          { label: "Problemas cardíacos",value: "problemas_cardiacos"},
          { label: "Problemas na coluna",value: "problemas_coluna"   },
          { label: "Nenhuma",            value: "nenhuma"            },
          { label: "Outra",              value: "outra"              },
        ] },
      { tipo: "textarea", obrigatorio: true,  opcoes: [], configMultiple: false, configAccept: "",
        label: "Já teve alguma lesão ou fez alguma cirurgia recentemente? (Se sim, descrever)" },
      { tipo: "textarea", obrigatorio: true,  opcoes: [], configMultiple: false, configAccept: "",
        label: "Faz uso de alguma medicação contínua? (Se sim, qual?)" },
      { tipo: "textarea", obrigatorio: false, opcoes: [], configMultiple: false, configAccept: "",
        label: "Tem algum desvio postural estrutural constatado por exame? Se sim, qual? (Se tiver o exame, favor enviar junto com os demais na pergunta abaixo)" },
      { tipo: "file", obrigatorio: false, opcoes: [], configMultiple: true, configAccept: "image/*,.pdf",
        label: "Últimos exames feitos? Enviar todos em anexo" },
    ],
  },
  {
    titulo: "Alimentação",
    campos: [
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Possui alguma restrição alimentar ou alergia? (Se sim, especificar)" },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Como você classifica sua alimentação atual?",
        opcoes: [
          { label: "Muito desregrada", value: "muito_desregrada" },
          { label: "Regular",          value: "regular"          },
          { label: "Boa",              value: "boa"              },
          { label: "Ótima",            value: "otima"            },
        ] },
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Como é sua rotina alimentar? (Ex: quantas e quais refeições faz no dia, quais alimentos costuma consumir em cada uma das refeições, se costuma pular refeições)" },
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Tem algum alimento que não come ou que não goste de jeito nenhum? Quais?" },
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Cite pelo menos 3 frutas de sua preferência (pode ser mais que 3)." },
      { tipo: "text", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Se pudesse escolher um alimento para consumir o dia todo (qualquer alimento) em sua dieta, qual seria?" },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Já fez dieta restritiva alguma vez?",
        opcoes: [
          { label: "Sim, por conta própria",                  value: "sim_proprio"     },
          { label: "Sim, com acompanhamento profissional",    value: "sim_profissional" },
          { label: "Não, nunca fiz",                          value: "nao"             },
          { label: "Já fiz, mas não consegui seguir",         value: "fiz_nao_seguiu"  },
          { label: "Já fiz, tive resultados, mas não sustentei", value: "fiz_resultados" },
        ] },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Consome bebida alcoólica?",
        opcoes: [
          { label: "Sim, frequentemente", value: "sim_frequente" },
          { label: "Sim, mas raramente",  value: "sim_raramente" },
          { label: "Não",                 value: "nao"           },
        ] },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Consome fast food ou doces?",
        opcoes: [
          { label: "Sim, diariamente",       value: "sim_diario" },
          { label: "1 a 3 vezes por semana", value: "1_3x"       },
          { label: "Raramente",              value: "raramente"  },
          { label: "Nunca",                  value: "nunca"      },
        ] },
    ],
  },
  {
    titulo: "Suplementação e Ergogênicos",
    campos: [
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Quais suplementos e manipulados tem à disposição?" },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Já fez ou faz uso de recursos ergogênicos (esteroides anabolizantes)? Se não, tem interesse em fazer?",
        opcoes: [
          { label: "Sim, faço uso atualmente",          value: "sim_atual"         },
          { label: "Sim, já utilizei",                  value: "sim_utilizei"      },
          { label: "Não, nunca utilizei",               value: "nao"               },
          { label: "Não, mas tenho interesse em utilizar", value: "nao_interesse"  },
          { label: "Não, e não tenho interesse",        value: "nao_sem_interesse" },
        ] },
      { tipo: "textarea", obrigatorio: false, opcoes: [], configMultiple: false, configAccept: "",
        label: "Caso já tenha feito o uso, poderia relatar quais foram as substâncias que já utilizou e qual foi o seu último protocolo?" },
    ],
  },
  {
    titulo: "Bem-estar",
    campos: [
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Como está a sua recuperação muscular entre as sessões de treino?",
        opcoes: [
          { label: "Excelente: me recupero totalmente antes da próxima sessão",      value: "excelente" },
          { label: "Boa: sinto leve cansaço, mas consigo treinar bem no dia seguinte",value: "boa"      },
          { label: "Regular: sinto dores ou fadiga que atrapalham meu desempenho",   value: "regular"   },
          { label: "Ruim: demoro vários dias para me recuperar totalmente",           value: "ruim"      },
          { label: "Não sei avaliar / Nunca parei para observar isso",               value: "nao_sei"   },
        ] },
      { tipo: "textarea", obrigatorio: true, opcoes: [], configMultiple: false, configAccept: "",
        label: "Sente algum tipo de desconforto/dor ao realizar algum exercício? Se sim, relatar que tipo de desconforto e em quais exercícios." },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Como você classifica a sua disposição durante o dia?",
        opcoes: [
          { label: "Excelente: sinto energia constante do início ao fim do dia",         value: "excelente"  },
          { label: "Boa: tenho bastante disposição, com poucas variações ao longo do dia",value: "boa"       },
          { label: "Regular: minha disposição oscila bastante, com momentos de cansaço", value: "regular"    },
          { label: "Baixa: sinto fadiga frequente e dificuldade para manter o ritmo",    value: "baixa"      },
          { label: "Muito baixa: estou frequentemente sem energia e desmotivado(a)",     value: "muito_baixa"},
        ] },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Como é sua rotina de sono?",
        opcoes: [
          { label: "Durmo bem (7-8h por noite)",             value: "bem"      },
          { label: "Sono irregular (menos de 6h por noite)", value: "irregular"},
          { label: "Insônia ou dificuldades para dormir",    value: "insonia"  },
        ] },
      { tipo: "radio", obrigatorio: true, configMultiple: false, configAccept: "",
        label: "Qual o seu nível de estresse diário?",
        opcoes: [
          { label: "Baixo",    value: "baixo"    },
          { label: "Moderado", value: "moderado" },
          { label: "Alto",     value: "alto"     },
        ] },
    ],
  },
  {
    titulo: "Físico Desejado",
    campos: [
      { tipo: "file", obrigatorio: true, opcoes: [], configMultiple: true, configAccept: "image/*",
        label: "Envie imagens de alguém que admira o físico e que seja algo bem próximo do físico que deseja ter." },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────
const AnamneseBuilder = () => {
  const { orgId, isGetShapeOrg } = useTenantContext();
  const { toast } = useToast();

  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [hasDb,       setHasDb]       = useState(false);
  const [secoes,      setSecoes]      = useState<SecaoEdit[]>([]);
  const [collapsed,   setCollapsed]   = useState<Set<string>>(new Set());
  const [introLoaded, setIntroLoaded] = useState(false);

  // Intro rich-text (contenteditable — not controlled by React)
  const introRef  = useRef<HTMLDivElement>(null);
  const introHtml = useRef<string>("");   // updated on every keystroke via onInput

  // Sync innerHTML once after DB load
  useEffect(() => {
    if (introLoaded && introRef.current) {
      introRef.current.innerHTML = introHtml.current;
    }
  }, [introLoaded]);

  useEffect(() => { if (orgId) loadTemplate(); }, [orgId]);

  // ── Load ──────────────────────────────────────────────────────
  const loadTemplate = async () => {
    try {
      const { data } = await (supabase as any)
        .from("anamnese_templates")
        .select("perguntas, introducao")
        .eq("org_id", orgId)
        .maybeSingle();

      // Load intro HTML
      introHtml.current = (data as any)?.introducao ?? "";
      setIntroLoaded(true);

      if (data?.perguntas && Array.isArray(data.perguntas) && (data.perguntas as any[]).length > 0) {
        const pergs = data.perguntas as any[];

        if (pergs[0]?.titulo !== undefined) {
          // New sectioned format
          setHasDb(true);
          setSecoes(pergs.sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((s: any): SecaoEdit => ({
            _id:    s.id ?? uid(),
            titulo: s.titulo ?? "",
            campos: (s.campos ?? []).map((c: any): CampoEdit => ({
              _id:            c.id   ?? uid(),
              tipo:           c.tipo as TipoCampo,
              label:          c.label ?? "",
              obrigatorio:    c.obrigatorio ?? true,
              opcoes:         c.opcoes ?? [],
              configMultiple: c.configMultiple ?? false,
              configAccept:   c.configAccept ?? "",
            })),
          })));
        } else if (pergs[0]?.tipo !== undefined) {
          // Old flat format — wrap in a single section
          setHasDb(true);
          setSecoes([{
            _id:    uid(),
            titulo: "Perguntas gerais",
            campos: pergs.map((p: any): CampoEdit => ({
              _id:            p.id ?? uid(),
              tipo:           p.tipo as TipoCampo,
              label:          p.label ?? "",
              obrigatorio:    p.obrigatorio ?? true,
              opcoes:         p.opcoes ?? [],
              configMultiple: p.configMultiple ?? false,
              configAccept:   p.configAccept ?? "",
            })),
          }]);
        } else {
          resetToDefaults();
        }
      } else {
        resetToDefaults();
      }
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const perguntas = secoes.map((s, si) => ({
        id:     s._id,
        titulo: s.titulo,
        ordem:  si + 1,
        campos: s.campos.map((c, ci) => ({
          id:             c._id,
          tipo:           c.tipo,
          label:          c.label,
          obrigatorio:    c.obrigatorio,
          opcoes:         (c.tipo === "radio" || c.tipo === "checkbox") ? c.opcoes : null,
          configMultiple: c.tipo === "file" ? c.configMultiple : null,
          configAccept:   c.tipo === "file" ? c.configAccept   : null,
          ordem:          ci + 1,
        })),
      }));

      const { error } = await (supabase as any)
        .from("anamnese_templates")
        .upsert(
          { org_id: orgId, perguntas, introducao: introHtml.current || null },
          { onConflict: "org_id" },
        );

      if (error) throw error;
      setHasDb(true);
      toast({ title: "Anamnese salva!" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    const seeds = isGetShapeOrg ? GS_SECOES : DEFAULT_SECOES;
    setSecoes(seeds.map(s => ({
      _id:    uid(),
      titulo: s.titulo,
      campos: s.campos.map(c => ({ ...c, _id: uid() })),
    })));
  };

  // ── Seção helpers ─────────────────────────────────────────────
  const addSecao = () => setSecoes(s => [...s, newSecao()]);

  const removeSecao = (si: number) =>
    setSecoes(s => s.filter((_, i) => i !== si));

  const moveSecao = (si: number, dir: -1 | 1) =>
    setSecoes(s => { const n = [...s]; [n[si], n[si + dir]] = [n[si + dir], n[si]]; return n; });

  const updateSecaoTitulo = (si: number, titulo: string) =>
    setSecoes(s => s.map((x, i) => i === si ? { ...x, titulo } : x));

  const toggleCollapse = (id: string) =>
    setCollapsed(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Campo helpers ─────────────────────────────────────────────
  const addCampo = (si: number) =>
    setSecoes(s => s.map((sec, i) => i === si ? { ...sec, campos: [...sec.campos, newCampo()] } : sec));

  const removeCampo = (si: number, ci: number) =>
    setSecoes(s => s.map((sec, i) => i === si ? { ...sec, campos: sec.campos.filter((_, j) => j !== ci) } : sec));

  const updateCampo = (si: number, ci: number, patch: Partial<CampoEdit>) =>
    setSecoes(s => s.map((sec, i) => i === si
      ? { ...sec, campos: sec.campos.map((c, j) => j === ci ? { ...c, ...patch } : c) }
      : sec));

  const moveCampo = (si: number, ci: number, dir: -1 | 1) =>
    setSecoes(s => s.map((sec, i) => {
      if (i !== si) return sec;
      const n = [...sec.campos];
      [n[ci], n[ci + dir]] = [n[ci + dir], n[ci]];
      return { ...sec, campos: n };
    }));

  // ── Opção helpers ─────────────────────────────────────────────
  const addOpcao = (si: number, ci: number) =>
    updateCampo(si, ci, { opcoes: [...secoes[si].campos[ci].opcoes, { label: "", value: uid().slice(0, 8) }] });

  const updateOpcao = (si: number, ci: number, oi: number, label: string) =>
    updateCampo(si, ci, {
      opcoes: secoes[si].campos[ci].opcoes.map((o, i) =>
        i === oi ? { ...o, label, value: label.toLowerCase().replace(/\s+/g, "_").slice(0, 30) } : o
      ),
    });

  const removeOpcao = (si: number, ci: number, oi: number) =>
    updateCampo(si, ci, { opcoes: secoes[si].campos[ci].opcoes.filter((_, i) => i !== oi) });

  // ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-white/30" />
    </div>
  );

  const totalCampos = secoes.reduce((acc, s) => acc + s.campos.length, 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
          <h1 className="text-lg font-bold text-white">Ficha de Anamnese</h1>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "var(--btn-soft-bg)", color: "var(--btn-soft-color)" }}>
            {secoes.length} seção{secoes.length !== 1 ? "ões" : ""} · {totalCampos} pergunta{totalCampos !== 1 ? "s" : ""}
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
        O aluno navega seção por seção. Cada seção vira uma etapa na ficha. Reordene, adicione ou remova seções e perguntas livremente.
      </div>

      {/* ── Editor de introdução ─────────────────────────────── */}
      <div className="rounded-2xl border overflow-hidden"
        style={{ borderColor: "var(--section-card-border)", backgroundColor: "var(--section-card-bg)" }}>

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--section-header-border)", backgroundColor: "var(--section-header-bg)" }}>
          <AlignLeft className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
          <span className="text-sm font-semibold text-white flex-1">Mensagem de boas-vindas</span>
          <span className="text-xs text-white/35">Opcional · aparece antes das perguntas</span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2"
          style={{ borderBottom: "1px solid var(--section-header-border)", backgroundColor: "var(--section-header-bg)" }}>
          {[
            { icon: Bold,      cmd: "bold",            title: "Negrito (Ctrl+B)"    },
            { icon: Italic,    cmd: "italic",          title: "Itálico (Ctrl+I)"   },
            { icon: Underline, cmd: "underline",       title: "Sublinhado (Ctrl+U)" },
          ].map(({ icon: Icon, cmd, title }) => (
            <button
              key={cmd}
              type="button"
              title={title}
              onMouseDown={e => { e.preventDefault(); document.execCommand(cmd, false); introHtml.current = introRef.current?.innerHTML ?? ""; }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: "var(--btn-ghost-color)" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--ui-inactive-bg)"; (e.currentTarget as HTMLElement).style.color = "hsl(var(--foreground))"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--btn-ghost-color)"; }}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
          <div className="w-px h-4 mx-1" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />
          <button
            type="button"
            title="Inserir link"
            onMouseDown={e => {
              e.preventDefault();
              const url = window.prompt("URL do link:");
              if (url) document.execCommand("createLink", false, url);
              introHtml.current = introRef.current?.innerHTML ?? "";
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
          >
            <Link className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Remover formatação"
            onMouseDown={e => {
              e.preventDefault();
              document.execCommand("removeFormat", false);
              document.execCommand("unlink", false);
              introHtml.current = introRef.current?.innerHTML ?? "";
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: "rgba(255,255,255,0.5)" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Editable area */}
        <div
          ref={introRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => { introHtml.current = introRef.current?.innerHTML ?? ""; }}
          className="min-h-[140px] px-4 py-3 text-sm text-white/80 outline-none leading-relaxed"
          style={{ caretColor: "var(--cp-400)" }}
          data-placeholder="Escreva a mensagem de boas-vindas que o aluno verá antes de começar a preencher a ficha..."
        />

        {/* Placeholder CSS */}
        <style>{`
          [data-placeholder]:empty::before {
            content: attr(data-placeholder);
            color: rgba(255,255,255,0.2);
            pointer-events: none;
          }
        `}</style>
      </div>

      {/* Seções */}
      <div className="space-y-3">
        {secoes.map((sec, si) => {
          const isCollapsed = collapsed.has(sec._id);
          return (
            <div key={sec._id} className="rounded-2xl border overflow-hidden"
              style={{ borderColor: "var(--section-card-border)", backgroundColor: "var(--section-card-bg)" }}>

              {/* Cabeçalho da seção */}
              <div className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: isCollapsed ? "none" : "1px solid var(--section-header-border)", backgroundColor: "var(--section-header-bg)" }}>
                <button onClick={() => toggleCollapse(sec._id)}
                  className="shrink-0 text-white/30 hover:text-white/70 transition-colors">
                  <ChevronDown className="w-4 h-4 transition-transform duration-200"
                    style={{ transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }} />
                </button>
                <span className="text-[10px] font-bold uppercase tracking-widest shrink-0"
                  style={{ color: "var(--cp-400)" }}>Seção {si + 1}</span>
                <input
                  value={sec.titulo}
                  onChange={e => updateSecaoTitulo(si, e.target.value)}
                  placeholder="Título da seção..."
                  className="flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-white/25"
                />
                <span className="text-[10px] text-white/25 shrink-0">
                  {sec.campos.length} pergunta{sec.campos.length !== 1 ? "s" : ""}
                </span>
                <button onClick={() => moveSecao(si, -1)} disabled={si === 0}
                  className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => moveSecao(si, 1)} disabled={si === secoes.length - 1}
                  className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => removeSecao(si)}
                  className="p-1 rounded text-red-400/40 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Campos da seção */}
              {!isCollapsed && (
                <div className="p-3 space-y-2.5">
                  {sec.campos.map((c, ci) => (
                    <div key={c._id} className="rounded-xl border p-3.5 space-y-2.5"
                      style={{ borderColor: "var(--section-card-border)", backgroundColor: "var(--section-card-bg)" }}>

                      <div className="flex items-start gap-2">
                        <GripVertical className="w-4 h-4 mt-2.5 shrink-0 text-white/20" />
                        <div className="flex-1 space-y-2">
                          <textarea
                            value={c.label}
                            onChange={e => updateCampo(si, ci, { label: e.target.value })}
                            placeholder="Pergunta..."
                            rows={2}
                            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-amber-500/40 resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <select
                              value={c.tipo}
                              onChange={e => updateCampo(si, ci, { tipo: e.target.value as TipoCampo, opcoes: [] })}
                              className="flex-1 h-8 rounded-lg border border-white/10 text-xs px-2 outline-none"
                              style={{ backgroundColor: "var(--section-card-bg)", color: "hsl(var(--foreground))", borderColor: "var(--section-card-border)" }}
                            >
                              {(Object.entries(TIPO_LABELS) as [TipoCampo, string][]).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer shrink-0">
                              <input type="checkbox" checked={c.obrigatorio}
                                onChange={e => updateCampo(si, ci, { obrigatorio: e.target.checked })}
                                className="accent-amber-500" />
                              Obrigatório
                            </label>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => moveCampo(si, ci, -1)} disabled={ci === 0}
                            className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => moveCampo(si, ci, 1)} disabled={ci === sec.campos.length - 1}
                            className="p-1 rounded text-white/30 hover:text-white/70 disabled:opacity-20">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeCampo(si, ci)}
                            className="p-1 rounded text-red-400/50 hover:text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Config arquivo */}
                      {c.tipo === "file" && (
                        <div className="pl-6 space-y-2">
                          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                            <input type="checkbox" checked={c.configMultiple}
                              onChange={e => updateCampo(si, ci, { configMultiple: e.target.checked })}
                              className="accent-amber-500" />
                            Permitir múltiplos arquivos
                          </label>
                          <input type="text" value={c.configAccept}
                            onChange={e => updateCampo(si, ci, { configAccept: e.target.value })}
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
                              <input type="text" value={op.label}
                                onChange={e => updateOpcao(si, ci, oi, e.target.value)}
                                placeholder={`Opção ${oi + 1}`}
                                className="flex-1 h-7 rounded-md bg-white/5 border border-white/10 px-2 text-xs text-white placeholder:text-white/30 outline-none"
                              />
                              <button onClick={() => removeOpcao(si, ci, oi)} className="text-red-400/50 hover:text-red-400">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => addOpcao(si, ci)}
                            className="flex items-center gap-1 text-xs mt-1"
                            style={{ color: "var(--cp-400)" }}>
                            <Plus className="w-3 h-3" /> Adicionar opção
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Adicionar pergunta na seção */}
                  <button onClick={() => addCampo(si)}
                    className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-dashed text-xs transition-colors"
                    style={{ borderColor: "var(--ui-inactive-border)", color: "var(--ui-inactive-color)" }}>
                    <Plus className="w-3.5 h-3.5" /> Adicionar pergunta
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Adicionar seção */}
      <button onClick={addSecao}
        className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-dashed text-sm transition-colors"
        style={{ borderColor: "var(--ui-inactive-border)", color: "var(--ui-inactive-color)" }}>
        <FolderPlus className="w-4 h-4" /> Adicionar seção
      </button>

      {/* Salvar bottom */}
      <button onClick={handleSave} disabled={saving}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, hsl(42 95% 58%), hsl(35 92% 44%))", color: "#ffffff" }}>
        {saving
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          : <><Check className="w-4 h-4" /> Salvar ficha de anamnese</>
        }
      </button>
    </div>
  );
};

export default AnamneseBuilder;
