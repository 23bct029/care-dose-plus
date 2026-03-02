import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "POST") {
    const formData = await req.formData();
    const fromNumber = formData.get("From");
    const body = formData.get("Body");
    const messageSid = formData.get("MessageSid");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find patient by phone
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("phone", fromNumber)
      .single();

    if (patient) {
      // Log incoming message
      await supabase.from("communications").insert({
        patient_id: patient.id,
        type: "sms",
        body: body,
        direction: "inbound",
        status: "received",
        message_id: messageSid,
        from_number: fromNumber,
        to_number: Deno.env.get("TWILIO_PHONE_NUMBER"),
      });
    }

    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>Thank you for your message. Our team will respond shortly.</Message>
      </Response>`,
      {
        headers: { "Content-Type": "text/xml" },
      }
    );
  }

  return new Response("Method not allowed", { status: 405 });
});