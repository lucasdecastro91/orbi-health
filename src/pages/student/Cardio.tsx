import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, AlertCircle, Clock, Calendar, Heart,
  Footprints, Wind, Bike, RefreshCw, Waves, Zap, Dumbbell,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface CardioPlano {
  id: string;
  tipo: string;
  bpm_alvo: string | null;
  frequencia_semana: number | null;
  duracao_minutos: number | null;
  observacoes: string | null;
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

const StudentCardio = () => {
  const [planos,  setPlanos]  = useState<CardioPlano[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadPlanos();
  }, []);

  const loadPlanos = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: aluno } = await supabase
        .from("alunos")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!aluno) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("cardio_planos")
        .select("id, tipo, bpm_alvo, frequencia_semana, duracao_minutos, observacoes")
        .eq("aluno_id", aluno.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlanos(data ?? []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar cardio", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
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
    <div className="min-h-screen pb-24">
      {/* Page header */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: "var(--cp-gradient)" }}
          >
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Cardio</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Seu plano de cardio prescrito</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-3">
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
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StudentCardio;
