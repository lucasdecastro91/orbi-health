/**
 * usePushNotifications — registers SW, subscribes to Web Push,
 * saves subscription to Supabase push_subscriptions table.
 *
 * Requirements (set in Supabase Project Settings → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY   — base64url VAPID public key
 *
 * Generate a VAPID key pair once with:
 *   npx web-push generate-vapid-keys
 */

import { useState, useEffect, useCallback } from "react";
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export const usePushNotifications = (orgId: string | null): PushState => {
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  const [permission,  setPermission]  = useState<PushPermission>(
    supported ? (Notification.permission as PushPermission) : "unsupported"
  );
  const [subscribed,  setSubscribed]  = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    checkSubscription();
  }, [supported]);

  const checkSubscription = async () => {
    try {
      const reg  = await navigator.serviceWorker.ready;
      const sub  = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch { /* SW not ready yet */ }
  };

  const subscribe = useCallback(async () => {
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

      const { error: dbError } = await supabase.from("push_subscriptions").upsert(
        {
          user_id:    session.user.id,
          org_id:     orgId,
          endpoint:   sub.endpoint,
          p256dh:     json.keys?.p256dh ?? "",
          auth_key:   json.keys?.auth   ?? "",
          user_agent: navigator.userAgent.slice(0, 200),
        },
        { onConflict: "user_id,endpoint" }
      );

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

  const unsubscribe = useCallback(async () => {
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

  return { permission, subscribed, subscribing, supported, error, subscribe, unsubscribe };
};
