import { useNavigate } from "react-router-dom";
import { useTenantContext } from "@/contexts/TenantContext";
import StudentPageHeader from "@/components/student/StudentPageHeader";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Bell, BellOff, Loader2, ChevronLeft } from "lucide-react";

export default function NotificationSettings() {
  const { orgId, slug } = useTenantContext();
  const navigate = useNavigate();
  const push = usePushNotifications(orgId);

  return (
    <div>
      <StudentPageHeader title="Notificações" backTo={`/${slug}/aluno/perfil`} />

      <div
        className="relative max-w-lg mx-auto px-4 pt-6 space-y-6 rounded-t-[28px]"
        style={{ marginTop: -24, backgroundColor: "hsl(var(--background))" }}
      >
      <p className="text-sm text-muted-foreground">Receba avisos de treino, dieta e água mesmo com o app fechado</p>

      {/* Push permission */}
      {push.supported && push.permission !== "denied" && (
        <div className="rounded-2xl border border-white/8 p-4 space-y-3"
          style={{ background: "hsl(var(--foreground) / 0.03)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(var(--cp-rgb,22,163,74),0.12)" }}>
              <Bell className="w-4 h-4" style={{ color: "hsl(var(--primary))" }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">Notificações push</p>
              <p className="text-xs text-white/40">
                {push.subscribed
                  ? "Ativadas para este dispositivo"
                  : "Ative para receber os lembretes mesmo com o app fechado"}
              </p>
            </div>
            <button
              onClick={push.subscribed ? push.unsubscribe : push.subscribe}
              disabled={push.subscribing}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0"
              style={
                push.subscribed
                  ? { border: "1px solid hsl(var(--foreground) / 0.1)", color: "hsl(var(--foreground) / 0.5)" }
                  : { background: "var(--cp-gradient, linear-gradient(135deg,#22b45a,#16a34a))", color: "#fff" }
              }
            >
              {push.subscribing
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : push.subscribed
                ? "Desativar"
                : "Ativar"}
            </button>
          </div>
          {push.error && (
            <p className="text-[11px] text-center" style={{ color: "hsl(0 70% 65%)" }}>{push.error}</p>
          )}
        </div>
      )}

      {push.permission === "denied" && (
        <div className="rounded-2xl border border-white/8 p-4 flex items-center gap-3"
          style={{ background: "hsl(var(--foreground) / 0.03)" }}>
          <BellOff className="w-4 h-4 text-white/40 shrink-0" />
          <p className="text-xs text-white/40">
            As notificações estão bloqueadas nas permissões do navegador/dispositivo. Ative manualmente nas configurações pra receber os lembretes.
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
