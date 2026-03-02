// Run this in browser console after starting your app
async function testDeployment() {
  console.log('🔍 Testing deployment...');
  
  // Test 1: Supabase connection
  const { data, error } = await supabase.from('patients').select('count');
  console.log('✅ Supabase connected:', !error);
  
  // Test 2: Environment variables loaded
  console.log('✅ Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
  console.log('✅ Twilio Phone:', import.meta.env.VITE_TWILIO_PHONE_NUMBER);
  
  // Test 3: Function URL (just check format)
  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`;
  console.log('✅ Function URL format:', functionUrl);
}

testDeployment();