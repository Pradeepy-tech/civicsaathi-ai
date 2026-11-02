import { getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
  type Auth,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

function createResilientAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: [browserSessionPersistence, browserLocalPersistence, inMemoryPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    return getAuth(app);
  }
}

export const auth = createResilientAuth();
export const oAuthClientId: string = firebaseConfig.oAuthClientId || '';
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });
