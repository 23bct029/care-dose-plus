import { firebaseConfig } from '../src/lib/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ... rest of the code

const users = [
  { email: 'admin@caredose.com', name: 'Admin User', role: 'admin' },
  { email: 'elderly@caredose.com', name: 'John Elder', role: 'elderly' },
  { email: 'caregiver@caredose.com', name: 'Sarah Care', role: 'caregiver' },
  { email: 'doctor@caredose.com', name: 'Dr. Smith', role: 'doctor' },
];

const fixProfiles = async () => {
  console.log('🔍 Checking and fixing user profiles...\n');
  
  for (const user of users) {
    try {
      console.log(`Checking profile for ${user.email}...`);
      
      // Find user by email in auth (this is tricky, so we'll check Firestore users collection)
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', user.email));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log(`⚠️  No user found for ${user.email}. They need to sign up first.`);
        continue;
      }
      
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      
      // Check if profile has all required fields
      const needsUpdate = false;
      const updates: any = {};
      
      if (!userData.name) updates.name = user.name;
      if (!userData.role) updates.role = user.role;
      
      if (Object.keys(updates).length > 0) {
        await setDoc(doc(db, 'users', userDoc.id), {
          ...userData,
          ...updates,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        console.log(`✅ Updated profile for ${user.email}`);
      } else {
        console.log(`✅ Profile already correct for ${user.email}`);
      }
      
    } catch (error: any) {
      console.error(`❌ Error with ${user.email}:`, error.message);
    }
  }
  
  console.log('\n✨ Profile check complete!');
  console.log('📝 If any users were missing, they need to sign up first.');
};

// Run the function
fixProfiles();