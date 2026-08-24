import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Star, Crown, Medal, Loader2 } from "lucide-react";

interface RankedStudent {
  student_id: string;
  nome: string;
  avatar_url: string | null;
  total_xp: number;
  rank: number;
}

const RankChip = ({ rank }: { rank: number }) => {
  if (rank === 1) return <Crown className="w-5 h-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-zinc-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
};

const CoachRanking = () => {
  const { toast } = useToast();
  const { slug, orgId } = useTenantContext();
  const navigate = useNavigate();

  const [students, setStudents] = useState<RankedStudent[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => { if (orgId) loadData(); }, [orgId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: alunos, error: alunosErr } = await supabase
        .from("alunos")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("ativo", true);
      if (alunosErr) throw alunosErr;

      const ids = (alunos ?? []).map((a) => a.user_id);
      if (ids.length === 0) { setStudents([]); return; }

      const [{ data: profiles, error: profilesErr }, { data: totals, error: totalsErr }] = await Promise.all([
        supabase.from("profiles").select("id, nome, avatar_url").in("id", ids),
        supabase.from("xp_totals").select("student_id, total_xp, updated_at").eq("org_id", orgId),
      ]);
      if (profilesErr) throw profilesErr;
      if (totalsErr) throw totalsErr;

      const totalMap: Record<string, number> = {};
      const updatedAtMap: Record<string, string> = {};
      for (const t of totals ?? []) { totalMap[t.student_id] = t.total_xp; updatedAtMap[t.student_id] = t.updated_at; }

      // Desempate: quem bateu esse total primeiro (updated_at mais antigo) — mesmo
      // critério do ranking do aluno, pra não divergir entre as duas telas. Quem
      // nunca gerou XP não tem updated_at; entre esses, cai pro nome como último recurso.
      const merged = ids
        .map((id) => {
          const p = (profiles ?? []).find((pr) => pr.id === id);
          return {
            student_id: id,
            nome: p?.nome ?? "Aluno",
            avatar_url: p?.avatar_url ?? null,
            total_xp: totalMap[id] ?? 0,
            updated_at: updatedAtMap[id] ?? null,
          };
        })
        .sort((a, b) => {
          if (b.total_xp !== a.total_xp) return b.total_xp - a.total_xp;
          if (a.updated_at && b.updated_at) return a.updated_at.localeCompare(b.updated_at);
          if (a.updated_at !== b.updated_at) return a.updated_at ? -1 : 1;
          return a.nome.localeCompare(b.nome);
        });

      // Ranking sequencial (não divide posição em empate): quem bateu aquele XP
      // primeiro fica na posição melhor, o próximo pega a seguinte, etc. — decisão do
      // Lucas (2026-07-13): mais coerente que "posição compartilhada" quando dá pra
      // saber quem chegou primeiro.
      const ranked: RankedStudent[] = merged.map((s, i) => ({
        ...s,
        rank: i + 1,
      }));

      setStudents(ranked);
    } catch (err: any) {
      toast({ title: "Erro ao carregar ranking", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12 px-4 py-6 md:px-6">
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="w-5 h-5" style={{ color: "var(--cp-400)" }} />
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Ranking</h1>
      </div>

      {students.length === 0 ? (
        <div className="rounded-2xl py-12 flex flex-col items-center gap-3"
          style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
          <Trophy className="w-10 h-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm text-center">Nenhum aluno ativo nesta org ainda.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "var(--section-card-bg)", border: "1px solid var(--section-card-border)", boxShadow: "var(--section-card-shadow)" }}>
          {students.map((entry, idx) => {
            const initials = entry.nome.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
            return (
              <button
                key={entry.student_id}
                type="button"
                onClick={() => navigate(`/${slug}/treinador/aluno/${entry.student_id}`)}
                className="w-full flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 text-left"
                style={{ borderBottom: idx < students.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
              >
                <div className="w-6 flex justify-center shrink-0">
                  <RankChip rank={entry.rank} />
                </div>
                <div
                  className="w-9 h-9 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: "var(--avatar-fallback-bg)" }}
                >
                  {entry.avatar_url
                    ? <img src={entry.avatar_url} alt={entry.nome} className="w-full h-full object-cover" />
                    : initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{entry.nome}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Star className="w-3 h-3 text-yellow-400/70" />
                  <span className="text-sm font-bold text-foreground">{entry.total_xp.toLocaleString("pt-BR")}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CoachRanking;
