/**
 * useNativePushListeners — trata pushes nativos (APNs) chegando com o app
 * aberto e o toque em uma notificação, dentro do app nativo (Capacitor).
 *
 * Precisa ficar montado sempre (não só na tela de Notificações), diferente
 * de usePushNotifications — por isso vive em App.tsx, dentro do
 * BrowserRouter (precisa de useNavigate() pra navegar no toque).
 *
 * Mesmo padrão do notificationclick em public/sw.js (versão web): lê
 * notification.data.url e navega.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";

export function useNativePushListeners() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const receivedHandle = PushNotifications.addListener("pushNotificationReceived", (notification) => {
      // App em primeiro plano: o sistema já mostra o banner/som conforme
      // presentationOptions (capacitor.config.ts) — nada a fazer aqui hoje.
      console.log("[Push][native] recebido em foreground:", notification);
    });

    const actionHandle = PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = action.notification.data?.url;
      if (url && typeof url === "string") navigate(url);
    });

    return () => {
      receivedHandle.then((h) => h.remove());
      actionHandle.then((h) => h.remove());
    };
  }, [navigate]);
}
