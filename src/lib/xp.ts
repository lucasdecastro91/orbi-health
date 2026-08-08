/**
 * XP helper — call from any page to grant XP for an action.
 * Uses upsert with (student_id, source, ref_date) unique key,
 * so calling multiple times on the same day is idempotent.
 */
import { supabase } from "@/integrations/supabase/client";

export type XpSource =
  | "workout_complete"
  | "diet_day"
  | "agua_day"
  | "cardio_complete"
  | "checkin_on_time"
  | "checkin_late"
  | "streak_3"
  | "streak_7"
  | "streak_14"
  | "streak_30"
  | "manual";

export const XP_VALUES: Record<XpSource, number> = {
  workout_complete: 30,
  diet_day:         30,
  agua_day:         15,
  cardio_complete:  20,
  checkin_on_time:  60,
  checkin_late:     30,
  streak_3:         60,
  streak_7:         120,
  streak_14:        250,
  streak_30:        400,
  manual:           0,   // manual = trainer sets own value
};

/** Brazil local date YYYY-MM-DD */
const brazilToday = (): string => {
  const brazil = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return brazil.toISOString().slice(0, 10);
};

export const grantXP = async (
  studentId: string,
  orgId: string,
  source: XpSource,
  note?: string,
): Promise<void> => {
  const xp      = XP_VALUES[source];
  const refDate = brazilToday();

  try {
    const { error } = await supabase
      .from("xp_events")
      .upsert(
        { student_id: studentId, org_id: orgId, source, xp, ref_date: refDate, note: note ?? null },
        { onConflict: "student_id,source,ref_date", ignoreDuplicates: true }
      );
    if (error) console.warn("[XP] grant failed:", error.message);
  } catch (err) {
    console.warn("[XP] grant exception:", err);
  }
};
