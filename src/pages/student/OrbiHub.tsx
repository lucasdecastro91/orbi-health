import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { MessageCircle, Calendar, Moon, ChevronRight } from "lucide-react";

/**
 * Página aberta pelo símbolo ORBI no centro da nav — reúne o que sobrou sem
 * atalho próprio depois do redesign (Mensagens já tem ícone direto no
 * Dashboard; Perfil/Senha/Notificações ficam só no dropdown do avatar).
 * Avaliação Postural NÃO entra aqui — é um recurso condicionado ao plano da
 * org, e esse botão é central/universal pra qualquer plano; ela continua
 * só em Perfil > Ferramentas. Antes esse símbolo abria um bottom sheet;
 * agora é uma página de verdade, com rota própria — mesmo padrão dos
 * outros itens da nav (todos navegam pra uma URL, nenhum abre modal).
 */
const OrbiHub = () => {
  const navigate = useNavigate();
  const { slug, org } = useTenantContext();
  const base = `/${slug}/aluno`;

  const [feedbackNovo, setFeedbackNovo] = useState(false);

  useEffect(() => { loadPendencias(); }, []);

  const loadPendencias = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: aluno } = await supabase
      .from("alunos")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (aluno?.id) {
      const { count } = await supabase
        .from("feedbacks_alunos")
        .select("id", { count: "exact", head: true })
        .eq("aluno_id", aluno.id)
        .eq("visto_pelo_aluno", false);
      setFeedbackNovo((count ?? 0) > 0);
    }
  };

  const items = [
    { label: "Feedbacks", desc: "Avaliações e comentários do seu profissional", icon: MessageCircle, path: `${base}/feedbacks`, badge: feedbackNovo },
    { label: "Agenda", desc: "Seus compromissos e sessões marcadas", icon: Calendar, path: `${base}/agenda`, badge: false },
    { label: "Calculadora de Sono", desc: "Calculadora de ciclos de sono", icon: Moon, path: `${base}/sono`, badge: false },
  ];

  return (
    <div className="pb-6">
      {/* Cabeçalho colorido enxuto — só ícone+título (padrão replicado em
          todas as telas individuais do aluno, 2026-09-09). O ícone é o
          símbolo ORBI (fixo), o título é o nome da org (muda por treinador). */}
      <div
        className="relative px-4 pt-3 pb-9"
        style={{
          background: "linear-gradient(to top, var(--cp-400) 0%, var(--cp-600) 45%, var(--cp-600) 100%)",
        }}
      >
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 64 64" fill="none" style={{ width: 20, height: 20 }} className="shrink-0">
            <path d="M 50.8 25.2 A 20 20 0 1 1 38.8 13.2" stroke="#fff" strokeWidth={5} strokeLinecap="round" />
            <circle cx="46.1" cy="17.9" r="4.5" fill="#fff" />
            <circle cx="32" cy="32" r="2" fill="#fff" />
          </svg>
          <h1 className="text-xl font-bold text-white">{org?.name || "ORBI Health"}</h1>
        </div>
      </div>

      <div
        className="relative max-w-lg mx-auto px-4 pt-6 rounded-t-[28px]"
        style={{ marginTop: -24, backgroundColor: "hsl(var(--background))" }}
      >
        <div className="rounded-2xl border border-white/8 p-2 space-y-1" style={{ backgroundColor: "hsl(var(--foreground) / 0.02)" }}>
          {items.map((item) => (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              className="w-full flex items-center gap-3 px-3 py-3.5 rounded-xl transition-colors text-left"
              style={{ backgroundColor: "hsl(var(--foreground) / 0.04)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.08)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "hsl(var(--foreground) / 0.04)"; }}
            >
              <div className="relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(var(--cp-rgb),0.12)" }}>
                <item.icon className="w-4 h-4" style={{ color: "var(--cp-500)" }} />
                {item.badge && (
                  <span
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: "hsl(0 70% 55%)" }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-40 shrink-0" />
            </button>
          ))}
        </div>

        {/* Placeholder — Exames ainda não implementado, ver ROADMAP.md */}
        <p className="text-center mt-4 text-xs text-muted-foreground opacity-50">
          Mais recursos chegando em breve.
        </p>
      </div>
    </div>
  );
};

export default OrbiHub;
