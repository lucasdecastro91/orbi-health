import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import {
  Trophy, Zap, Medal, Crown, Star, Flame, ChevronDown, Info,
  Dumbbell, Utensils, Droplet, CheckCircle2, ClipboardList,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { XP_VALUES } from "@/lib/xp";

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

interface MyProfile {
  nome: string;
  avatar_url: string | null;
}

interface CategoryCounts {
  treinos: number;
  dieta: number;
  agua: number;
  cardio: number;
}

// ─────────────────────────────────────────────────────────────
// XP source labels
// ─────────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  workout_complete: "Treino concluído",
  diet_day:         "Dia de dieta completo",
  agua_day:         "Meta de água batida",
  cardio_complete:  "Sessão de cardio registrada",
  checkin_on_time:  "Atualização no prazo",
  checkin_late:     "Atualização atrasada",
  streak_3:         "Sequência de 3 dias",
  streak_7:         "Sequência de 7 dias",
  streak_14:        "Sequência de 14 dias",
  streak_30:        "Sequência de 30 dias",
  manual:           "Bônus do treinador",
};

const SOURCE_ICON: Record<string, LucideIcon> = {
  workout_complete: Dumbbell,
  diet_day:         Utensils,
  agua_day:         Droplet,
  cardio_complete:  Zap,
  checkin_on_time:  CheckCircle2,
  checkin_late:     ClipboardList,
  streak_3:         Flame,
  streak_7:         Flame,
  streak_14:        Flame,
  streak_30:        Trophy,
  manual:           Star,
};

// ─────────────────────────────────────────────────────────────
// Rank chip
// ─────────────────────────────────────────────────────────────

const RankChip = ({ rank }: { rank: number }) => {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-zinc-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-white/40 w-5 text-center">{rank}</span>;
};

const CARD_BORDER = "rgba(var(--cp-rgb),0.25)";

/** "YYYY-MM-DD" → "dd/mm" */
const fmtEventDate = (iso: string): string => {
  const [, mm, dd] = iso.split("-");
  return `${dd}/${mm}`;
};

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

const Ranking = () => {
  const { toast }   = useToast();
  const { orgId }   = useTenantContext();

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myXP,        setMyXP]        = useState<MyXP | null>(null);
  const [myProfile,   setMyProfile]   = useState<MyProfile | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCounts>({ treinos: 0, dieta: 0, agua: 0, cardio: 0 });
  const [competitorCount, setCompetitorCount] = useState(0);
  const [loading,     setLoading]     = useState(true);
  const [myId,        setMyId]        = useState<string | null>(null);
  const [streak,      setStreak]      = useState<{ atual: number; recorde: number }>({ atual: 0, recorde: 0 });
  const [rulesOpen,   setRulesOpen]   = useState(false);

  useEffect(() => { if (orgId) loadData(); }, [orgId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setMyId(session.user.id);

      const { data: myProfileData } = await supabase
        .from("profiles")
        .select("nome, avatar_url")
        .eq("id", session.user.id)
        .maybeSingle();
      setMyProfile(myProfileData ?? null);

      // Load leaderboard — top 20
      // Desempate: quem bateu esse total primeiro (updated_at mais antigo) — mesmo
      // critério usado no ranking do painel do treinador, pra não divergir.
      const { data: totals, error: totalsErr } = await supabase
        .from("xp_totals")
        .select("student_id, total_xp")
        .eq("org_id", orgId)
        .order("total_xp", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(20);
      if (totalsErr) throw totalsErr;

      let board: LeaderboardEntry[] = [];
      if (totals && totals.length > 0) {
        // Fetch names/avatars for all students via RPC — profiles não tem RLS
        // pra aluno ver outro aluno, então isso passa por uma função
        // SECURITY DEFINER que só libera nomes de quem é da mesma org.
        const ids = totals.map((t: any) => t.student_id);
        const { data: profiles } = await supabase
          .rpc("get_org_leaderboard_profiles", { p_org_id: orgId, p_student_ids: ids });

        const profileMap: Record<string, { nome: string; avatar_url: string | null }> = {};
        for (const p of profiles ?? []) profileMap[p.id] = { nome: p.nome, avatar_url: p.avatar_url };

        board = (totals as any[]).map((t) => ({
          student_id: t.student_id,
          total_xp:   t.total_xp,
          nome:       profileMap[t.student_id]?.nome ?? "Aluno",
          avatar_url: profileMap[t.student_id]?.avatar_url ?? null,
        }));
      }
      setLeaderboard(board);

      // "N competidores" precisa contar todos os alunos ATIVOS da org, não só quem já
      // gerou XP (xp_totals só tem linha pra quem já pontuou pelo menos uma vez) — por
      // isso é uma RPC separada, não board.length.
      const { data: activeCount, error: countErr } = await supabase
        .rpc("get_org_active_student_count", { p_org_id: orgId });
      if (countErr) throw countErr;
      setCompetitorCount((activeCount as number) ?? 0);

      // My rank & total: não derivar do board (top 20 de xp_totals) — quem fica de fora
      // do top 20 aparecia com total 0 e rank quebrado. RPC calcula contra o dado real
      // (+ sintéticos, se a org tiver — ver get_my_leaderboard_rank).
      const { data: myTotalRow } = await supabase
        .from("xp_totals")
        .select("total_xp")
        .eq("student_id", session.user.id)
        .eq("org_id", orgId)
        .maybeSingle();
      const myTotal = myTotalRow?.total_xp ?? 0;

      const { data: myRankData, error: rankErr } = await supabase
        .rpc("get_my_leaderboard_rank", { p_org_id: orgId });
      if (rankErr) throw rankErr;
      const myRank = (myRankData as number) ?? 1;

      const { data: recentEvents } = await supabase
        .from("xp_events")
        .select("source, xp, ref_date, note")
        .eq("student_id", session.user.id)
        .order("ref_date", { ascending: false })
        .limit(3);

      setMyXP({
        total_xp: myTotal,
        rank:     myRank,
        recent:   (recentEvents ?? []) as any[],
      });

      // Category breakdown (todos os eventos, não só os 10 mais recentes)
      const { data: allEvents } = await supabase
        .from("xp_events")
        .select("source")
        .eq("student_id", session.user.id);
      const counts: CategoryCounts = { treinos: 0, dieta: 0, agua: 0, cardio: 0 };
      for (const e of (allEvents as any[]) ?? []) {
        if (e.source === "workout_complete") counts.treinos++;
        else if (e.source === "diet_day") counts.dieta++;
        else if (e.source === "agua_day") counts.agua++;
        else if (e.source === "cardio_complete") counts.cardio++;
      }
      setCategoryCounts(counts);

      const { data: streakRow } = await supabase
        .from("aluno_streaks")
        .select("sequencia_atual, melhor_sequencia")
        .eq("student_id", session.user.id)
        .maybeSingle();
      setStreak({
        atual:   (streakRow as any)?.sequencia_atual ?? 0,
        recorde: (streakRow as any)?.melhor_sequencia ?? 0,
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
  const firstName = (myProfile?.nome ?? "Você").split(" ")[0];
  const initials = (myProfile?.nome ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen pb-24">

      {/* Header */}
      <div className="px-4 pt-6 pb-4 md:px-6">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
          <h1 className="text-2xl font-bold text-white tracking-tight">Ranking</h1>
        </div>
      </div>

      <div className="px-4 md:px-6 space-y-4">

        {/* Meu perfil: avatar + posição + XP + competidores */}
        <div
          className="rounded-2xl border p-4"
          style={{
            background: "linear-gradient(to bottom, rgba(var(--cp-rgb),0.22) 0%, rgba(var(--cp-rgb),0.06) 45%, transparent 80%), hsl(var(--background))",
            borderColor: CARD_BORDER,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div
                  className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-base font-bold text-white"
                  style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)" }}
                >
                  {myProfile?.avatar_url
                    ? <img src={myProfile.avatar_url} alt={firstName} className="w-full h-full object-cover" />
                    : initials}
                </div>
                {myXP && (
                  <div
                    className="absolute -bottom-1 -right-1 min-w-[22px] h-[22px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2"
                    style={{ backgroundColor: "#0a0a0b", borderColor: "var(--cp-500)" }}
                  >
                    #{myXP.rank}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-white truncate">{firstName}</p>
                <p className="text-xs text-white/40">
                  {competitorCount} competidor{competitorCount === 1 ? "" : "es"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 shrink-0" style={{ backgroundColor: "rgba(var(--cp-rgb),0.15)" }}>
              <Zap className="w-3.5 h-3.5" style={{ color: "var(--cp-400)" }} />
              <span className="text-sm font-bold" style={{ color: "var(--cp-400)" }}>{(myXP?.total_xp ?? 0).toLocaleString("pt-BR")} XP</span>
            </div>
          </div>

          {myXP && (
            <div
              className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: "rgba(var(--cp-rgb),0.08)", border: "1px solid rgba(var(--cp-rgb),0.22)" }}
            >
              <Trophy className="w-4 h-4 shrink-0" style={{ color: "var(--cp-400)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--cp-400)" }}>
                {myXP.rank === 1 ? "Você lidera o ranking!" : `Você está em ${myXP.rank}º lugar!`}
              </p>
            </div>
          )}
        </div>

        {/* Pills de categoria — 3 cabem inteiros, só a pontinha do 4º aparece */}
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {[
            { icon: Dumbbell, label: "Treinos", count: categoryCounts.treinos },
            { icon: Utensils, label: "Dieta",   count: categoryCounts.dieta   },
            { icon: Zap,      label: "Cardio",  count: categoryCounts.cardio  },
            { icon: Droplet,  label: "Água",    count: categoryCounts.agua    },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl px-3 py-2.5 flex items-center gap-1.5 shrink-0"
              style={{ backgroundColor: "var(--surface-1)", border: "1px solid var(--border-subtle)", minWidth: 96 }}
            >
              <item.icon className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--cp-400)" }} />
              <p className="text-xs font-semibold text-foreground whitespace-nowrap">
                <span style={{ color: "var(--cp-400)" }}>{item.count}</span> {item.label}
              </p>
            </div>
          ))}
        </div>

        {/* Sequência atual / recorde */}
        <div
          className="rounded-2xl border p-4 flex items-center justify-between"
          style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: CARD_BORDER }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)" }}>
              <Flame className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
            </div>
            <div>
              <p className="text-base font-semibold text-white">{streak.atual} dias</p>
              <p className="text-xs text-white/40 uppercase tracking-wider">Sequência atual</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-base font-semibold text-white">{streak.recorde} dias</p>
            <p className="text-xs text-white/40 uppercase tracking-wider">Recorde</p>
          </div>
        </div>

        {/* Leaderboard */}
        {noData ? (
          <div className="rounded-2xl border py-12 flex flex-col items-center gap-3" style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: CARD_BORDER }}>
            <Trophy className="w-10 h-10 text-white/10" />
            <p className="text-white/30 text-sm text-center">Ainda ninguém no ranking.<br />Complete treinos para ganhar XP!</p>
          </div>
        ) : (
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: CARD_BORDER }}>
            {(() => { const top3 = leaderboard.slice(0, 3); return top3.map((entry, idx) => {
              const rank   = idx + 1;
              const isMe   = entry.student_id === myId;
              const initials = entry.nome.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

              return (
                <div
                  key={entry.student_id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors"
                  style={{
                    borderBottom: idx < top3.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
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
                      {isMe ? "Você" : entry.nome}
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
            }); })()}
          </div>
        )}

        {/* My recent XP events */}
        {myXP && myXP.recent.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-white/35 uppercase tracking-wider font-medium">Meus ganhos recentes</p>
            {myXP.recent.map((ev, i) => {
              const EventIcon = SOURCE_ICON[ev.source] ?? Star;
              return (
                <div
                  key={i}
                  className="rounded-2xl border px-4 py-2.5 flex items-center justify-between"
                  style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: CARD_BORDER }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)" }}>
                      <EventIcon className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
                    </div>
                    <div>
                      <p className="text-sm text-white/75 font-medium">{SOURCE_LABEL[ev.source] ?? ev.source}</p>
                      <p className="text-xs text-white/30">{ev.note || fmtEventDate(ev.ref_date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold" style={{ color: "var(--cp-400)" }}>+{ev.xp}</span>
                    <span className="text-xs" style={{ color: "var(--cp-400)", opacity: 0.6 }}>XP</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Como ganhar XP + Bônus de sequência — card único, recolhido por padrão */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "rgba(255,255,255,0.02)", borderColor: CARD_BORDER }}
        >
          <button
            type="button"
            onClick={() => setRulesOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/2 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
              <span className="text-sm font-semibold text-white">Pontuação</span>
            </div>
            <ChevronDown
              className="w-4 h-4 text-white/40 transition-transform duration-200"
              style={{ transform: rulesOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>

          <div style={{ display: "grid", gridTemplateRows: rulesOpen ? "1fr" : "0fr", transition: "grid-template-rows 250ms ease" }}>
            <div className="overflow-hidden">
              <div className="px-4 pb-4 space-y-4">
                <div className="space-y-2">
                  {[
                    { icon: Dumbbell,      label: "Completar um treino",         xp: XP_VALUES.workout_complete },
                    { icon: Utensils,      label: "Completar todas as refeições", xp: XP_VALUES.diet_day        },
                    { icon: Droplet,       label: "Bater a meta de água do dia", xp: XP_VALUES.agua_day         },
                    { icon: Zap,           label: "Registrar sessão de cardio",  xp: XP_VALUES.cardio_complete },
                    { icon: CheckCircle2,  label: "Enviar atualização no prazo", xp: XP_VALUES.checkin_on_time  },
                    { icon: ClipboardList, label: "Enviar atualização atrasada", xp: XP_VALUES.checkin_late     },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <item.icon className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
                        <span className="text-sm text-white/55">{item.label}</span>
                      </div>
                      <span className="text-sm font-bold" style={{ color: "var(--cp-400)" }}>+{item.xp} XP</span>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <p className="text-[11px] text-white/35 uppercase tracking-wider mb-1">Bônus de sequência</p>
                  <p className="text-[10px] text-white/25 mb-3">Treino + dieta + água no mesmo dia, dias seguidos (dias de descanso não quebram a sequência)</p>
                  <div className="space-y-2">
                    {[
                      { label: "3 dias seguidos",  xp: XP_VALUES.streak_3,  icon: Flame  },
                      { label: "7 dias seguidos",  xp: XP_VALUES.streak_7,  icon: Flame  },
                      { label: "14 dias seguidos", xp: XP_VALUES.streak_14, icon: Flame  },
                      { label: "30 dias seguidos", xp: XP_VALUES.streak_30, icon: Trophy },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <item.icon className="w-4 h-4" style={{ color: "var(--cp-400)" }} />
                          <span className="text-sm text-white/55">{item.label}</span>
                        </div>
                        <span className="text-sm font-bold" style={{ color: "var(--cp-400)" }}>+{item.xp} XP</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Ranking;
