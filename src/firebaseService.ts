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
  throw error;
}

// Timeout helper (20 seconds)
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 20000,
  fallbackMsg = 'انتهت مهلة الاتصال بالخادم (20 ثانية)'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error(fallbackMsg);
      err.code = 'deadline-exceeded';
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([
    promise.then(
      (res) => {
        clearTimeout(timer);
        return res;
      },
      (err) => {
        clearTimeout(timer);
        throw err;
      }
    ),
    timeoutPromise,
  ]);
}

// LocalStorage keys for demo fallback mode
const DEMO_PRODUCTS_KEY = 'hamdar_products_v1';
const DEMO_SETTINGS_KEY = 'hamdar_settings_v1';
const DEMO_ADMIN_KEY = 'hamdar_demo_admin_logged';
const DEMO_PWD_KEY = 'hamdar_demo_password';

let isLive = isFirebaseConfigured();
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;

if (isLive) {
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    // CRITICAL: Must use firestoreDatabaseId when provisioned with named database
    db = firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);

    // Test connection on boot
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
 * Client-side Canvas Image Compression:
 * - Max side: 500px
 * - JPEG quality: 0.70 default
 * - Strictly under 150KB (153,600 bytes)
 * - Returns base64 data URL string directly (no Firebase Storage used)
 */
export async function compressImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تعذر معالجة الصورة في المتصفح'));
      img.onload = () => {
        const MAX_DIM = 500;
        const MAX_BYTES = 150 * 1024; // 150KB

        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas context unavailable'));
        }

        // Draw with smoothing for high-quality downsampling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Try at quality 0.7
        let quality = 0.7;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        // Calculate approximate byte size of base64 string
        const calcBytes = (url: string) => {
          const base64Str = url.split(',')[1] || '';
          return Math.round((base64Str.length * 3) / 4);
        };

        // If above 150KB, reduce quality progressively
        let bytes = calcBytes(dataUrl);
        while (bytes > MAX_BYTES && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
          bytes = calcBytes(dataUrl);
        }

        // If still above 150KB, scale down dimensions
        if (bytes > MAX_BYTES) {
          canvas.width = Math.round(width * 0.75);
          canvas.height = Math.round(height * 0.75);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        }

        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
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
      for (const prod of INITIAL_PRODUCTS) {
        await setDoc(doc(firestoreDb, 'products', prod.id), prod);
      }
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
        console.warn('Firestore products listener error, using cache:', error);
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
        console.warn('Firestore settings error, using fallback:', error);
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
 * Add a new product (wrapped in 20-second timeout with auth validation)
 */
export async function addProduct(product: {
  store: StoreType;
  nameAr: string;
  nameEn?: string;
  price?: string;
  imageUrl?: string;
}): Promise<Product> {
  const finalNameAr = product.nameAr.trim();
  const finalNameEn = (product.nameEn && product.nameEn.trim()) || finalNameAr;
  const newProduct: Product = {
    id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    store: product.store,
    nameAr: finalNameAr,
    nameEn: finalNameEn,
    price: product.price?.trim() || '',
    imageUrl: product.imageUrl || '',
    createdAt: Date.now(),
  };

  if (isLive && db) {
    if (!auth?.currentUser) {
      const err: any = new Error('سجّل الدخول من جديد');
      err.code = 'auth/not-authenticated';
      throw err;
    }
    const path = `products/${newProduct.id}`;
    try {
      await withTimeout(
        setDoc(doc(db, 'products', newProduct.id), newProduct),
        20000
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  // Update local cache so it appears immediately on public page and admin list
  const list = getDemoProducts();
  const updated = [newProduct, ...list.filter((p) => p.id !== newProduct.id)];
  localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(updated));
  notifyProductListeners();

  return newProduct;
}

/**
 * Update an existing product (wrapped in 20-second timeout with auth validation)
 */
export async function updateProduct(
  id: string,
  updates: Partial<Omit<Product, 'id' | 'createdAt'>>
): Promise<void> {
  if (isLive && db) {
    if (!auth?.currentUser) {
      const err: any = new Error('سجّل الدخول من جديد');
      err.code = 'auth/not-authenticated';
      throw err;
    }
    const path = `products/${id}`;
    try {
      await withTimeout(
        setDoc(doc(db, 'products', id), updates, { merge: true }),
        20000
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  const list = getDemoProducts();
  const index = list.findIndex((p) => p.id === id);
  if (index !== -1) {
    list[index] = { ...list[index], ...updates };
    localStorage.setItem(DEMO_PRODUCTS_KEY, JSON.stringify(list));
    notifyProductListeners();
  }
}

/**
 * Delete a product (wrapped in 20-second timeout with auth validation)
 */
export async function deleteProduct(id: string): Promise<void> {
  if (isLive && db) {
    if (!auth?.currentUser) {
      const err: any = new Error('سجّل الدخول من جديد');
      err.code = 'auth/not-authenticated';
      throw err;
    }
    const path = `products/${id}`;
    try {
      await withTimeout(
        deleteDoc(doc(db, 'products', id)),
        20000
      );
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
 * Update site settings (wrapped in 20-second timeout with auth validation)
 */
export async function updateSettings(settings: Partial<SiteSettings>): Promise<void> {
  if (isLive && db) {
    if (!auth?.currentUser) {
      const err: any = new Error('سجّل الدخول من جديد');
      err.code = 'auth/not-authenticated';
      throw err;
    }
    const path = 'settings/site';
    try {
      await withTimeout(
        setDoc(doc(db, 'settings', 'site'), settings, { merge: true }),
        20000
      );
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
        callback({ uid: 'demo_owner', email: 'admin@hamdar-site.app' });
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
 * Calls Firebase Auth signInWithEmailAndPassword with hidden constant email
 */
export async function adminLogin(passcode: string): Promise<void> {
  if (isLive && auth) {
    try {
      await withTimeout(
        signInWithEmailAndPassword(auth, ADMIN_EMAIL, passcode),
        20000
      );
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
    throw new Error('الرمز الجديد يجب أن لا يقل عن 6 أحرف');
  }

  if (isLive && auth && auth.currentUser) {
    await withTimeout(updatePassword(auth.currentUser, newPass), 20000);
  } else {
    localStorage.setItem(DEMO_PWD_KEY, newPass);
  }
}

export function isFirebaseLiveMode(): boolean {
  return isLive;
}

export function getCurrentAuthUser(): User | null {
  return auth?.currentUser || null;
}
