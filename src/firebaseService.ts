import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocFromServer,
  getDocs,
} from 'firebase/firestore';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig';
import { INITIAL_PRODUCTS, INITIAL_SETTINGS } from './initialData';
import { Product, SiteSettings, StoreType } from './types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentAuth = auth;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth?.currentUser?.uid,
      email: currentAuth?.currentUser?.email,
      emailVerified: currentAuth?.currentUser?.emailVerified,
      isAnonymous: currentAuth?.currentUser?.isAnonymous,
      tenantId: currentAuth?.currentUser?.tenantId,
      providerInfo: currentAuth?.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Storage keys for demo fallback mode
const DEMO_PRODUCTS_KEY = 'hamdar_products_v1';
const DEMO_SETTINGS_KEY = 'hamdar_settings_v1';
const DEMO_ADMIN_KEY = 'hamdar_demo_admin_logged';
const DEMO_PWD_KEY = 'hamdar_demo_password';

let isLive = isFirebaseConfigured();
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;
let storage: ReturnType<typeof getStorage> | null = null;

if (isLive) {
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    // CRITICAL: The app will break without specifying firestoreDatabaseId when using named databases
    db = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
    storage = getStorage(app);

    // Test connection on boot per Firebase guidelines
    (async () => {
      try {
        if (db) {
          await getDocFromServer(doc(db, 'test', 'connection'));
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.warn('Firestore offline check:', error.message);
        }
      }
    })();
  } catch (err) {
    console.warn('Firebase init failed, switching to demo mode:', err);
    isLive = false;
  }
}

/**
 * Image compressor utility:
 * Max dimension: 600px
 * Quality: 0.72 JPEG
 */
export async function compressImage(file: File, maxDim = 600, quality = 0.72): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas context unavailable'));
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas to blob compression failed'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Upload image:
 * If live Firebase and storage configured, uploads to Firebase Storage and returns URL.
 * Falls back to compressed data URL.
 */
export async function uploadProductImage(file: File): Promise<string> {
  const compressedBlob = await compressImage(file, 600, 0.72);

  if (isLive && storage) {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const path = `products/${Date.now()}_${safeName}`;
      const fileRef = storageRef(storage, path);
      await uploadBytes(fileRef, compressedBlob, {
        contentType: 'image/jpeg',
      });
      return await getDownloadURL(fileRef);
    } catch (storageErr) {
      console.warn('Firebase Storage upload failed, falling back to compressed data URL:', storageErr);
    }
  }

  // Convert compressed blob to data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(compressedBlob);
  });
}

// Demo data initialization
function getDemoProducts(): Product[] {
  const stored = localStorage.getItem(DEMO_PRODUCTS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(INITIAL_PRODUCTS));
  return INITIAL_PRODUCTS;
}

function getDemoSettings(): SiteSettings {
  const stored = localStorage.getItem(DEMO_SETTINGS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify(INITIAL_SETTINGS));
  return INITIAL_SETTINGS;
}

const productListeners = new Set<(products: Product[]) => void>();
const settingsListeners = new Set<(settings: SiteSettings) => void>();

function notifyProductListeners() {
  const list = getDemoProducts();
  productListeners.forEach((fn) => fn(list));
}

function notifySettingsListeners() {
  const settings = getDemoSettings();
  settingsListeners.forEach((fn) => fn(settings));
}

let hasSeededFirestore = false;
async function seedFirestoreIfEmpty(firestoreDb: ReturnType<typeof getFirestore>) {
  if (hasSeededFirestore || !firestoreDb) return;
  hasSeededFirestore = true;
  try {
    const colRef = collection(firestoreDb, 'products');
    const snap = await getDocs(colRef);
    if (snap.empty) {
      // Seed initial products in batch / sequentially
      for (const prod of INITIAL_PRODUCTS) {
        await setDoc(doc(firestoreDb, 'products', prod.id), prod);
      }
      // Seed initial settings
      await setDoc(doc(firestoreDb, 'settings', 'site'), INITIAL_SETTINGS);
    }
  } catch (err) {
    console.warn('Firestore seeding check:', err);
  }
}

/**
 * Subscribe to products list (Realtime)
 */
export function subscribeProducts(callback: (products: Product[]) => void): () => void {
  if (isLive && db) {
    const colPath = 'products';
    const colRef = collection(db, colPath);
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        if (snapshot.empty) {
          callback(INITIAL_PRODUCTS);
          // Auto-seed in background if owner writes
          seedFirestoreIfEmpty(db!);
        } else {
          const list: Product[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            list.push({
              id: d.id,
              store: data.store || 'men',
              nameAr: data.nameAr || '',
              nameEn: data.nameEn || '',
              price: data.price || '',
              imageUrl: data.imageUrl || '',
              createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
            });
          });
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          callback(list);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, colPath);
        callback(getDemoProducts());
      }
    );
    return unsubscribe;
  } else {
    productListeners.add(callback);
    callback(getDemoProducts());
    return () => {
      productListeners.delete(callback);
    };
  }
}

/**
 * Subscribe to site settings (Realtime)
 */
export function subscribeSettings(callback: (settings: SiteSettings) => void): () => void {
  if (isLive && db) {
    const docPath = 'settings/site';
    const docRef = doc(db, 'settings', 'site');
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const d = snapshot.data();
          callback({
            banner: d.banner || '',
            menPhone: d.menPhone || '76 320 279',
            womenPhone: d.womenPhone || '81 612 154',
          });
        } else {
          callback(INITIAL_SETTINGS);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, docPath);
        callback(getDemoSettings());
      }
    );
    return unsubscribe;
  } else {
    settingsListeners.add(callback);
    callback(getDemoSettings());
    return () => {
      settingsListeners.delete(callback);
    };
  }
}

/**
 * Add a new product
 */
export async function addProduct(product: {
  store: StoreType;
  nameAr: string;
  nameEn: string;
  price?: string;
  imageUrl?: string;
}): Promise<void> {
  const newProduct: Product = {
    id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    store: product.store,
    nameAr: product.nameAr.trim(),
    nameEn: product.nameEn.trim(),
    price: product.price?.trim() || '',
    imageUrl: product.imageUrl || '',
    createdAt: Date.now(),
  };

  if (isLive && db) {
    const path = `products/${newProduct.id}`;
    try {
      await setDoc(doc(db, 'products', newProduct.id), newProduct);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  } else {
    const list = getDemoProducts();
    const updated = [newProduct, ...list];
    localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(updated));
    notifyProductListeners();
  }
}

/**
 * Update an existing product
 */
export async function updateProduct(
  id: string,
  updates: Partial<Omit<Product, 'id' | 'createdAt'>>
): Promise<void> {
  if (isLive && db) {
    const path = `products/${id}`;
    try {
      await setDoc(doc(db, 'products', id), updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  } else {
    const list = getDemoProducts();
    const index = list.findIndex((p) => p.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates };
      localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(list));
      notifyProductListeners();
    }
  }
}

/**
 * Delete a product
 */
export async function deleteProduct(id: string): Promise<void> {
  if (isLive && db) {
    const path = `products/${id}`;
    try {
      await deleteDoc(doc(db, 'products', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  } else {
    const list = getDemoProducts();
    const updated = list.filter((p) => p.id !== id);
    localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(updated));
    notifyProductListeners();
  }
}

/**
 * Update site settings
 */
export async function updateSettings(settings: Partial<SiteSettings>): Promise<void> {
  if (isLive && db) {
    const path = 'settings/site';
    try {
      await setDoc(doc(db, 'settings', 'site'), settings, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  } else {
    const current = getDemoSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify(updated));
    notifySettingsListeners();
  }
}

/**
 * Auth subscriber
 */
export function subscribeAuth(callback: (user: User | { uid: string; email: string } | null) => void): () => void {
  if (isLive && auth) {
    return onAuthStateChanged(auth, callback);
  } else {
    const checkDemo = () => {
      const isLogged = localStorage.getItem(DEMO_ADMIN_KEY) === 'true';
      if (isLogged) {
        callback({ uid: 'demo_owner', email: 'owner@hamdarfashion.com' });
      } else {
        callback(null);
      }
    };
    checkDemo();
    window.addEventListener('storage', checkDemo);
    return () => {
      window.removeEventListener('storage', checkDemo);
    };
  }
}

const ADMIN_EMAIL = 'admin@hamdar-site.app';

/**
 * Admin Login with Passcode
 * Hidden constant email ADMIN_EMAIL = "admin@hamdar-site.app"
 */
export async function adminLogin(passcode: string): Promise<void> {
  if (isLive && auth) {
    try {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, passcode);
    } catch {
      throw new Error('الرمز غلط');
    }
  } else {
    const storedPwd = localStorage.getItem(DEMO_PWD_KEY);
    if (storedPwd && passcode === storedPwd) {
      localStorage.setItem(DEMO_ADMIN_KEY, 'true');
      window.dispatchEvent(new Event('storage'));
    } else {
      throw new Error('الرمز غلط');
    }
  }
}

/**
 * Admin Logout
 */
export async function adminLogout(): Promise<void> {
  if (isLive && auth) {
    await signOut(auth);
  }
  localStorage.removeItem(DEMO_ADMIN_KEY);
  window.dispatchEvent(new Event('storage'));
}

/**
 * Admin Change Password
 */
export async function adminChangePassword(newPass: string): Promise<void> {
  if (newPass.length < 6) {
    throw new Error('كلمة المرور يجب أن لا تقل عن 6 أحرف');
  }

  if (isLive && auth && auth.currentUser) {
    await updatePassword(auth.currentUser, newPass);
  } else {
    localStorage.setItem(DEMO_PWD_KEY, newPass);
  }
}

export function isFirebaseLiveMode(): boolean {
  return isLive;
}
