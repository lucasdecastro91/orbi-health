/**
 * usePushNotifications — registra o dispositivo pra push e salva a
 * inscrição em push_subscriptions. Cobre dois canais, escolhidos
 * automaticamente por Capacitor.isNativePlatform():
 *
 *   - Web Push (VAPID): navegador/PWA, via Service Worker + PushManager.
 *   - APNs nativo: dentro do app (TestFlight/App Store), via
 *     @capacitor/push-notifications — necessário porque o WKWebView do app
 *     nativo não expõe a Web Push API (só funciona como PWA instalado na
 *     tela de início, o que o app embutido não é).
 *
 * Mesmo formato de retorno nos dois casos — quem consome o hook
 * (NotificationSettings.tsx) não precisa saber qual canal está em uso.
 *
 * Requirements (set in Supabase Project Settings → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY   — base64url VAPID public key (Web Push)
 *   APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY — push nativo, ver send-push
 *
 * Generate a VAPID key pair once with:
 *   npx web-push generate-vapid-keys
 */

import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications, type PermissionStatus } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

interface PushState {
  permission:   PushPermission;
  subscribed:   boolean;
  subscribing:  boolean;
  supported:    boolean;
  error:        string | null;
  subscribe:    () => Promise<void>;
  unsubscribe:  () => Promise<void>;
}

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const IS_NATIVE = Capacitor.isNativePlatform();

// Marca local de "já registrei push nativo pelo menos uma vez" — mostra o
// toggle no estado certo antes da re-checagem assíncrona do mount terminar.
// APNs não tem um pushManager.getSubscription() equivalente pra consultar
// localmente se já está inscrito.
const NATIVE_SUBSCRIBED_KEY = "gs_native_push_subscribed";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function mapNativePermission(receive: PermissionStatus["receive"]): PushPermission {
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "default"; // "prompt" / "prompt-with-rationale"
}

async function upsertSubscription(row: {
  user_id: string; org_id: string; endpoint: string; platform: "web" | "ios";
  p256dh?: string; auth_key?: string;
}) {
  return supabase.from("push_subscriptions").upsert(
    { ...row, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: "user_id,endpoint" }
  );
}

// Registra no APNs e resolve com o device token. Os listeners precisam
// existir ANTES de chamar register() — senão a resposta pode chegar antes
// de ter alguém escutando.
function registerNativeDevice(): Promise<string> {
  return new Promise((resolve, reject) => {
    (async () => {
      const regHandle = await PushNotifications.addListener("registration", (token) => {
        regHandle.remove();
        errHandle.remove();
        resolve(token.value);
      });
      const errHandle = await PushNotifications.addListener("registrationError", (err) => {
        regHandle.remove();
        errHandle.remove();
        reject(new Error(err?.error ?? "Falha ao registrar push nativo"));
      });
      await PushNotifications.register();
    })().catch(reject);
  });
}

export const usePushNotifications = (orgId: string | null): PushState => {
  const supported = IS_NATIVE
    ? true
    : typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  const [permission,  setPermission]  = useState<PushPermission>(() => {
    if (!supported) return "unsupported";
    if (IS_NATIVE) return "default";
    return Notification.permission as PushPermission;
  });
  const [subscribed,  setSubscribed]  = useState(
    IS_NATIVE ? localStorage.getItem(NATIVE_SUBSCRIBED_KEY) === "true" : false
  );
  const [subscribing, setSubscribing] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    if (IS_NATIVE) checkNativeSubscription();
    else checkSubscription();
  }, [supported]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkSubscription = async () => {
    try {
      const reg  = await navigator.serviceWorker.ready;
      const sub  = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch { /* SW not ready yet */ }
  };

  const checkNativeSubscription = async () => {
    try {
      const perm = await PushNotifications.checkPermissions();
      setPermission(mapNativePermission(perm.receive));
      if (perm.receive !== "granted" || !orgId) return;

      // Já concedeu permissão antes — reregistra silenciosamente (o token
      // pode rotacionar, prática recomendada da Apple), sem exigir toque.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = await registerNativeDevice();
      const { error: dbError } = await upsertSubscription({
        user_id: session.user.id, org_id: orgId, endpoint: token, platform: "ios",
      });
      if (!dbError) {
        setSubscribed(true);
        localStorage.setItem(NATIVE_SUBSCRIBED_KEY, "true");
      }
    } catch { /* plugin ainda não pronto */ }
  };

  // ─── Nativo (APNs) ──────────────────────────────────────────────────────
  const subscribeNative = useCallback(async () => {
    setError(null);
    if (!orgId) { setError("Organização ainda não carregou — tente de novo em instantes."); return; }
    setSubscribing(true);

    try {
      let { receive } = await PushNotifications.checkPermissions();
      if (receive === "prompt" || receive === "prompt-with-rationale") {
        ({ receive } = await PushNotifications.requestPermissions());
      }
      setPermission(mapNativePermission(receive));
      if (receive !== "granted") {
        setError(receive === "denied" ? "Permissão de notificação negada." : "Permissão de notificação não concedida.");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Sessão expirada — faça login de novo."); return; }

      const token = await registerNativeDevice();
      const { error: dbError } = await upsertSubscription({
        user_id: session.user.id, org_id: orgId, endpoint: token, platform: "ios",
      });
      if (dbError) { setError(dbError.message); return; }

      setSubscribed(true);
      localStorage.setItem(NATIVE_SUBSCRIBED_KEY, "true");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Push][native] subscribe error:", err);
      setError(msg);
    } finally {
      setSubscribing(false);
    }
  }, [orgId]);

  const unsubscribeNative = useCallback(async () => {
    try {
      // Não existe "desinscrever" de verdade no APNs — o token continua
      // válido do lado da Apple. Aqui só paramos de mandar push pra esse
      // usuário, apagando o registro que o send-push usa como alvo.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", session.user.id)
          .eq("platform", "ios");
      }
      setSubscribed(false);
      localStorage.removeItem(NATIVE_SUBSCRIBED_KEY);
    } catch (err) {
      console.warn("[Push][native] unsubscribe error:", err);
    }
  }, []);

  // ─── Web Push (VAPID) — comportamento original, sem mudança ────────────
  const subscribeWeb = useCallback(async () => {
    setError(null);
    if (!supported) { setError("Notificações push não são suportadas neste navegador."); return; }
    if (!VAPID_PUBLIC_KEY) { setError("Configuração de push ausente (VAPID_PUBLIC_KEY)."); return; }
    if (!orgId) { setError("Organização ainda não carregou — tente de novo em instantes."); return; }
    setSubscribing(true);

    try {
      // Registration lookup: no-arg form matches by the current page's URL/scope —
      // passing a script path here (ex: "/sw.js") is not what getRegistration() expects.
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
      }

      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") {
        setError(perm === "denied" ? "Permissão de notificação negada." : "Permissão de notificação não concedida.");
        return;
      }

      // Reaproveita uma subscription já existente em vez de assinar de novo — chamar
      // subscribe() enquanto já existe uma (ex: de uma tentativa anterior que falhou só
      // no upsert do banco) pode disparar "Registration failed - could not retrieve the
      // public key" no Chrome quando a chave não bate exatamente com a já registrada.
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const json = sub.toJSON() as any;

      // Get user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Sessão expirada — faça login de novo."); return; }

      const { error: dbError } = await upsertSubscription({
        user_id: session.user.id, org_id: orgId, endpoint: sub.endpoint, platform: "web",
        p256dh: json.keys?.p256dh ?? "", auth_key: json.keys?.auth ?? "",
      });

      if (dbError) { setError(dbError.message); return; }
      setSubscribed(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Push] subscribe error:", err);
      setError(msg);
    } finally {
      setSubscribing(false);
    }
  }, [supported, orgId]);

  const unsubscribeWeb = useCallback(async () => {
    if (!supported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", session.user.id)
          .eq("endpoint", sub.endpoint);
      }

      await sub.unsubscribe();
      setSubscribed(false);
    } catch (err) {
      console.warn("[Push] unsubscribe error:", err);
    }
  }, [supported]);

  return {
    permission,
    subscribed,
    subscribing,
    supported,
    error,
    subscribe:   IS_NATIVE ? subscribeNative   : subscribeWeb,
    unsubscribe: IS_NATIVE ? unsubscribeNative : unsubscribeWeb,
  };
};
