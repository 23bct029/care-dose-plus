import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
  browserLocalPersistence,
  setPersistence
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export interface UserProfile {
  uid: string;
  email: string | null;
  name: string;
  role: 'elderly' | 'caregiver' | 'doctor' | 'admin';
  phone?: string;
  avatar?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  bloodGroup?: string;
  age?: number;
  gender?: string;
  address?: string;
  medicalConditions?: string;
  allergies?: string;
  emergencyContact?: string;
  profileCompleted?: boolean;
  riskLevel?: 'low' | 'medium' | 'high';
}

// Set local persistence ONCE at module load — survives page refresh and tab close
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Get current user — waits for Firebase auth state to resolve
export const getCurrentUser = (): Promise<User | null> => {
  return new Promise((resolve) => {
    // If already loaded, return immediately
    if (auth.currentUser !== undefined) {
      const unsub = onAuthStateChanged(auth, (user) => {
        unsub();
        resolve(user);
      });
    } else {
      const unsub = onAuthStateChanged(auth, (user) => {
        unsub();
        resolve(user);
      });
    }
  });
};

export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (docSnap.exists()) return docSnap.data() as UserProfile;
    // Create minimal profile from auth user
    const authUser = auth.currentUser;
    if (authUser && authUser.uid === uid) {
      let role: UserProfile['role'] = 'elderly';
      if (authUser.email?.includes('admin')) role = 'admin';
      else if (authUser.email?.includes('caregiver')) role = 'caregiver';
      else if (authUser.email?.includes('doctor')) role = 'doctor';
      const profile: UserProfile = {
        uid: authUser.uid, email: authUser.email,
        name: authUser.displayName || authUser.email?.split('@')[0] || 'User',
        role, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', uid), profile);
      return profile;
    }
    return null;
  } catch (e) { console.error('getUserProfile error:', e); return null; }
};

export const logIn = async (email: string, password: string) => {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { user: cred.user, error: null };
  } catch (error: any) {
    const msgs: Record<string, string> = {
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/invalid-email': 'Invalid email address',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/invalid-credential': 'Invalid email or password',
      'auth/network-request-failed': 'Network error. Check your connection.',
    };
    return { user: null, error: msgs[error.code] || 'Login failed. Please try again.' };
  }
};

export const signInWithGoogle = async (defaultRole: 'elderly' | 'caregiver' | 'doctor' = 'elderly') => {
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    const cred = await signInWithPopup(auth, provider);
    const user = cred.user;
    // Check if profile exists
    const existing = await getDoc(doc(db, 'users', user.uid));
    if (!existing.exists()) {
      // New Google user — create profile with default role
      const profile: UserProfile = {
        uid: user.uid, email: user.email,
        name: user.displayName || user.email?.split('@')[0] || 'User',
        role: defaultRole, avatar: user.photoURL || undefined,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', user.uid), profile);
      return { user, profile, isNewUser: true, error: null };
    }
    const profile = existing.data() as UserProfile;
    return { user, profile, isNewUser: false, error: null };
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') return { user: null, profile: null, isNewUser: false, error: null };
    return { user: null, profile: null, isNewUser: false, error: 'Google sign-in failed. Please try again.' };
  }
};

export const signUp = async (email: string, password: string, userData: Partial<UserProfile>) => {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const profile: UserProfile = {
      uid: cred.user.uid, email, name: userData.name || email.split('@')[0],
      role: userData.role || 'elderly', isActive: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'users', cred.user.uid), profile);
    return { user: cred.user, error: null };
  } catch (error: any) {
    const msgs: Record<string, string> = {
      'auth/email-already-in-use': 'An account with this email already exists',
      'auth/weak-password': 'Password must be at least 6 characters',
      'auth/invalid-email': 'Invalid email address',
    };
    return { user: null, error: msgs[error.code] || 'Registration failed. Please try again.' };
  }
};

export const logOut = async () => {
  await signOut(auth);
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
  try {
    const { getDocs, collection } = await import('firebase/firestore');
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => d.data() as UserProfile);
  } catch { return []; }
};
