import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  inMemoryPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from './firebaseConfig';
import { INITIAL_SETTINGS } from './initialData';
import { Product, SiteSettings, StoreType } from './types';

export const ADMIN_EMAIL = 'admin@hamdar-site.app';
export const FIRESTORE_DATABASE_ID =
  firebaseConfig.firestoreDatabaseId ||
  'ai-studio-hamdarfashionwea-ef69c317-eeab-4909-a4c2-a0c2b13ab306';

let isLive = isFirebaseConfigured();
let auth: ReturnType<typeof getAuth> | null = null;
let db: ReturnType<typeof getFirestore> | null = null;

if (isLive) {
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    // Explicitly target user provisioned database ID
    db = getFirestore(app, FIRESTORE_DATABASE_ID);

    // Enforce inMemoryPersistence immediately and sign out any persisted session on page load
    setPersistence(auth, inMemoryPersistence).catch((err) => {
      console.error('[Firebase Auth] Failed to set inMemoryPersistence:', err);
    });
    signOut(auth).catch(() => {});
  } catch (err) {
    console.error('[Firebase Init Error] Failed to initialize Firebase:', err);
    isLive = false;
  }
}

/**
 * Sign out any admin session on page load (enforces ephemeral auth)
 */
export async function signOutAdminOnLoad(): Promise<void> {
  if (isLive && auth) {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('[Firebase Auth] SignOut on load:', err);
    }
  }
}

/**
 * 20-second timeout wrapper with descriptive error reporting
 */
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

/**
 * Compress an image file to Base64 data URL:
 * - Max width: 800px (scales height proportionally)
 * - JPEG quality: 0.70
 * - Keeps base64 payload safely under 900KB for Firestore documents
 * - Handles EXIF orientation via createImageBitmap
 */
export async function compressImageToBase64(file: File): Promise<string> {
  const MAX_WIDTH = 800;
  const MAX_HEIGHT = 1000;
  const MAX_BYTES = 850 * 1024; // 850KB target to remain safely under 900KB document limit

  let sourceWidth = 0;
  let sourceHeight = 0;
  let source: CanvasImageSource;

  if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
    try {
      const bitmap = await window.createImageBitmap(file);
      source = bitmap;
      sourceWidth = bitmap.width;
      sourceHeight = bitmap.height;
    } catch {
      source = await loadImageElement(file);
      sourceWidth = (source as HTMLImageElement).width;
      sourceHeight = (source as HTMLImageElement).height;
    }
  } else {
    source = await loadImageElement(file);
    sourceWidth = (source as HTMLImageElement).width;
    sourceHeight = (source as HTMLImageElement).height;
  }

  let width = sourceWidth;
  let height = sourceHeight;

  // Scale down if width > 800 or height > 1000 while preserving aspect ratio
  if (width > MAX_WIDTH) {
    height = Math.round((height * MAX_WIDTH) / width);
    width = MAX_WIDTH;
  }
  if (height > MAX_HEIGHT) {
    width = Math.round((width * MAX_HEIGHT) / height);
    height = MAX_HEIGHT;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذر إنشاء مساحة معالجة الصورة (Canvas)');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  let quality = 0.7;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);

  const getByteSize = (url: string) => {
    const b64 = url.split(',')[1] || '';
    return Math.round((b64.length * 3) / 4);
  };

  let bytes = getByteSize(dataUrl);

  // If size exceeds 850KB, step quality down
  while (bytes > MAX_BYTES && quality > 0.3) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    bytes = getByteSize(dataUrl);
  }

  // If still above max, scale canvas dimensions down further
  if (bytes > MAX_BYTES) {
    const scaledWidth = Math.round(canvas.width * 0.75);
    const scaledHeight = Math.round(canvas.height * 0.75);
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = scaledWidth;
    smallCanvas.height = scaledHeight;
    const smallCtx = smallCanvas.getContext('2d');
    if (smallCtx) {
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.imageSmoothingQuality = 'high';
      smallCtx.drawImage(canvas, 0, 0, scaledWidth, scaledHeight);
      dataUrl = smallCanvas.toDataURL('image/jpeg', 0.6);
    }
  }

  return dataUrl;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('تعذر معالجة أبعاد الصورة'));
      img.onload = () => resolve(img);
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Subscribe to Firestore 'products' collection.
 * No mock or sample products are returned. Returns empty array if no documents exist.
 */
export function subscribeProducts(
  callback: (products: Product[]) => void,
  onLoaded?: () => void
): () => void {
  if (isLive && db) {
    const colRef = collection(db, 'products');
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const list: Product[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            store: data.store || 'men',
            nameAr: data.nameAr || '',
            nameEn: data.nameEn || data.nameAr || '',
            category: data.category || '',
            price: data.price || '',
            imageUrl: data.imageUrl || '',
            soldOut: Boolean(data.soldOut),
            hidden: Boolean(data.hidden),
            order: typeof data.order === 'number' ? data.order : 9999,
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
          });
        });

        // Sort by order ascending, then createdAt descending
        list.sort((a, b) => {
          const orderA = a.order ?? 9999;
          const orderB = b.order ?? 9999;
          if (orderA !== orderB) return orderA - orderB;
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        callback(list);
        if (onLoaded) onLoaded();
      },
      (error) => {
        console.error(
          '[Firestore Products Error] Failed to fetch products from database:',
          error
        );
        callback([]);
        if (onLoaded) onLoaded();
      }
    );
    return unsubscribe;
  } else {
    console.warn('[Firestore] Not connected, returning empty products list.');
    callback([]);
    if (onLoaded) onLoaded();
    return () => {};
  }
}

/**
 * Subscribe to site settings from Firestore collection 'settings', doc 'site'
 */
export function subscribeSettings(callback: (settings: SiteSettings) => void): () => void {
  if (isLive && db) {
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
            heroImage: d.heroImage || '',
          });
        } else {
          callback(INITIAL_SETTINGS);
        }
      },
      (error) => {
        console.error('[Firestore Settings Error] Failed to fetch settings:', error);
        callback(INITIAL_SETTINGS);
      }
    );
    return unsubscribe;
  } else {
    callback(INITIAL_SETTINGS);
    return () => {};
  }
}

/**
 * Subscribe to Auth state changes.
 * Never checks localStorage for fake demo auth flags.
 */
export function subscribeAuth(callback: (user: User | null) => void): () => void {
  if (isLive && auth) {
    return onAuthStateChanged(auth, callback);
  } else {
    callback(null);
    return () => {};
  }
}

/**
 * Admin Login:
 * - Requires email and password
 * - Sets inMemoryPersistence before signing in so session is never stored on disk
 * - Does not store tokens or credentials in localStorage/sessionStorage/cookies
 */
export async function adminLogin(email: string, passcode: string): Promise<void> {
  if (!isLive || !auth) {
    console.error('[Auth Error] Firebase Authentication is not available.');
    throw new Error('خدمة المصادقة غير متوفرة حالياً. تأكد من اتصال الإنترنت.');
  }

  // Enforce inMemoryPersistence
  await setPersistence(auth, inMemoryPersistence);

  await withTimeout(
    signInWithEmailAndPassword(auth, email.trim(), passcode),
    20000,
    'انتهت مهلة تسجيل الدخول (20 ثانية)'
  );
}

/**
 * Admin Logout: signs out from Firebase Auth
 */
export async function adminLogout(): Promise<void> {
  if (isLive && auth) {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('[Firebase Auth] Sign out error:', err);
    }
  }
}

export function isFirebaseLiveMode(): boolean {
  return isLive;
}

export function getCurrentAuthUser(): User | null {
  return auth?.currentUser || null;
}

/**
 * Add a new product into Firestore 'products' collection.
 */
export async function addProduct(product: {
  store: StoreType;
  nameAr: string;
  nameEn?: string;
  category?: string;
  price?: string;
  imageUrl?: string;
  soldOut?: boolean;
  hidden?: boolean;
  order?: number;
}): Promise<Product> {
  if (!isLive || !db) {
    throw new Error('قاعدة بيانات فايربيس غير متصلة');
  }

  if (!auth?.currentUser) {
    const err: any = new Error('سجّل الدخول من جديد');
    err.code = 'auth/not-authenticated';
    throw err;
  }

  const finalNameAr = product.nameAr.trim();
  const finalNameEn = product.nameEn?.trim() || finalNameAr;

  const newProduct: Product = {
    id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    store: product.store,
    nameAr: finalNameAr,
    nameEn: finalNameEn,
    category: product.category?.trim() || '',
    price: product.price?.trim() || '',
    imageUrl: product.imageUrl || '',
    soldOut: false,
    hidden: false,
    order: typeof product.order === 'number' ? product.order : 9999,
    createdAt: Date.now(),
  };

  try {
    await withTimeout(
      setDoc(doc(db, 'products', newProduct.id), newProduct),
      20000,
      'انتهت مهلة حفظ المنتج في قاعدة البيانات (20 ثانية)'
    );
    return newProduct;
  } catch (err: any) {
    console.error('[Firestore Error] Failed to add product:', err);
    throw err;
  }
}

/**
 * Update existing product in Firestore.
 */
export async function updateProduct(
  id: string,
  updates: Partial<Omit<Product, 'id' | 'createdAt'>>
): Promise<void> {
  if (!isLive || !db) {
    throw new Error('قاعدة بيانات فايربيس غير متصلة');
  }

  if (!auth?.currentUser) {
    const err: any = new Error('سجّل الدخول من جديد');
    err.code = 'auth/not-authenticated';
    throw err;
  }

  try {
    await withTimeout(
      setDoc(doc(db, 'products', id), updates, { merge: true }),
      20000,
      'انتهت مهلة تحديث المنتج (20 ثانية)'
    );
  } catch (err: any) {
    console.error('[Firestore Error] Failed to update product:', err);
    throw err;
  }
}

/**
 * Delete a product from Firestore.
 */
export async function deleteProduct(id: string): Promise<void> {
  if (!isLive || !db) {
    throw new Error('قاعدة بيانات فايربيس غير متصلة');
  }

  if (!auth?.currentUser) {
    const err: any = new Error('سجّل الدخول من جديد');
    err.code = 'auth/not-authenticated';
    throw err;
  }

  try {
    await withTimeout(
      deleteDoc(doc(db, 'products', id)),
      20000,
      'انتهت مهلة حذف المنتج (20 ثانية)'
    );
  } catch (err: any) {
    console.error('[Firestore Error] Failed to delete product:', err);
    throw err;
  }
}

/**
 * Reorder products inside Firestore.
 */
export async function reorderProducts(
  productId: string,
  direction: 'up' | 'down',
  allStoreProducts: Product[]
): Promise<void> {
  const index = allStoreProducts.findIndex((p) => p.id === productId);
  if (index === -1) return;

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= allStoreProducts.length) return;

  const current = allStoreProducts[index];
  const target = allStoreProducts[targetIndex];

  const currentOrder = current.order ?? index + 1;
  const targetOrder = target.order ?? targetIndex + 1;

  await Promise.all([
    updateProduct(current.id, { order: targetOrder }),
    updateProduct(target.id, { order: currentOrder }),
  ]);
}

/**
 * Update site settings in Firestore doc ('settings/site').
 */
export async function updateSettings(settings: Partial<SiteSettings>): Promise<void> {
  if (!isLive || !db) {
    throw new Error('قاعدة بيانات فايربيس غير متصلة');
  }

  if (!auth?.currentUser) {
    const err: any = new Error('سجّل الدخول من جديد');
    err.code = 'auth/not-authenticated';
    throw err;
  }

  try {
    await withTimeout(
      setDoc(doc(db, 'settings', 'site'), settings, { merge: true }),
      20000,
      'انتهت مهلة تحديث الإعدادات (20 ثانية)'
    );
  } catch (err: any) {
    console.error('[Firestore Error] Failed to update settings:', err);
    throw err;
  }
}

/**
 * Change Admin Password in Firebase Auth.
 */
export async function adminChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!isLive || !auth) {
    throw new Error('خدمة المصادقة غير متصلة');
  }

  const user = auth.currentUser;
  if (!user || !user.email) {
    const err: any = new Error('سجّل الدخول من جديد');
    err.code = 'auth/not-authenticated';
    throw err;
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await withTimeout(
    reauthenticateWithCredential(user, credential),
    20000,
    'انتهت مهلة التحقق من الرمز الحالي'
  );

  await withTimeout(
    updatePassword(user, newPassword),
    20000,
    'انتهت مهلة تحديث كلمة المرور'
  );
}
