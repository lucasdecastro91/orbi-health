import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Check, X, Loader2, Database, RefreshCw, Building2, ShieldCheck,
} from "lucide-react";

interface AlimentoPendente {
  id: string;
  nome: string;
  porcao_descricao: string | null;
  porcao_gramas: number | null;
  kcal: number | null;
  proteina_g: number | null;
  carb_g: number | null;
  gordura_g: number | null;
  fibra_g: number | null;
  fonte: string;
  status: string;
  created_at: string;
  org_id: string | null;
  organizations: { name: string } | null;
}

const RevisaoAlimentos = () => {
  const { toast } = useToast();
  const [pendentes, setPendentes] = useState<AlimentoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalGlobal, setTotalGlobal] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Conta total de alimentos globais aprovados
      const { count } = await supabase
        .from("alimentos")
        .select("id", { count: "exact", head: true })
        .is("org_id", null)
        .eq("status", "aprovado");
      setTotalGlobal(count ?? 0);

      // Lista pendentes
      const { data, error } = await supabase
        .from("alimentos")
        .select(`
          id, nome, porcao_descricao, porcao_gramas, kcal, proteina_g, carb_g, gordura_g, fibra_g,
          fonte, status, created_at, org_id,
          organizations ( name )
        `)
        .eq("status", "pendente")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPendentes((data ?? []) as AlimentoPendente[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar alimentos", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const aprovar = async (id: string) => {
    const { error } = await supabase
      .from("alimentos")
      .update({ status: "aprovado", org_id: null, fonte: "global" })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao aprovar", description: error.message, variant: "destructive" }); return;
    }
    toast({ title: "Alimento aprovado!", description: "Agora está disponível globalmente." });
    setPendentes((p) => p.filter((a) => a.id !== id));
    setTotalGlobal((t) => (t ?? 0) + 1);
  };

  const reprovar = async (id: string) => {
    const { error } = await supabase
      .from("alimentos")
      .update({ status: "reprovado" })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao reprovar", description: error.message, variant: "destructive" }); return;
    }
    toast({ title: "Alimento reprovado." });
    setPendentes((p) => p.filter((a) => a.id !== id));
  };

  // ─────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Revisão de Alimentos</h1>
        <p className="text-white/40 text-sm mt-1">
          Gerencie o banco de alimentos global e aprove/reprove alimentos enviados por treinadores.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/6 bg-white/3 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-green-500" />
            <span className="text-xs text-white/50 uppercase tracking-wider">Banco Global</span>
          </div>
          <p className="text-3xl font-bold text-white">
            {totalGlobal === null ? "—" : totalGlobal.toLocaleString()}
          </p>
          <p className="text-xs text-white/30 mt-0.5">alimentos aprovados</p>
        </div>

        <div className="rounded-2xl border border-green-600/20 bg-green-600/5 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-green-500" />
            <span className="text-xs text-white/50 uppercase tracking-wider">Pendentes</span>
          </div>
          <p className="text-3xl font-bold text-green-500">{pendentes.length}</p>
          <p className="text-xs text-white/30 mt-0.5">aguardando revisão</p>
        </div>

        <div className="rounded-2xl border border-white/6 bg-white/3 px-5 py-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-green-500" />
            <span className="text-xs text-white/50 uppercase tracking-wider">Acesso</span>
          </div>
          <p className="text-sm font-semibold text-white mt-1">Superadmin</p>
          <p className="text-xs text-white/30 mt-0.5">Apenas lucas.melo1991@gmail.com</p>
        </div>
      </div>

      {/* Tabela de pendentes */}
      <div>
        <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">
          Alimentos Pendentes ({pendentes.length})
        </h2>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-white/30">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : pendentes.length === 0 ? (
          <div className="rounded-2xl border border-white/6 bg-white/3 px-5 py-8 text-center">
            <Check className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-white/50 text-sm">Nenhum alimento pendente. Tudo em dia!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendentes.map((a) => (
              <div key={a.id} className="rounded-2xl border border-white/6 bg-white/3 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Nome + org */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-white">{a.nome}</p>
                      {a.organizations?.name && (
                        <span className="flex items-center gap-1 text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                          <Building2 className="w-2.5 h-2.5" />
                          {a.organizations.name}
                        </span>
                      )}
                    </div>

                    {/* Porção */}
                    <p className="text-xs text-white/40 mt-0.5">
                      Por {a.porcao_descricao ?? `${a.porcao_gramas ?? 100}g`}
                    </p>

                    {/* Macros */}
                    <div className="flex flex-wrap gap-3 mt-2">
                      {a.kcal != null && (
                        <span className="text-xs text-green-500/70">{a.kcal} kcal</span>
                      )}
                      {a.proteina_g != null && (
                        <span className="text-xs text-red-400/60">P {a.proteina_g}g</span>
                      )}
                      {a.carb_g != null && (
                        <span className="text-xs text-yellow-400/60">C {a.carb_g}g</span>
                      )}
                      {a.gordura_g != null && (
                        <span className="text-xs text-blue-400/60">G {a.gordura_g}g</span>
                      )}
                      {a.fibra_g != null && (
                        <span className="text-xs text-green-400/60">F {a.fibra_g}g</span>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => aprovar(a.id)}
                      className="h-8 px-3 rounded-xl text-xs font-semibold text-white"
                      style={{ background: "var(--cp-gradient)" }}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => reprovar(a.id)}
                      className="h-8 px-3 rounded-xl text-xs border border-red-500/20 text-red-400/70 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/8"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Reprovar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RevisaoAlimentos;
