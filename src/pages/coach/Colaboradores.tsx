import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_COLLAB_PERMS, CollabPerms } from "@/hooks/useCollaboratorPermissions";
import {
  UserPlus, Loader2, Mail, MoreVertical, CheckCircle2,
  Clock, UserX, RefreshCw, Trash2, Lock, Edit, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getSessionDirect } from "@/lib/sessionUtils";

// ── Types ────────────────────────────────────────────────────────────────────

interface Collaborator {
  id:          string;
  name:        string;
  email:       string;
  role:        string;
  status:      "pending" | "active" | "inactive";
  permissions: CollabPerms;
  created_at:  string;
  accepted_at: string | null;
}

// ── Permission definitions ────────────────────────────────────────────────────

type PermCat = { label: string; emoji: string; keys: { key: string; label: string }[] };

const PERM_GROUPS: PermCat[] = [
  {
    label: "Treino", emoji: "🏋️",
    keys: [
      { key: "clientes",              label: "Meus Clientes"           },
      { key: "agenda",                label: "Agenda"                  },
      { key: "biblioteca_exercicios", label: "Biblioteca de Exercícios"},
      { key: "modelos_treino",        label: "Modelos de Treino"       },
    ],
  },
  {
    label: "Gestão", emoji: "💼",
    keys: [
      { key: "mensagens",      label: "Mensagens"       },
      { key: "leads_crm",      label: "Leads / CRM"     },
      { key: "financeiro",     label: "Financeiro"      },
      { key: "produtos_planos",label: "Produtos / Planos"},
      { key: "notificacoes",   label: "Notificações"    },
      { key: "ranking",        label: "Ranking"         },
    ],
  },
  {
    label: "Administração", emoji: "⚙️",
    keys: [{ key: "configuracoes", label: "Configurações" }],
  },
];

// hasDiet group added dynamically below

// ── Toggle component ─────────────────────────────────────────────────────────

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors"
    style={{ backgroundColor: checked ? "var(--cp-500, #22c55e)" : "rgba(255,255,255,0.12)" }}
  >
    <span
      className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5"
      style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
    />
  </button>
);

// ── Main component ────────────────────────────────────────────────────────────

const Colaboradores = () => {
  const { orgId, org, slug } = useTenantContext();
  const navigate = useNavigate();
  const { hasDiet, hasCollaborators, hasAvaliacaoPostural } = usePlanFeatures();
  const { toast } = useToast();

  const [collabs,  setCollabs]  = useState<Collaborator[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showMenu, setShowMenu] = useState<string | null>(null);

  // Modal state
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [form, setForm] = useState({
    name:        "",
    email:       "",
    role:        "",
    permissions: DEFAULT_COLLAB_PERMS as CollabPerms,
  });

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => { if (orgId) load(); }, [orgId]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("collaborators")
      .select("id, name, email, role, status, permissions, created_at, accepted_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setCollabs((data ?? []) as Collaborator[]);
    setLoading(false);
  };

  // ── Plan limit ─────────────────────────────────────────────────────────────
  // Colaboradores só disponível no tier de alunos ilimitados
  const atLimit = !hasCollaborators;

  // ── Open modal ────────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setForm({ name: "", email: "", role: "", permissions: DEFAULT_COLLAB_PERMS });
    setModalOpen(true);
  };

  const openEdit = (c: Collaborator) => {
    setEditingId(c.id);
    setForm({ name: c.name, email: c.email, role: c.role, permissions: c.permissions });
    setModalOpen(true);
    setShowMenu(null);
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.role.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      if (editingId) {
        // Edit: update permissions + role + name only (not email)
        const { error } = await supabase
          .from("collaborators")
          .update({ permissions: form.permissions, role: form.role, name: form.name })
          .eq("id", editingId);
        if (error) throw error;
        toast({ title: "Colaborador atualizado!" });
      } else {
        // Invite via edge function
        const session = getSessionDirect();
        if (!session) { toast({ title: "Sessão expirada", variant: "destructive" }); return; }

        const res = await supabase.functions.invoke("invite-collaborator", {
          body: { org_id: orgId, name: form.name, email: form.email, role: form.role, permissions: form.permissions },
        });
        if (res.error) {
          const msg: Record<string, string> = {
            plan_feature_unavailable: "Colaboradores disponível apenas no plano com alunos ilimitados.",
            email_already_active: "Este e-mail já é um colaborador ativo.",
          };
          throw new Error(msg[res.error.message] ?? res.error.message);
        }
        toast({ title: "Convite enviado!", description: `Um e-mail foi enviado para ${form.email}.` });
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Resend invite ─────────────────────────────────────────────────────────
  const handleResend = async (c: Collaborator) => {
    setShowMenu(null);
    try {
      const res = await supabase.functions.invoke("invite-collaborator", {
        body: { org_id: orgId, name: c.name, email: c.email, role: c.role, permissions: c.permissions },
      });
      if (res.error) throw new Error(res.error.message);
      toast({ title: "Convite reenviado!", description: `E-mail enviado para ${c.email}.` });
    } catch (e: any) {
      toast({ title: "Erro ao reenviar", description: e.message, variant: "destructive" });
    }
  };

  // ── Toggle active / inactive ──────────────────────────────────────────────
  const handleToggleStatus = async (c: Collaborator) => {
    setShowMenu(null);
    const newStatus = c.status === "active" ? "inactive" : "active";
    const { error } = await supabase
      .from("collaborators").update({ status: newStatus }).eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: newStatus === "active" ? "Colaborador reativado" : "Colaborador desativado" });
    load();
  };

  // ── Remove ────────────────────────────────────────────────────────────────
  const handleRemove = async (c: Collaborator) => {
    setShowMenu(null);
    if (!confirm(`Remover ${c.name} definitivamente?`)) return;
    const { error } = await supabase.from("collaborators").delete().eq("id", c.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Colaborador removido" });
    load();
  };

  // ── Permission toggle helper ──────────────────────────────────────────────
  const togglePerm = (catKey: string, permKey: string, value: boolean) => {
    setForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [catKey]: {
          ...(prev.permissions as any)[catKey],
          [permKey]: value,
        },
      } as CollabPerms,
    }));
  };

  // ── Build perm groups (add nutrição if hasDiet) ───────────────────────────
  const permGroups: (PermCat & { catKey: string })[] = [
    { ...PERM_GROUPS[0], catKey: "treino" },
    ...(hasDiet
      ? [{
          label: "Nutrição", emoji: "🥗", catKey: "nutricao",
          keys: [
            { key: "alimentos",       label: "Alimentos"       },
            { key: "banco_alimentos", label: "Banco de Alimentos" },
          ],
        }]
      : []
    ),
    { ...PERM_GROUPS[1], catKey: "gestao" },
    { ...PERM_GROUPS[2], catKey: "administracao" },
    {
      label: "Abas do Aluno", emoji: "👤", catKey: "abas_aluno",
      keys: [
        { key: "treinos",      label: "Treinos"      },
        ...(hasDiet ? [{ key: "dieta", label: "Dieta" }] : []),
        { key: "cardio",       label: "Cardio"       },
        ...(hasAvaliacaoPostural ? [{ key: "postural", label: "Avaliação Postural" }] : []),
        { key: "checkins",     label: "Check-ins"    },
        { key: "evolucao",     label: "Evolução"     },
        { key: "anamnese",     label: "Anamnese"     },
        { key: "atualizacao",  label: "Atualização"  },
        { key: "feedbacks",    label: "Feedbacks"    },
        { key: "plano",        label: "Plano"        },
      ],
    },
  ];

  // ── Status badge ──────────────────────────────────────────────────────────
  const StatusBadge = ({ status }: { status: Collaborator["status"] }) => {
    const cfg = {
      pending:  { label: "Pendente",  bg: "rgba(251,191,36,0.12)",  color: "rgb(251,191,36)"  },
      active:   { label: "Ativo",     bg: "rgba(74,222,128,0.12)",  color: "rgb(74,222,128)"  },
      inactive: { label: "Inativo",   bg: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" },
    }[status];
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
        style={{ backgroundColor: cfg.bg, color: cfg.color }}>
        {cfg.label}
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="px-6 lg:px-8 py-6 lg:py-8 max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Colaboradores</h1>
            <p className="text-white/40 text-sm mt-1">
              Convide pessoas para acessar o painel com permissões específicas
            </p>
          </div>
          <div className="relative">
            <Button
              onClick={openAdd}
              disabled={atLimit}
              className="flex items-center gap-2 h-9 px-4 rounded-xl text-white font-semibold text-sm"
              style={{ background: atLimit ? "rgba(255,255,255,0.1)" : "var(--cp-gradient)" }}
              title={atLimit ? "Colaboradores disponível apenas no plano com alunos ilimitados." : undefined}
            >
              <UserPlus className="w-4 h-4" />
              Adicionar Colaborador
            </Button>
            {atLimit && (
              <p className="absolute top-full mt-1.5 right-0 text-[11px] text-white/40 whitespace-nowrap">
                Indisponível —{" "}
                <button
                  onClick={() => navigate(`/${slug}/treinador/plano`)}
                  className="text-amber-400/80 hover:text-amber-400 underline underline-offset-2"
                >
                  upgrade para alunos ilimitados
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Plan badge */}
        {atLimit && (
          <div className="mb-6 flex items-center gap-2.5 px-4 py-3 rounded-xl"
            style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Lock className="w-4 h-4 text-white/30 shrink-0" />
            <p className="text-sm text-white/50">
              Colaboradores não disponível no seu plano.{" "}
              <button
                onClick={() => navigate(`/${slug}/treinador/plano`)}
                className="text-amber-400/80 hover:text-amber-400 underline underline-offset-2 ml-1"
              >
                Faça upgrade para alunos ilimitados para liberar.
              </button>
            </p>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-white/30" />
          </div>
        ) : collabs.length === 0 ? (
          <div className="rounded-2xl flex flex-col items-center justify-center py-20 gap-4"
            style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
              <Users className="w-7 h-7 text-white/20" />
            </div>
            <p className="text-white/40 text-sm text-center">
              Nenhum colaborador ainda.<br />Clique em "Adicionar Colaborador" para convidar alguém.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {collabs.map((c) => (
              <div key={c.id}
                className="rounded-2xl p-4 flex items-start gap-4"
                style={{ backgroundColor: "#141417", border: "1px solid rgba(255,255,255,0.09)", boxShadow: "0 10px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -1px 0 rgba(0,0,0,0.25)" }}>
                <Avatar className="h-10 w-10 shrink-0 mt-0.5">
                  <AvatarFallback
                    className="text-sm font-bold text-white"
                    style={{ background: "var(--cp-gradient)" }}>
                    {c.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white">{c.name}</p>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{c.email}</p>
                  <p className="text-xs text-white/30 mt-0.5">{c.role}</p>

                  {/* Permissões resumidas */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(c.permissions).flatMap(([cat, perms]) =>
                      Object.entries(perms as Record<string, boolean>)
                        .filter(([, v]) => v)
                        .map(([k]) => (
                          <span key={`${cat}.${k}`}
                            className="text-[10px] px-1.5 py-0.5 rounded-md"
                            style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)" }}>
                            {k.replace(/_/g, " ")}
                          </span>
                        ))
                    )}
                  </div>
                </div>

                {/* Actions menu */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setShowMenu(showMenu === c.id ? null : c.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/8"
                  >
                    <MoreVertical className="w-4 h-4 text-white/40" />
                  </button>
                  {showMenu === c.id && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowMenu(null)} />
                      <div
                        className="absolute right-0 top-9 z-50 w-48 rounded-xl py-1 shadow-xl"
                        style={{ backgroundColor: "#1c1c1e", border: "1px solid rgba(255,255,255,0.1)" }}>
                        <button
                          onClick={() => openEdit(c)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors">
                          <Edit className="w-3.5 h-3.5" /> Editar permissões
                        </button>
                        {c.status === "pending" && (
                          <button
                            onClick={() => handleResend(c)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors">
                            <RefreshCw className="w-3.5 h-3.5" /> Reenviar convite
                          </button>
                        )}
                        {c.status !== "pending" && (
                          <button
                            onClick={() => handleToggleStatus(c)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors">
                            {c.status === "active"
                              ? <><UserX className="w-3.5 h-3.5" /> Desativar</>
                              : <><CheckCircle2 className="w-3.5 h-3.5" /> Reativar</>}
                          </button>
                        )}
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", margin: "4px 0" }} />
                        <button
                          onClick={() => handleRemove(c)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/5 transition-colors"
                          style={{ color: "rgb(248,113,113)" }}>
                          <Trash2 className="w-3.5 h-3.5" /> Remover
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* ── Modal add/edit ─────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ backgroundColor: "#111113", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "90vh", overflowY: "auto" }}>

            {/* Modal header */}
            <div className="px-6 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <h2 className="text-base font-semibold text-white">
                {editingId ? "Editar Colaborador" : "Adicionar Colaborador"}
              </h2>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Nome */}
              <div>
                <Label className="text-xs text-white/50 uppercase tracking-wider">Nome</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Nome completo"
                  className="mt-1.5 bg-white/5 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              {/* E-mail — só na criação */}
              {!editingId && (
                <div>
                  <Label className="text-xs text-white/50 uppercase tracking-wider">E-mail</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="colaborador@exemplo.com"
                    className="mt-1.5 bg-white/5 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              )}

              {/* Cargo */}
              <div>
                <Label className="text-xs text-white/50 uppercase tracking-wider">Cargo</Label>
                <Input
                  value={form.role}
                  onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                  placeholder={hasDiet ? "ex: Nutricionista, Estagiário..." : "ex: Instrutor, Estagiário..."}
                  className="mt-1.5 bg-white/5 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              {/* Permissões */}
              <div>
                <Label className="text-xs text-white/50 uppercase tracking-wider mb-3 block">Permissões</Label>
                <div className="space-y-4">
                  {permGroups.map(group => (
                    <div key={group.catKey}>
                      <p className="text-xs font-semibold text-white/60 mb-2">
                        {group.emoji} {group.label}
                      </p>
                      <div className="space-y-2 pl-2">
                        {group.keys.map(({ key, label }) => {
                          const checked = !!((form.permissions as any)[group.catKey]?.[key]);
                          return (
                            <div key={key} className="flex items-center justify-between">
                              <span className="text-sm text-white/70">{label}</span>
                              <Toggle
                                checked={checked}
                                onChange={v => togglePerm(group.catKey, key, v)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 flex gap-3 justify-end"
              style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
              <Button
                variant="ghost"
                onClick={() => setModalOpen(false)}
                className="rounded-xl text-white/60 hover:text-white">
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl text-white font-semibold px-5"
                style={{ background: "var(--cp-gradient)" }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? "Salvar" : "Enviar convite"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Colaboradores;
