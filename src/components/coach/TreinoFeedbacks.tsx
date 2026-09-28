import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquareQuote, Star } from "lucide-react";

/**
 * "Treinos concluídos" — nota (1-5) e comentário que o aluno deixa ao concluir
 * cada treino (treino_sessoes_log.avaliacao/comentario, gravados em
 * trainingCompletion.ts), na aba Treinos da ficha do aluno.
 *
 * Agrupado por CICLO DE ATUALIZAÇÃO (entre envios de atualizacao_respostas):
 * por padrão só o ciclo atual — é o período que o treinador analisa ao revisar
 * o plano — e "Ver ciclo anterior" carrega um de cada vez. Nada é apagado; o
 * limite é só do que aparece (decidido com o Lucas em 2026-09-28).
 *
 * Leitura pelo treinador depende da policy staff_select_org_logs (migration
 * 20260928000001) — antes dela só o próprio aluno lia essa tabela.
 */

interface LogRow {
  id: string;
  data_conclusao: string;
  created_at: string;
  avaliacao: number | null;
  comentario: string | null;
  treinos: { titulo_treino: string | null } | null;
}

interface Cycle {
  /** YYYY-MM-DD inclusivo; null = desde sempre (antes da 1ª atualização) */
  start: string | null;
  /** YYYY-MM-DD inclusivo; null = até hoje (ciclo atual) */
  end: string | null;
}

const fmt = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const dayBefore = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
};

const Stars = ({ value, size = 13 }: { value: number; size?: number }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${value} de 5 estrelas`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        style={{ width: size, height: size, color: n <= value ? undefined : "hsl(var(--foreground) / 0.18)" }}
        className={n <= value ? "fill-amber-400 text-amber-400" : ""}
      />
    ))}
  </span>
);

const TreinoFeedbacks = ({ alunoId, studentUserId }: { alunoId: string; studentUserId: string }) => {
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [shownCycles, setShownCycles] = useState(1);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyComments, setOnlyComments] = useState(false);

  // 1. Fronteiras dos ciclos = datas dos envios de atualização concluídos
  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("atualizacao_respostas")
        .select("submitted_at")
        .eq("student_id", studentUserId)
        .eq("concluida", true)
        .order("submitted_at", { ascending: false });
      if (error) console.error("Erro ao carregar atualizações:", error);

      const dates = [...new Set((data ?? []).map((r: any) => String(r.submitted_at).slice(0, 10)))];
      const list: Cycle[] = [];
      if (dates.length === 0) {
        list.push({ start: null, end: null });
      } else {
        list.push({ start: dates[0], end: null });
        for (let i = 1; i < dates.length; i++) list.push({ start: dates[i], end: dayBefore(dates[i - 1]) });
        list.push({ start: null, end: dayBefore(dates[dates.length - 1]) });
      }
      setCycles(list);
    })();
  }, [studentUserId]);

  // 2. Treinos concluídos desde o início do ciclo mais antigo exibido
  const oldestStart = cycles ? cycles[Math.min(shownCycles, cycles.length) - 1].start : undefined;
  useEffect(() => {
    if (!cycles) return;
    setLoading(true);
    void (async () => {
      let q = supabase
        .from("treino_sessoes_log")
        .select("id, data_conclusao, created_at, avaliacao, comentario, treinos(titulo_treino)")
        .eq("aluno_id", alunoId)
        .order("data_conclusao", { ascending: false })
        .order("created_at", { ascending: false });
      if (oldestStart) q = q.gte("data_conclusao", oldestStart);
      const { data, error } = await q;
      if (error) console.error("Erro ao carregar treinos concluídos:", error);
      setLogs((data as any as LogRow[]) ?? []);
      setLoading(false);
    })();
  }, [alunoId, cycles, oldestStart]);

  const groups = useMemo(() => {
    if (!cycles) return [];
    return cycles.slice(0, shownCycles).map((c, idx) => {
      const rows = logs.filter((l) =>
        (!c.start || l.data_conclusao >= c.start) && (!c.end || l.data_conclusao <= c.end));
      const rated = rows.filter((r) => r.avaliacao != null);
      const media = rated.length ? rated.reduce((s, r) => s + (r.avaliacao ?? 0), 0) / rated.length : null;
      const label = idx === 0
        ? (c.start ? `Ciclo atual · desde ${fmt(c.start)}` : "Todos os treinos")
        : c.start ? `${fmt(c.start)} – ${fmt(c.end!)}` : `Até ${fmt(c.end!)}`;
      return { label, rows: onlyComments ? rows.filter((r) => r.comentario) : rows, total: rows.length, media, ratedCount: rated.length };
    });
  }, [cycles, shownCycles, logs, onlyComments]);

  const hasMore = !!cycles && shownCycles < cycles.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-foreground">Treinos concluídos</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)" }}>Nota e comentário que o aluno deixa ao finalizar cada treino</p>
        </div>
        <button
          type="button"
          onClick={() => setOnlyComments((v) => !v)}
          className="text-xs px-3 h-8 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: onlyComments ? "rgba(var(--cp-rgb),0.12)" : "var(--surface-2)",
            border: `1px solid ${onlyComments ? "rgba(var(--cp-rgb),0.35)" : "var(--border-subtle)"}`,
            color: onlyComments ? "var(--cp-400)" : "var(--ui-inactive-color)",
          }}
        >
          Só com comentário
        </button>
      </div>

      {!cycles || (loading && logs.length === 0) ? (
        <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-dim)" }}>
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : (
        groups.map((g, gi) => (
          <div key={gi} className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{g.label}</p>
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
                {g.media != null && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-foreground">{g.media.toFixed(1).replace(".", ",")}</span>
                    <span>média</span>
                  </span>
                )}
                <span>· {g.total} {g.total === 1 ? "treino" : "treinos"}</span>
              </div>
            </div>

            {g.rows.length === 0 ? (
              <p className="px-4 py-5 text-xs" style={{ color: "var(--text-dim)" }}>
                {onlyComments && g.total > 0 ? "Nenhum comentário neste período." : "Nenhum treino concluído neste período."}
              </p>
            ) : (
              g.rows.map((r) => (
                <div key={r.id} className="px-4 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-baseline gap-2">
                      <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--text-dim)" }}>{fmt(r.data_conclusao)}</span>
                      <span className="text-sm font-medium text-foreground truncate">{r.treinos?.titulo_treino || "Treino"}</span>
                    </div>
                    {r.avaliacao != null
                      ? <Stars value={r.avaliacao} />
                      : <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>sem nota</span>}
                  </div>
                  {r.comentario && (
                    <p className="mt-1.5 text-xs leading-relaxed flex gap-1.5" style={{ color: "hsl(var(--foreground) / 0.75)" }}>
                      <MessageSquareQuote className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: "var(--cp-400)" }} />
                      <span className="texto-multilinha">{r.comentario}</span>
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        ))
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setShownCycles((n) => n + 1)}
          disabled={loading}
          className="w-full h-9 rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--ui-inactive-color)" }}
        >
          Ver ciclo anterior
        </button>
      )}
    </div>
  );
};

export default TreinoFeedbacks;
