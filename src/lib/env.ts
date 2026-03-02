export const validateEnv = () => {
  const required = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY'
  ];

  const missing = required.filter(key => !import.meta.env[key]);

  if (missing.length > 0) {
    console.error('Missing environment variables:', missing);
    return false;
  }

  return true;
};

export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  twilioSid: import.meta.env.VITE_TWILIO_ACCOUNT_SID,
  twilioToken: import.meta.env.VITE_TWILIO_AUTH_TOKEN,
  twilioPhone: import.meta.env.VITE_TWILIO_PHONE_NUMBER,
};