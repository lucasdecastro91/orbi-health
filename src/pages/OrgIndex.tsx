import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";

/**
 * OrgIndex — rota /:slug (raiz da org)
 *
 * Comportamento:
 * - Se o usuário está logado e é membro desta org → redireciona para
 *   /:slug/treinador ou /:slug/aluno conforme o papel
 * - Se não está logado → redireciona para /auth (login genérico)
 * - Se a org não existe → 404 simples
 */
const OrgIndex = () => {
  const { slug } = useParams<{ slug: string }>();
  const { org, isLoading } = useTenantContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    const redirect = async () => {
      // Org não encontrada — login genérico
      if (!org) {
        navigate("/auth", { replace: true });
        return;
      }

      // Verifica sessão ativa
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Redireciona para o login com branding do tenant já aplicado
        navigate(`/entrar/${slug}`, { replace: true });
        return;
      }

      // Determina o papel pelo tipo de usuário
      const { data: profile } = await supabase
        .from("profiles")
        .select("tipo_usuario")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile?.tipo_usuario === "treinador") {
        navigate(`/${slug}/treinador`, { replace: true });
      } else {
        navigate(`/${slug}/aluno`, { replace: true });
      }
    };

    redirect();
  }, [isLoading, org, slug, navigate]);

  // Tela de carregamento enquanto resolve o redirect
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-green-600/30 border-t-green-600 animate-spin" />
        <p className="text-white/30 text-sm">Carregando...</p>
      </div>
    </div>
  );
};

export default OrgIndex;
