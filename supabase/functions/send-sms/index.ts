import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const twilioAuth = `${Deno.env.get("TWILIO_ACCOUNT_SID")}:${Deno.env.get("TWILIO_AUTH_TOKEN")}`;

serve(async (req) => {
  try {
    const { patient_phone, message, patient_id, created_by } = await req.json();

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${Deno.env.get("TWILIO_ACCOUNT_SID")}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(twilioAuth)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: patient_phone,
          From: Deno.env.get("TWILIO_PHONE_NUMBER")!,
          Body: message,
        }),
      }
    );

    const twilioData = await twilioResponse.json();

    // Log in conversations
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await supabase.from("communications").insert({
      patient_id,
      type: "sms",
      message,
      direction: "outbound",
      status: "sent",
      message_id: twilioData.sid,
      from_number: Deno.env.get("TWILIO_PHONE_NUMBER"),
      to_number: patient_phone,
      created_by,
    });

    return new Response(JSON.stringify({ success: true, sid: twilioData.sid }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});