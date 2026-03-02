import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';

// Define a type for your user profile stored in Firestore
export interface UserProfile {
  uid: string;
  email: string | null;
  name: string;
  role: 'admin' | 'elderly' | 'caregiver' | 'doctor';
  createdAt: string;
  updatedAt?: string;
  phone?: string;
  avatar?: string;
}

// Function to handle errors consistently
const handleError = (error: any, context: string) => {
  console.error(`Firebase Auth Error (${context}):`, error.code, error.message);
  throw new Error(error.message || `Authentication failed: ${context}`);
};

/**
 * Get the currently logged in user
 */
export const getCurrentUser = (): FirebaseUser | null => {
  return auth.currentUser;
};

/**
 * Get current user asynchronously (ensures token is fresh)
 */
export const getCurrentUserAsync = async (): Promise<FirebaseUser | null> => {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

/**
 * Signs up a new user with email and password and creates a user profile in Firestore.
 */
export const signUp = async (
  email: string, 
  password: string, 
  name: string, 
  role: UserProfile['role']
): Promise<UserProfile> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    if (!user) {
      throw new Error('User creation failed.');
    }

    const userProfile: UserProfile = {
      uid: user.uid,
      email: user.email,
      name,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save user profile to Firestore
    await setDoc(doc(db, 'users', user.uid), userProfile);

    return userProfile;
  } catch (error) {
    handleError(error, 'signUp');
    throw error;
  }
};

/**
 * Logs in an existing user with email and password.
 */
export const logIn = async (email: string, password: string): Promise<FirebaseUser> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    handleError(error, 'logIn');
    throw error;
  }
};

/**
 * Logs out the current user.
 */
export const logOut = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    handleError(error, 'logOut');
    throw error;
  }
};

/**
 * Retrieves a user's profile from Firestore.
 * If profile doesn't exist, it creates one automatically from auth data.
 */
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      return userDocSnap.data() as UserProfile;
    } else {
      // If profile doesn't exist, try to create it from auth data
      const user = auth.currentUser;
      if (user && user.uid === uid) {
        console.log('Creating missing profile for:', user.email);
        
        // Determine role from email or set default
        let role: UserProfile['role'] = 'elderly';
        if (user.email?.includes('admin')) role = 'admin';
        else if (user.email?.includes('caregiver')) role = 'caregiver';
        else if (user.email?.includes('doctor')) role = 'doctor';
        
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email,
          name: user.email?.split('@')[0] || 'User',
          role,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        await setDoc(userDocRef, newProfile);
        console.log('✅ Created missing profile for:', user.email);
        return newProfile;
      }
      return null;
    }
  } catch (error) {
    console.error('Error in getUserProfile:', error);
    return null;
  }
};

/**
 * Updates a user's profile in Firestore.
 */
export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleError(error, 'updateUserProfile');
    throw error;
  }
};

/**
 * Deletes a user's profile from Firestore (admin only).
 */
export const deleteUserProfile = async (uid: string): Promise<void> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    await deleteDoc(userDocRef);
  } catch (error) {
    handleError(error, 'deleteUserProfile');
    throw error;
  }
};

/**
 * Gets all users with a specific role (admin only).
 */
export const getUsersByRole = async (role: UserProfile['role']): Promise<UserProfile[]> => {
  try {
    const usersQuery = query(collection(db, 'users'), where('role', '==', role));
    const querySnapshot = await getDocs(usersQuery);
    
    const users: UserProfile[] = [];
    querySnapshot.forEach((doc) => {
      users.push(doc.data() as UserProfile);
    });
    
    return users;
  } catch (error) {
    handleError(error, 'getUsersByRole');
    throw error;
  }
};

/**
 * Gets all users from Firestore (admin only).
 */
export const getAllUsers = async (): Promise<UserProfile[]> => {
  try {
    const querySnapshot = await getDocs(collection(db, 'users'));
    const users: UserProfile[] = [];
    querySnapshot.forEach((doc) => {
      users.push(doc.data() as UserProfile);
    });
    return users;
  } catch (error) {
    handleError(error, 'getAllUsers');
    throw error;
  }
};

/**
 * Subscribes to authentication state changes.
 */
export const onAuthStateChange = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Sends a password reset email.
 */
export const sendPasswordReset = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    handleError(error, 'sendPasswordReset');
    throw error;
  }
};

/**
 * Sends email verification.
 */
export const sendVerificationEmail = async (user: FirebaseUser): Promise<void> => {
  try {
    await sendEmailVerification(user);
  } catch (error) {
    handleError(error, 'sendVerificationEmail');
    throw error;
  }
};