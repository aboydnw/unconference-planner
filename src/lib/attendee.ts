import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import type { Attendee, PublicEvent } from "@/lib/types";

export function attendeeCookieName(eventId: string): string {
  return `uc_att_${eventId}`;
}

export async function getEventByCode(
  code: string,
): Promise<PublicEvent | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_event_by_code", { p_code: code });
  if (!data || data.length === 0) return null;
  return data[0] as PublicEvent;
}

export async function getCurrentAttendee(
  eventId: string,
): Promise<{ attendee: Attendee; token: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(attendeeCookieName(eventId))?.value;
  if (!token) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc("attendee_by_token", { p_token: token });
  if (!data || data.length === 0) return null;
  const attendee = data[0] as Attendee;
  if (attendee.event_id !== eventId) return null;
  return { attendee, token };
}
