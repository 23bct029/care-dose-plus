import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const now = new Date().toISOString();
  const { data: scheduledMessages } = await supabase
    .from("scheduled_messages")
    .select("*")
    .lte("scheduled_time", now)
    .eq("status", "scheduled");

  for (const message of scheduledMessages || []) {
    try {
      const response = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sms`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            patient_phone: message.patient_phone,
            message: message.message,
            patient_id: message.patient_id,
            created_by: message.created_by,
          }),
        }
      );

      const result = await response.json();

      await supabase
        .from("scheduled_messages")
        .update({
          status: result.success ? "sent" : "failed",
          twilio_message_id: result.sid,
        })
        .eq("id", message.id);
    } catch (error) {
      await supabase
        .from("scheduled_messages")
        .update({ status: "failed" })
        .eq("id", message.id);
    }
  }

  return new Response(
    JSON.stringify({ processed: scheduledMessages?.length || 0 }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
});