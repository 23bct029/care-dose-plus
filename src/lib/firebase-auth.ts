import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  UserCredential
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
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
  // Medical profile fields
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

// Get current user as Promise
export const getCurrentUser = (): Promise<User | null> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

// Listen to auth state changes
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// Get user profile from Firestore
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    } else {
      // If profile doesn't exist, create one from auth user
      const authUser = auth.currentUser;
      if (authUser && authUser.uid === uid) {
        console.log('Creating missing profile for:', authUser.email);
        
        let role: UserProfile['role'] = 'elderly';
        if (authUser.email?.includes('admin')) role = 'admin';
        else if (authUser.email?.includes('caregiver')) role = 'caregiver';
        else if (authUser.email?.includes('doctor')) role = 'doctor';
        
        const newProfile: UserProfile = {
          uid: authUser.uid,
          email: authUser.email,
          name: authUser.email?.split('@')[0] || 'User',
          role: role,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        await setDoc(docRef, newProfile);
        console.log('✅ Created missing profile for:', authUser.email);
        return newProfile;
      }
      return null;
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

// Login
export const logIn = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    let errorMessage = 'Invalid email or password';
    
    // Handle specific Firebase errors
    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage = 'No account found with this email';
        break;
      case 'auth/wrong-password':
        errorMessage = 'Incorrect password';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Too many failed attempts. Please try again later';
        break;
      case 'auth/user-disabled':
        errorMessage = 'This account has been disabled';
        break;
    }
    
    return { user: null, error: errorMessage };
  }
};

// Sign up
export const signUp = async (email: string, password: string, userData: Partial<UserProfile>) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    const profile: UserProfile = {
      uid: user.uid,
      email: user.email,
      name: userData.name || email.split('@')[0],
      role: (userData.role as UserProfile['role']) || 'elderly',
      phone: userData.phone || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'users', user.uid), profile);
    
    return { user: profile, error: null };
  } catch (error: any) {
    let errorMessage = 'Failed to create account';
    
    switch (error.code) {
      case 'auth/email-already-in-use':
        errorMessage = 'Email already in use';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Invalid email address';
        break;
      case 'auth/weak-password':
        errorMessage = 'Password is too weak';
        break;
    }
    
    return { user: null, error: errorMessage };
  }
};

// Log out
export const logOut = async () => {
  try {
    await signOut(auth);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
};

// Get all users (admin only)
export const getAllUsers = async (): Promise<UserProfile[]> => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    const users: UserProfile[] = [];
    querySnapshot.forEach((doc) => {
      users.push(doc.data() as UserProfile);
    });
    
    return users;
  } catch (error) {
    console.error('Error getting all users:', error);
    return [];
  }
};

// Get users by role
export const getUsersByRole = async (role: UserProfile['role']): Promise<UserProfile[]> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('role', '==', role));
    const querySnapshot = await getDocs(q);
    
    const users: UserProfile[] = [];
    querySnapshot.forEach((doc) => {
      users.push(doc.data() as UserProfile);
    });
    
    return users;
  } catch (error) {
    console.error(`Error getting users by role ${role}:`, error);
    return [];
  }
};