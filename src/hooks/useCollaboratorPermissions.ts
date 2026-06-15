import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface CollabPerms {
  treino: {
    clientes:              boolean;
    agenda:                boolean;
    biblioteca_exercicios: boolean;
    modelos_treino:        boolean;
  };
  nutricao: {
    alimentos:       boolean;
    banco_alimentos: boolean;
  };
  gestao: {
    mensagens:       boolean;
    leads_crm:       boolean;
    financeiro:      boolean;
    produtos_planos: boolean;
    notificacoes:    boolean;
  };
  administracao: {
    configuracoes: boolean;
  };
  abas_aluno: {
    treinos:      boolean;
    dieta:        boolean;
    plano:        boolean;
    alongamentos: boolean;
    cardio:       boolean;
    postural:     boolean;
    checkins:     boolean;
    evolucao:     boolean;
    anamnese:     boolean;
    atualizacao:  boolean;
    feedbacks:    boolean;
  };
}

/** Permissões padrão ao criar um novo colaborador — tudo desligado, treinador define */
export const DEFAULT_COLLAB_PERMS: CollabPerms = {
  treino:        { clientes: true,  agenda: false, biblioteca_exercicios: true, modelos_treino: true },
  nutricao:      { alimentos: false, banco_alimentos: false },
  gestao:        { mensagens: true,  leads_crm: false, financeiro: false, produtos_planos: false, notificacoes: true },
  administracao: { configuracoes: false },
  abas_aluno: {
    treinos:      false,
    dieta:        false,
    plano:        false,
    alongamentos: false,
    cardio:       false,
    postural:     false,
    checkins:     false,
    evolucao:     false,
    anamnese:     false,
    atualizacao:  false,
    feedbacks:    false,
  },
};

export interface CollaboratorPermissionsResult {
  /** True se o usuário logado é um colaborador (não o owner) nesta org */
  isCollaborator: boolean;
  /** Permissões carregadas do banco. Null se owner ou ainda carregando. */
  permissions: CollabPerms | null;
  /** Checa se o colaborador tem acesso à chave dentro de uma categoria */
  can: (category: keyof CollabPerms, key: string) => boolean;
  loading: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCollaboratorPermissions(): CollaboratorPermissionsResult {
  const { orgId } = useTenantContext();
  const [loading,       setLoading]       = useState(true);
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [permissions,   setPermissions]   = useState<CollabPerms | null>(null);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }

    setLoading(true);
    let cancelled = false;

    const check = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) { setLoading(false); return; }

        const { data } = await supabase
          .from("collaborators")
          .select("permissions")
          .eq("user_id", user.id)
          .eq("org_id", orgId)
          .eq("status", "active")
          .maybeSingle();

        if (cancelled) return;

        if (data) {
          setIsCollaborator(true);
          setPermissions(data.permissions as CollabPerms);
        } else {
          setIsCollaborator(false);
          setPermissions(null);
        }
      } catch {
        if (!cancelled) { setIsCollaborator(false); setPermissions(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [orgId]);

  const can = (category: keyof CollabPerms, key: string): boolean => {
    // Owner/trainer: acesso irrestrito
    if (!isCollaborator) return true;
    if (!permissions)    return false;
    const cat = permissions[category] as Record<string, boolean>;
    return cat?.[key] ?? false;
  };

  return { isCollaborator, permissions, can, loading };
}
