import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { Trophy, Zap, Medal, Crown, Star } from "lucide-react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  student_id: string;
  total_xp: number;
  nome: string;
  avatar_url: string | null;
}

interface MyXP {
  total_xp: number;
  rank: number;
  recent: { source: string; xp: number; ref_date: string; note: string | null }[];
}

// ─────────────────────────────────────────────────────────────
// XP source labels
// ─────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  workout_complete: "Treino concluído",
  diet_day:        "Dia de dieta",
  checkin:         "Check-in semanal",
  streak_bonus:    "Bônus de sequência",
  manual:          "Bônus do treinador",
};

const SOURCE_ICON: Record<string, string> = {
  workout_complete: "💪",
  diet_day:        "🥗",
  checkin:         "📋",
  streak_bonus:    "🔥",
  manual:          "⭐",
};

// ─────────────────────────────────────────────────────────────
// XP amounts (mirrors what the client code should award)
// ─────────────────────────────────────────────────────────────

export const XP_VALUES = {
  workout_complete: 50,
  diet_day:        30,
  checkin:         20,
  streak_bonus:    25,
} as const;

// ─────────────────────────────────────────────────────────────
// Rank chip
// ─────────────────────────────────────────────────────────────

const RankChip = ({ rank }: { rank: number }) => {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-zinc-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-white/40 w-5 text-center">{rank}</span>;
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const Ranking = () => {
  const { toast }   = useToast();
  const { orgId }   = useTenantContext();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myXP,        setMyXP]        = useState<MyXP | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [myId,        setMyId]        = useState<string | null>(null);

  useEffect(() => { if (orgId) loadData(); }, [orgId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setMyId(session.user.id);

      // Load leaderboard — top 20
      const { data: totals, error: totalsErr } = await supabase
        .from("xp_totals")
        .select("student_id, total_xp")
        .eq("org_id", orgId)
        .order("total_xp", { ascending: false })
        .limit(20);
      if (totalsErr) throw totalsErr;

      if (!totals || totals.length === 0) {
        setLeaderboard([]);
        setLoading(false);
        return;
      }

      // Fetch names/avatars for all students
      const ids = totals.map((t: any) => t.student_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, nome, avatar_url")
        .in("id", ids);

      const profileMap: Record<string, { nome: string; avatar_url: string | null }> = {};
      for (const p of profiles ?? []) profileMap[p.id] = { nome: p.nome, avatar_url: p.avatar_url };

      const board: LeaderboardEntry[] = (totals as any[]).map((t) => ({
        student_id: t.student_id,
        total_xp:   t.total_xp,
        nome:       profileMap[t.student_id]?.nome ?? "Aluno",
        avatar_url: profileMap[t.student_id]?.avatar_url ?? null,
      }));
      setLeaderboard(board);

      // My rank & recent events
      const myRank   = board.findIndex((e) => e.student_id === session.user.id) + 1;
      const myTotal  = board.find((e) => e.student_id === session.user.id)?.total_xp ?? 0;

      const { data: recentEvents } = await supabase
        .from("xp_events")
        .select("source, xp, ref_date, note")
        .eq("student_id", session.user.id)
        .order("ref_date", { ascending: false })
        .limit(10);

      setMyXP({
        total_xp: myTotal,
        rank:     myRank || board.length + 1,
        recent:   (recentEvents ?? []) as any[],
      });
    } catch (err: any) {
      toast({ title: "Erro ao carregar ranking", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-green-600/30 border-t-green-600 animate-spin" />
          <p className="text-white/40 text-sm">Carregando ranking...</p>
        </div>
      </div>
    );
  }

  const noData = leaderboard.length === 0;

  return (
    <div className="min-h-screen pb-24">

      {/* Header */}
      <div className="px-4 pt-6 pb-4 md:px-6">
        <div className="flex items-center gap-3 mb-1">
          <Trophy className="w-5 h-5 text-yellow-400" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Ranking</h1>
        </div>
        <p className="text-white/40 text-sm">Pontuação dos alunos nesta academia</p>
      </div>

      <div className="px-4 md:px-6 space-y-4">

        {/* My XP card */}
        {myXP && (
          <div
            className="rounded-2xl border p-4 flex items-center justify-between"
            style={{ backgroundColor: "rgba(var(--cp-rgb),0.07)", borderColor: "rgba(var(--cp-rgb),0.22)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white"
                style={{ background: "var(--cp-gradient)" }}
              >
                {myXP.rank}º
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wider">Minha posição</p>
                <p className="text-base font-semibold text-white">
                  {myXP.total_xp.toLocaleString("pt-BR")} <span className="text-green-500 text-sm font-medium">XP</span>
                </p>
              </div>
            </div>
            <Zap className="w-6 h-6 text-green-500/60" />
          </div>
        )}

        {/* Leaderboard */}
        {noData ? (
          <div className="rounded-2xl border border-white/8 py-12 flex flex-col items-center gap-3" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
            <Trophy className="w-10 h-10 text-white/10" />
            <p className="text-white/30 text-sm text-center">Ainda ninguém no ranking.<br />Complete treinos para ganhar XP!</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-white/8 overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
            {leaderboard.map((entry, idx) => {
              const rank   = idx + 1;
              const isMe   = entry.student_id === myId;
              const initials = entry.nome.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

              return (
                <div
                  key={entry.student_id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors"
                  style={{
                    borderBottom: idx < leaderboard.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    backgroundColor: isMe ? "rgba(var(--cp-rgb),0.06)" : undefined,
                  }}
                >
                  {/* Rank */}
                  <div className="w-6 flex justify-center shrink-0">
                    <RankChip rank={rank} />
                  </div>

                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: isMe ? "linear-gradient(135deg, var(--cp-500), hsl(var(--primary)))" : "rgba(255,255,255,0.1)" }}
                  >
                    {entry.avatar_url
                      ? <img src={entry.avatar_url} alt={entry.nome} className="w-full h-full object-cover" />
                      : initials}
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: isMe ? "var(--cp-400)" : "hsl(var(--foreground))" }}
                    >
                      {isMe ? "Você" : entry.nome.split(" ")[0]}
                    </p>
                  </div>

                  {/* XP */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Star className="w-3 h-3 text-yellow-400/70" />
                    <span
                      className="text-sm font-bold"
                      style={{ color: isMe ? "var(--cp-400)" : "hsl(var(--foreground))" }}
                    >
                      {entry.total_xp.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* My recent XP events */}
        {myXP && myXP.recent.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-white/35 uppercase tracking-wider font-medium">Meus ganhos recentes</p>
            {myXP.recent.map((ev, i) => (
              <div
                key={i}
                className="rounded-2xl border px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{SOURCE_ICON[ev.source] ?? "⭐"}</span>
                  <div>
                    <p className="text-sm text-white/75 font-medium">{SOURCE_LABEL[ev.source] ?? ev.source}</p>
                    {ev.note && <p className="text-xs text-white/30">{ev.note}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-green-500">+{ev.xp}</span>
                  <span className="text-xs text-green-500/60">XP</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* How to earn XP */}
        <div
          className="rounded-2xl border p-4"
          style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.06)" }}
        >
          <p className="text-xs text-white/35 uppercase tracking-wider mb-3">Como ganhar XP</p>
          <div className="space-y-2">
            {[
              { icon: "💪", label: "Completar um treino",      xp: XP_VALUES.workout_complete },
              { icon: "🥗", label: "Completar todas as refeições", xp: XP_VALUES.diet_day     },
              { icon: "📋", label: "Enviar check-in semanal",  xp: XP_VALUES.checkin          },
              { icon: "🔥", label: "Bônus de sequência (7d)",  xp: XP_VALUES.streak_bonus     },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{item.icon}</span>
                  <span className="text-sm text-white/55">{item.label}</span>
                </div>
                <span className="text-sm font-bold text-green-500">+{item.xp} XP</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Ranking;
