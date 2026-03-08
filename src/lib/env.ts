// src/lib/env.ts
interface EnvConfig {
  supabaseUrl: string;
  supabaseKey: string;
  twilioSid: string;
  twilioToken: string;
  twilioPhone: string;
}

// Check if we're in production/build time
const isProd = process.env.NODE_ENV === 'production';

// Helper to safely access import.meta.env
const getEnvVar = (key: string): string => {
  try {
    // @ts-ignore - Bypass TypeScript check for build
    return import.meta.env?.[key] || process.env[key] || '';
  } catch (e) {
    console.warn(`Failed to access env var ${key}:`, e);
    return '';
  }
};

// Validate required environment variables
const requiredEnvVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_TWILIO_ACCOUNT_SID',
  'VITE_TWILIO_AUTH_TOKEN',
  'VITE_TWILIO_PHONE_NUMBER'
] as const;

// Check for missing env vars (only in development)
if (!isProd) {
  const missing = requiredEnvVars.filter(key => !getEnvVar(key));
  if (missing.length > 0) {
    console.warn(
      '⚠️ Missing environment variables:\n',
      missing.join('\n'),
      '\nCheck your .env file'
    );
  }
}

// Export config with fallbacks
export const env: EnvConfig = {
  supabaseUrl: getEnvVar('VITE_SUPABASE_URL'),
  supabaseKey: getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY'),
  twilioSid: getEnvVar('VITE_TWILIO_ACCOUNT_SID'),
  twilioToken: getEnvVar('VITE_TWILIO_AUTH_TOKEN'),
  twilioPhone: getEnvVar('VITE_TWILIO_PHONE_NUMBER')
};

// Log loaded config (without sensitive values) in development
if (!isProd) {
  console.log('📋 Environment config loaded:', {
    supabaseUrl: env.supabaseUrl ? '✅' : '❌',
    supabaseKey: env.supabaseKey ? '✅' : '❌',
    twilioSid: env.twilioSid ? '✅' : '❌',
    twilioToken: env.twilioToken ? '✅' : '❌',
    twilioPhone: env.twilioPhone ? '✅' : '❌'
  });
}

export default env;