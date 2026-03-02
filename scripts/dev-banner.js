// scripts/dev-banner.js
import os from 'os';

console.log('\n');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║                    🚀 CAREDOSE+ READY                       ║');
console.log('╠════════════════════════════════════════════════════════════╣');
console.log('║                                                            ║');
console.log('║  📋 TEST ACCOUNTS:                                         ║');
console.log('║                                                            ║');
console.log('║  👑 ADMIN    │ admin@caredose.com    │ Admin@123           ║');
console.log('║  👴 ELDERLY  │ elderly@caredose.com  │ Elderly@123         ║');
console.log('║  👵 ELDERLY2 │ elderly2@caredose.com │ Elderly@123         ║');
console.log('║  👨‍⚕️ CAREGIVER│ caregiver@caredose.com│ Caregiver@123       ║');
console.log('║  👩‍⚕️ CAREGIVER2│ caregiver2@caredose.com│ Caregiver@123     ║');
console.log('║  🩺 DOCTOR   │ doctor@caredose.com   │ Doctor@123          ║');
console.log('║                                                            ║');
console.log('║  🌐 Local: http://localhost:8080                           ║');
console.log('║  📱 Network: http://' + getLocalIP() + ':8080                    ║');
console.log('║                                                            ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('\n');

function getLocalIP() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (e) {}
  return '192.168.1.x';
}