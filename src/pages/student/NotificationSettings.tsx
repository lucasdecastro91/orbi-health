import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTenantContext } from "@/contexts/TenantContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  Bell, BellOff, Utensils, Droplets, Dumbbell, Star,
  MessageSquare, Moon, Clock, Loader2, Check, ChevronLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Prefs {
  meals_enabled: boolean;
  hydration_enabled: boolean;
  workout_enabled: boolean;
  motivational_enabled: boolean;
  trainer_actions_enabled: boolean;
  workout_time: string;
  motivational_time: string;
  dnd_enabled: boolean;
  dnd_start: string;
  dnd_end: string;
}

const DEFAULT_PREFS: Prefs = {
  meals_enabled: true,
  hydration_enabled: true,
  workout_enabled: true,
  motivational_enabled: true,
  trainer_actions_enabled: true,
  workout_time: "07:00",
  motivational_time: "08:00",
  dnd_enabled: false,
  dnd_start: "22:00",
  dnd_end: "07:00",
};

export default function NotificationSettings() {
  const { orgId, slug } = useTenantContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { state: pushState, subscribe, unsubscribe } = usePushNotifications();

  const [prefs, setPrefs]     = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) setPrefs(data as unknown as Prefs);
    } catch { /* silencia */ } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("notification_preferences")
        .upsert({
          user_id: user.id,
          org_id: orgId,
          ...prefs,
        }, { onConflict: "user_id,org_id" });

      if (error) throw error;
      toast({ title: "Preferências salvas!" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Erro ao salvar", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (field: keyof Prefs) =>
    setPrefs((p) => ({ ...p, [field]: !p[field] }));

  const setTime = (field: keyof Prefs, val: string) =>
    setPrefs((p) => ({ ...p, [field]: val }));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-white/30" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => navigate(-1)} className="text-white/40 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Notificações</h1>
          <p className="text-white/40 text-sm">Personalize quando e como ser notificado</p>
        </div>
      </div>

      {/* Push permission */}
      <div className="rounded-2xl border border-white/8 p-4 space-y-3"
        style={{ background: "rgba(255,255,255,0.03)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(var(--cp-rgb,22,163,74),0.12)" }}>
            <Bell className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Notificações Push</p>
            <p className="text-xs text-white/40">
              {pushState.permission === "granted"
                ? "Notificações ativadas para este dispositivo"
                : "Ative para receber notificações mesmo com o app fechado"}
            </p>
          </div>
          {pushState.permission === "granted" ? (
            <button
              onClick={unsubscribe}
              className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors">
              Desativar
            </button>
          ) : (
            <button
              onClick={subscribe}
              disabled={pushState.isLoading}
              className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold"
              style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}>
              {pushState.isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Ativar"}
            </button>
          )}
        </div>
      </div>

      {/* Tipos de notificação */}
      <div className="space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-wider px-1">Tipos de notificação</p>

        {[
          { field: "meals_enabled" as keyof Prefs, icon: Utensils, label: "Refeições", desc: "Lembrete 5 min antes de cada refeição" },
          { field: "hydration_enabled" as keyof Prefs, icon: Droplets, label: "Hidratação", desc: "Lembrete a cada 2h entre 7h e 21h" },
          { field: "workout_enabled" as keyof Prefs, icon: Dumbbell, label: "Treino", desc: "Aviso no horário configurado abaixo" },
          { field: "motivational_enabled" as keyof Prefs, icon: Star, label: "Motivacional", desc: "Frase motivacional diária" },
          { field: "trainer_actions_enabled" as keyof Prefs, icon: MessageSquare, label: "Mensagens do treinador", desc: "Treino atualizado, dieta, consultas" },
        ].map(({ field, icon: Icon, label, desc }) => (
          <div key={field} className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Icon className="w-4 h-4 text-white/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-white/35">{desc}</p>
            </div>
            <button
              onClick={() => toggle(field)}
              className={`relative w-11 h-6 rounded-full transition-all shrink-0 ${
                prefs[field] ? "bg-green-500/20 border border-green-500/40" : "bg-white/5 border border-white/10"
              }`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                prefs[field]
                  ? "left-[calc(100%-22px)] bg-green-400"
                  : "left-0.5 bg-white/20"
              }`} style={prefs[field] ? { backgroundColor: "hsl(var(--primary))" } : {}} />
            </button>
          </div>
        ))}
      </div>

      {/* Horários configuráveis */}
      <div className="space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-wider px-1">Horários</p>

        <div className="px-4 py-3 rounded-xl space-y-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-white/40" />
              <span className="text-sm text-white">Horário do treino</span>
            </div>
            <input
              type="time"
              value={prefs.workout_time}
              onChange={(e) => setTime("workout_time", e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-white/30"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-white/40" />
              <span className="text-sm text-white">Motivacional diário</span>
            </div>
            <input
              type="time"
              value={prefs.motivational_time}
              onChange={(e) => setTime("motivational_time", e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-white/30"
            />
          </div>
        </div>
      </div>

      {/* Não perturbar */}
      <div className="space-y-2">
        <p className="text-xs text-white/40 uppercase tracking-wider px-1">Não perturbar</p>
        <div className="px-4 py-3 rounded-xl space-y-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-white/40" />
              <span className="text-sm text-white">Modo não perturbar</span>
            </div>
            <button
              onClick={() => toggle("dnd_enabled")}
              className={`relative w-11 h-6 rounded-full transition-all ${
                prefs.dnd_enabled ? "border border-blue-500/40" : "bg-white/5 border border-white/10"
              }`}
              style={prefs.dnd_enabled ? { background: "rgba(59,130,246,0.2)" } : {}}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                prefs.dnd_enabled ? "left-[calc(100%-22px)] bg-blue-400" : "left-0.5 bg-white/20"
              }`} />
            </button>
          </div>

          {prefs.dnd_enabled && (
            <div className="flex items-center gap-3 pt-1">
              <Clock className="w-4 h-4 text-white/30 shrink-0" />
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="time"
                  value={prefs.dnd_start}
                  onChange={(e) => setTime("dnd_start", e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none"
                />
                <span className="text-white/30 text-sm">até</span>
                <input
                  type="time"
                  value={prefs.dnd_end}
                  onChange={(e) => setTime("dnd_end", e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Botão salvar */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-12 rounded-xl text-white font-semibold"
        style={{ background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))" }}>
        {saving
          ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Salvando...</>
          : <><Check className="w-4 h-4 mr-2" />Salvar preferências</>}
      </Button>
    </div>
  );
}
