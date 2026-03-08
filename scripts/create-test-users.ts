import { firebaseConfig } from '../src/lib/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ... rest of the codenst db = getFirestore(app);

const testUsers = [
  { email: 'admin@caredose.com', password: 'Admin@123', name: 'Admin User', role: 'admin' },
  { email: 'elderly@caredose.com', password: 'Elderly@123', name: 'John Elder', role: 'elderly' },
  { email: 'caregiver@caredose.com', password: 'Caregiver@123', name: 'Sarah Care', role: 'caregiver' },
  { email: 'doctor@caredose.com', password: 'Doctor@123', name: 'Dr. Smith', role: 'doctor' },
];

const createTestUsers = async () => {
  console.log('🚀 Creating test users...\n');
  
  for (const user of testUsers) {
    try {
      console.log(`Creating ${user.email}...`);
      
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password);
      
      // Create user profile in Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      console.log(`✅ Created: ${user.email} (${user.role})`);
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        console.log(`⚠️  ${user.email} already exists`);
      } else {
        console.log(`❌ Error creating ${user.email}:`, error.message);
      }
    }
  }
  
  console.log('\n✨ Test user creation complete!');
  console.log('\n📝 You can now login with:');
  console.log('   admin@caredose.com / Admin@123');
  console.log('   elderly@caredose.com / Elderly@123');
  console.log('   caregiver@caredose.com / Caregiver@123');
  console.log('   doctor@caredose.com / Doctor@123');
};

// Run the function
createTestUsers();