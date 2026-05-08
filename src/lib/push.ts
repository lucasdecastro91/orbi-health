/**
 * push.ts — Client-side helper to invoke the send-push Edge Function.
 * Import and call sendPushNotification() wherever you need to trigger
 * a push to one or more users.
 */
import { supabase } from "@/integrations/supabase/client";

interface PushPayload {
  user_ids: string[];
  title:    string;
  body:     string;
  icon?:    string;
  url?:     string;
  tag?:     string;
}

export const sendPushNotification = async (payload: PushPayload): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke("send-push", { body: payload });
    if (error) console.warn("[Push] invoke error:", error.message);
  } catch (err) {
    console.warn("[Push] invoke exception:", err);
  }
};
