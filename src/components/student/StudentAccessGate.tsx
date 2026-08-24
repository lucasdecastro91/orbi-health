import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";

const CARD_BG     = "var(--section-card-bg)";
const CARD_BG_2   = "var(--section-card-bg-2)";
const CARD_BORDER = "var(--section-card-border)";
const CARD_SHADOW = "var(--section-card-shadow)";

interface AlunoAccess {
  ativo: boolean;
  desativado_por_inadimplencia: boolean;
  data_expiracao_plano: string | null;
}

const StudentAccessGate = () => {
  const { org } = useTenantContext();
  const [loading, setLoading] = useState(true);
  const [access, setAccess]   = useState<AlunoAccess | null>(null);

  useEffect(() => {
    let alunoUserId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }
      alunoUserId = session.user.id;

      const { data, error } = await supabase
        .from("alunos")
        .select("ativo, desativado_por_inadimplencia, data_expiracao_plano")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("[StudentAccessGate] Erro ao checar acesso:", error);
        setLoading(false);
        return;
      }

      setAccess(data as AlunoAccess | null);
      setLoading(false);

      // Se o treinador desativar o aluno com o app já aberto, aplica o bloqueio
      // na hora, sem precisar de reload.
      channel = supabase
        .channel(`student-access-${session.user.id}`)
        .on("postgres_changes", {
          event: "UPDATE",
          schema: "public",
          table: "alunos",
          filter: `user_id=eq.${session.user.id}`,
        }, (payload) => {
          setAccess(payload.new as AlunoAccess);
        })
        .subscribe();
    };

    void load();

    return () => { if (channel) supabase.removeChannel(channel); };
  }, []);

  if (loading) return null;

  if (access && access.ativo === false) {
    const orgName = (org as any)?.nome_marca ?? org?.name ?? "sua plataforma";
    const bloqueadoPorInadimplencia = access.desativado_por_inadimplencia;
    const dataFmt = access.data_expiracao_plano
      ? access.data_expiracao_plano.split("-").reverse().join("/")
      : null;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div
          className="w-full max-w-sm rounded-2xl overflow-hidden p-6 text-center"
          style={{ background: `linear-gradient(135deg, ${CARD_BG}, ${CARD_BG_2})`, border: `1px solid ${CARD_BORDER}`, boxShadow: CARD_SHADOW }}
        >
          {org?.logo_url && (
            <img src={org.logo_url} alt={orgName} className="h-10 mx-auto mb-4 object-contain" />
          )}
          <h1 className="text-lg font-bold text-white mb-2">
            {bloqueadoPorInadimplencia ? "Acesso bloqueado" : "Acesso suspenso"}
          </h1>
          <p className="text-sm text-white/60 leading-relaxed mb-6">
            {bloqueadoPorInadimplencia
              ? `Seu plano venceu${dataFmt ? ` em ${dataFmt}` : ""} e não foi renovado dentro do prazo. Entre em contato com ${orgName} para regularizar o pagamento e liberar seu acesso novamente.`
              : `Seu acesso foi suspenso por ${orgName}. Entre em contato para mais informações.`}
          </p>
          <Button
            variant="outline"
            className="w-full h-10 rounded-xl border-white/10 text-white/70 hover:text-white"
            onClick={() => supabase.auth.signOut().then(() => window.location.reload())}
          >
            Sair
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
};

export default StudentAccessGate;
