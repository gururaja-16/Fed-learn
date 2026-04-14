import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore,
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  limit,
  serverTimestamp,
  getDocFromServer,
  enableIndexedDbPersistence,
  terminate,
  clearIndexedDbPersistence
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with long polling for better reliability in restricted environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

// Enable Offline Persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence can only be enabled in one tab at a a time.
    console.warn('Firestore persistence failed: Multiple tabs open');
  } else if (err.code === 'unimplemented') {
    // The current browser does not support all of the features required to enable persistence
    console.warn('Firestore persistence failed: Browser not supported');
  }
});

// Operation types for error handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// Custom error handling for Firestore
export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  // If we are offline, some errors are expected and shouldn't be treated as fatal
  if (!navigator.onLine && error instanceof Error && error.message.includes('offline')) {
    console.warn(`Firestore operation ${operationType} on ${path} queued for offline sync.`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Don't throw if it's just a connection issue in offline mode
  if (error instanceof Error && (error.message.includes('offline') || error.message.includes('Could not reach Cloud Firestore'))) {
    return;
  }
  throw new Error(JSON.stringify(errInfo));
}

export async function performEmergencyWipe() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
    localStorage.clear();
    sessionStorage.clear();
    // The reload will happen in the UI component after a countdown
  } catch (error) {
    console.error('Emergency wipe failed:', error);
    // Fallback: at least clear storage
    localStorage.clear();
    sessionStorage.clear();
  }
}

export { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  limit,
  serverTimestamp
};
