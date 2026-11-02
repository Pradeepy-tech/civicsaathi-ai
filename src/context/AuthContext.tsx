import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  signInOfficer: () => Promise<void>;
  signInWithGoogleIdToken: (idToken: string) => Promise<void>;
  signOutOfficer: () => Promise<void>;
  getFreshIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const signInOfficer = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider, browserPopupRedirectResolver);
    } catch (err: unknown) {
      let msg = 'Authentication failed. Please try signing in again.';
      if (err instanceof Error) {
        if (err.message.includes('popup-closed-by-user')) {
          msg =
            'Google Sign-In popup was closed. If the popup showed "missing initial state", use the Direct Google Sign-In button above or open this portal in a new browser tab.';
        } else if (
          err.message.includes('missing-initial-state') ||
          err.message.includes('web-storage-unsupported')
        ) {
          msg =
            'Browser blocked third-party sessionStorage inside the preview frame. Please use the Direct Google Sign-In button above or open the portal in a new tab.';
        } else {
          msg = err.message;
        }
      }
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signInWithGoogleIdToken = useCallback(async (idToken: string) => {
    setSigningIn(true);
    setAuthError(null);
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Direct Google credential sign-in failed. Please try again.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOutOfficer = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const getFreshIdToken = useCallback(async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        signingIn,
        authError,
        signInOfficer,
        signInWithGoogleIdToken,
        signOutOfficer,
        getFreshIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
