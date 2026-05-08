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
    if (!supported || !VAPID_PUBLIC_KEY || !orgId) return;
    setSubscribing(true);

    try {
      // Register SW if needed
      let reg = await navigator.serviceWorker.getRegistration("/sw.js");
      if (!reg) {
        reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
      }

      // Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") return;

      // Subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = sub.toJSON() as any;

      // Get user session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase.from("push_subscriptions").upsert(
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

      if (!error) setSubscribed(true);
    } catch (err) {
      console.warn("[Push] subscribe error:", err);
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

  return { permission, subscribed, subscribing, supported, subscribe, unsubscribe };
};
