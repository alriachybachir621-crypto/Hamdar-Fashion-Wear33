/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Upload,
  Trash2,
  Save,
  CheckCircle2,
  Loader2,
  Lock,
  Phone,
  Megaphone,
  LogOut,
  Image as ImageIcon,
  Database,
  Eye,
  EyeOff,
  AlertTriangle,
  Edit3,
  Plus,
  ArrowUp,
  ArrowDown,
  Sparkles,
  KeyRound,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import { Product, SiteSettings, StoreType } from '../types';
import {
  ADMIN_EMAIL,
  addProduct,
  updateProduct,
  deleteProduct,
  reorderProducts,
  updateSettings,
  adminLogin,
  adminLogout,
  adminChangePassword,
  compressImageToBase64,
  isFirebaseLiveMode,
  getCurrentAuthUser,
} from '../firebaseService';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: SiteSettings;
  user: any;
}

function formatErrorMessage(err: any): string {
  if (!err) return 'حدث خطأ غير متوقع';
  const code = err.code || '';
  const message = err.message || String(err);

  if (code === 'auth/not-authenticated' || message.includes('سجّل الدخول')) {
    return 'سجّل الدخول من جديد (auth/not-authenticated)';
  }
  if (code === 'permission-denied' || message.includes('permission-denied')) {
    return 'ليس لديك صلاحية الكتابة (permission-denied). يرجى التأكد من البريد الإلكتروني للمسؤول.';
  }
  if (code === 'deadline-exceeded' || message.includes('مهلة')) {
    return 'انتهت مهلة الاتصال بالخادم (20 ثانية). تحقق من اتصال الإنترنت.';
  }
  if (code === 'unavailable') {
    return 'الخدمة غير متوفرة حالياً (unavailable).';
  }
  if (code) {
    return `فشلت العملية (${code}): ${message}`;
  }
  return message || 'تعذر إتمام العملية';
}

function formatLoginErrorMessage(err: any): string {
  if (!err) return 'فشل تسجيل الدخول';
  const code = err.code || '';
  const msg = err.message || String(err);

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    msg.includes('invalid-credential') ||
    msg.includes('wrong-password')
  ) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  }
  if (code === 'auth/invalid-email') {
    return 'صيغة البريد الإلكتروني غير صحيحة';
  }
  if (code === 'auth/too-many-requests') {
    return 'تم حظر المحاولات مؤقتاً بسبب تكرار الخطأ. يرجى الانتظار دقيقة والمحاولة مجدداً.';
  }
  if (code === 'auth/network-request-failed') {
    return 'فشل الاتصال بالإنترنت. يرجى التحقق من الشبكة.';
  }
  if (code === 'deadline-exceeded') {
    return 'انتهت مهلة تسجيل الدخول (20 ثانية). تحقق من اتصالك.';
  }
  return msg || 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
}

function formatPasswordErrorMessage(err: any): string {
  if (!err) return 'حدث خطأ غير متوقع';
  const code = err.code || '';
  const message = err.message || String(err);

  if (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    message.includes('الرمز الحالي غلط') ||
    message.includes('wrong-password')
  ) {
    return 'الرمز الحالي غير صحيح';
  }
  if (code === 'auth/too-many-requests') {
    return 'محاولات كثيرة، يرجى الانتظار قليلاً ثم المحاولة';
  }
  if (code === 'auth/not-authenticated' || message.includes('سجّل الدخول')) {
    return 'سجّل الدخول من جديد';
  }
  if (code) {
    return `فشلت العملية (${code})`;
  }
  return message || 'تعذر تغيير الرمز';
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  user,
}) => {
  const [activeTab, setActiveTab] = useState<StoreType | 'settings'>('men');

  // Login form state (Always asked on modal open, no persistent session)
  const [loginEmail, setLoginEmail] = useState(ADMIN_EMAIL);
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Inactivity & auto-logout ref
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset password field and errors whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setLoginPassword('');
      setAuthError('');
    }
  }, [isOpen]);

  // Handle logout and close modal cleanly
  const handlePerformLogout = useCallback(async () => {
    try {
      await adminLogout();
    } catch (err) {
      console.error('[AdminModal] Logout error:', err);
    }
  }, []);

  // 1. Inactivity Logout: 5 minutes (300,000 ms) of inactivity
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    if (user && isOpen) {
      inactivityTimerRef.current = setTimeout(() => {
        handlePerformLogout();
        setAuthError('تم تسجيل الخروج تلقائياً لعدم وجود نشاط لمدة 5 دقائق.');
      }, 5 * 60 * 1000);
    }
  }, [user, isOpen, handlePerformLogout]);

  useEffect(() => {
    if (!user || !isOpen) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      return;
    }

    resetInactivityTimer();

    const activityEvents = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'scroll'];
    const handleActivity = () => resetInactivityTimer();

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleActivity);
      });
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [user, isOpen, resetInactivityTimer]);

  // 2. Auto sign out when hiding app or closing tab / leaving
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && user) {
        handlePerformLogout();
      }
    };

    const handlePageHide = () => {
      if (user) {
        handlePerformLogout();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [user, handlePerformLogout]);

  // 3. Auto sign out when closing the admin modal
  const handleCloseModal = () => {
    handlePerformLogout();
    onClose();
  };

  // Add product form
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newNameAr, setNewNameAr] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newImageBase64, setNewImageBase64] = useState<string>('');
  const [isCompressingNew, setIsCompressingNew] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // Edit product modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editNameAr, setEditNameAr] = useState('');
  const [editNameEn, setEditNameEn] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editImageBase64, setEditImageBase64] = useState<string>('');
  const [isCompressingEdit, setIsCompressingEdit] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Quick toggle inline loading tracker
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Settings form state
  const [bannerText, setBannerText] = useState(settings.banner || '');
  const [menPhoneVal, setMenPhoneVal] = useState(settings.menPhone || '76 320 279');
  const [womenPhoneVal, setWomenPhoneVal] = useState(settings.womenPhone || '81 612 154');
  const [heroImageBase64, setHeroImageBase64] = useState(settings.heroImage || '');
  const [isCompressingHero, setIsCompressingHero] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  // Change password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Lock body scroll whenever admin modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('admin-open');
    } else {
      document.body.classList.remove('admin-open');
    }
    return () => {
      document.body.classList.remove('admin-open');
    };
  }, [isOpen]);

  // Sync settings when props change
  useEffect(() => {
    setBannerText(settings.banner || '');
    setMenPhoneVal(settings.menPhone || '76 320 279');
    setWomenPhoneVal(settings.womenPhone || '81 612 154');
    setHeroImageBase64(settings.heroImage || '');
  }, [settings]);

  if (!isOpen) return null;

  // Handle Admin Login with Email & Password
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim()) {
      setAuthError('يرجى إدخال البريد الإلكتروني');
      return;
    }
    if (!loginPassword.trim()) {
      setAuthError('يرجى إدخال كلمة المرور');
      return;
    }

    setAuthLoading(true);
    setAuthError('');

    try {
      await adminLogin(loginEmail.trim(), loginPassword.trim());
      setLoginPassword('');
    } catch (err: any) {
      console.error('[AdminModal] Login error:', err);
      setAuthError(formatLoginErrorMessage(err));
    } finally {
      setAuthLoading(false);
    }
  };

  // Add Product Photo Handler
  const handleAddImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingNew(true);
    setAddError('');
    try {
      const base64 = await compressImageToBase64(file);
      setNewImageBase64(base64);
    } catch (err: any) {
      setAddError(err.message || 'تعذر ضغط الصورة');
    } finally {
      setIsCompressingNew(false);
    }
  };

  // Save new product to Firestore
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess(false);

    if (!user && isFirebaseLiveMode()) {
      setAddError('سجّل الدخول من جديد');
      return;
    }

    if (!newNameAr.trim()) {
      setAddError('اسم المنتج بالعربية مطلوب');
      return;
    }

    setIsAdding(true);
    try {
      const cleanPrice = newPrice.trim().replace('$', '');
      const finalEnName = newNameEn.trim() || newNameAr.trim();

      const storeProducts = products.filter((p) => p.store === activeTab);
      const maxOrder = storeProducts.reduce((max, p) => Math.max(max, p.order ?? 0), 0);

      await addProduct({
        store: activeTab === 'settings' ? 'men' : activeTab,
        nameAr: newNameAr.trim(),
        nameEn: finalEnName,
        category: newCategory.trim(),
        price: cleanPrice,
        imageUrl: newImageBase64,
        soldOut: false,
        hidden: false,
        order: maxOrder + 1,
      });

      setAddSuccess(true);
      setNewNameAr('');
      setNewNameEn('');
      setNewCategory('');
      setNewPrice('');
      setNewImageBase64('');
      if (addFileInputRef.current) addFileInputRef.current.value = '';

      setTimeout(() => {
        setAddSuccess(false);
        setIsAddOpen(false);
      }, 2000);
    } catch (err: any) {
      setAddError(formatErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  };

  // Open Edit Product Drawer
  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setEditNameAr(product.nameAr);
    setEditNameEn(product.nameEn || '');
    setEditCategory(product.category || '');
    setEditPrice(product.price || '');
    setEditImageBase64(product.imageUrl || '');
    setEditError('');
    setEditSuccess(false);
  };

  // Edit Product Photo Handler
  const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingEdit(true);
    setEditError('');
    try {
      const base64 = await compressImageToBase64(file);
      setEditImageBase64(base64);
    } catch (err: any) {
      setEditError(err.message || 'تعذر ضغط الصورة');
    } finally {
      setIsCompressingEdit(false);
    }
  };

  // Save Edit Product to Firestore
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setEditError('');
    setEditSuccess(false);

    if (!user && isFirebaseLiveMode()) {
      setEditError('سجّل الدخول من جديد');
      return;
    }

    if (!editNameAr.trim()) {
      setEditError('اسم المنتج بالعربية مطلوب');
      return;
    }

    setIsSavingEdit(true);
    try {
      const cleanPrice = editPrice.trim().replace('$', '');
      const finalEnName = editNameEn.trim() || editNameAr.trim();

      await updateProduct(editingProduct.id, {
        nameAr: editNameAr.trim(),
        nameEn: finalEnName,
        category: editCategory.trim(),
        price: cleanPrice,
        imageUrl: editImageBase64,
      });

      setEditSuccess(true);
      setTimeout(() => {
        setEditSuccess(false);
        setEditingProduct(null);
      }, 2000);
    } catch (err: any) {
      setEditError(formatErrorMessage(err));
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المنتج نهائياً من قاعدة البيانات؟')) return;
    setIsDeleting(true);
    try {
      await deleteProduct(id);
      setEditingProduct(null);
    } catch (err: any) {
      setEditError(formatErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  };

  // Quick toggle Sold Out
  const handleToggleSoldOut = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingId(product.id);
    try {
      await updateProduct(product.id, { soldOut: !product.soldOut });
    } catch (err: any) {
      alert(formatErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  // Quick toggle Hidden
  const handleToggleHidden = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingId(product.id);
    try {
      await updateProduct(product.id, { hidden: !product.hidden });
    } catch (err: any) {
      alert(formatErrorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  // Reorder product up / down
  const handleReorder = async (product: Product, direction: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const storeList = products.filter((p) => p.store === product.store);
      await reorderProducts(product.id, direction, storeList);
    } catch (err: any) {
      alert(formatErrorMessage(err));
    }
  };

  // Settings Hero Image compression
  const handleHeroImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingHero(true);
    setSettingsError('');
    try {
      const base64 = await compressImageToBase64(file);
      setHeroImageBase64(base64);
    } catch (err: any) {
      setSettingsError(err.message || 'تعذر ضغط صورة الواجهة');
    } finally {
      setIsCompressingHero(false);
    }
  };

  // Save Settings to Firestore
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError('');
    setSettingsSuccess(false);

    if (!user && isFirebaseLiveMode()) {
      setSettingsError('سجّل الدخول من جديد');
      return;
    }

    setIsSavingSettings(true);
    try {
      await updateSettings({
        banner: bannerText.trim(),
        menPhone: menPhoneVal.trim(),
        womenPhone: womenPhoneVal.trim(),
        heroImage: heroImageBase64 || '',
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 2000);
    } catch (err: any) {
      setSettingsError(formatErrorMessage(err));
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Change Admin Password in Firebase Auth
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (!user && isFirebaseLiveMode()) {
      setPasswordError('سجّل الدخول من جديد');
      return;
    }

    if (!currentPassword) {
      setPasswordError('يرجى إدخال الرمز الحالي');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('الرمز الجديد يجب أن يتكون من 6 أحرف على الأقل');
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordError('الرمز الجديد يجب أن يختلف عن الرمز الحالي');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('تأكيد الرمز غير متطابق مع الرمز الجديد');
      return;
    }

    setIsChangingPassword(true);
    try {
      await adminChangePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      setPasswordError(formatPasswordErrorMessage(err));
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Store products
  const currentStoreProducts =
    activeTab !== 'settings'
      ? products
          .filter((p) => p.store === activeTab)
          .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999))
      : [];

  const menCount = products.filter((p) => p.store === 'men').length;
  const womenCount = products.filter((p) => p.store === 'women').length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Admin Panel"
      className="admin-overlay fixed inset-0 z-50 bg-[var(--dark)]/95 backdrop-blur-md flex flex-col w-full max-w-full overflow-y-auto overflow-x-hidden select-none safe-top safe-bottom"
      style={{
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
      }}
      dir="rtl"
    >
      {/* 1. Header Bar with visible "تسجيل الخروج" button */}
      <header className="sticky top-0 z-20 bg-[var(--dark)] border-b border-[var(--line)]/30 px-3.5 py-3 flex items-center justify-between gap-2 max-w-full">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[var(--red)]/20 text-[var(--red)] flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-white tracking-wide truncate">
              لوحة التحكم
            </h1>
            <p className="text-[11px] text-[var(--gold)] truncate flex items-center gap-1">
              <Database className="w-2.5 h-2.5" />
              <span>قاعدة بيانات فايربيس السحابية</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user && (
            <button
              onClick={handlePerformLogout}
              className="touch-btn px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut className="w-3.5 h-3.5 text-red-400" />
              <span>تسجيل الخروج</span>
            </button>
          )}

          <button
            onClick={handleCloseModal}
            className="touch-btn w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="إغلاق لوحة التحكم"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Content Body */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-3.5 sm:p-6 pb-24">
        {/* If NOT logged in: Email + Password Screen (never persistent session) */}
        {!user ? (
          <div className="max-w-sm mx-auto my-8 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[var(--red)]/10 text-[var(--red)] mx-auto flex items-center justify-center mb-5">
              <Lock className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-bold mb-1.5 text-[var(--ink)]">تسجيل الدخول للإدارة</h2>
            <p className="text-xs text-[var(--muted)] mb-6">
              أدخل بيانات حساب المسؤول للوصول إلى لوحة التحكم
            </p>

            <form onSubmit={handleLoginSubmit} className="space-y-4 text-right">
              {/* Email Field */}
              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1.5">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    value={loginEmail}
                    onChange={(e) => {
                      setLoginEmail(e.target.value);
                      if (authError) setAuthError('');
                    }}
                    placeholder="admin@hamdar-site.app"
                    dir="ltr"
                    className="w-full h-11 px-3.5 ps-10 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-sm focus:border-[var(--red)] focus:ring-1 focus:ring-[var(--red)] focus:outline-none transition-all"
                  />
                  <Mail className="w-4 h-4 text-[var(--muted)] absolute start-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* Password Field */}
              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1.5">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck="false"
                    value={loginPassword}
                    disabled={authLoading}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      if (authError) setAuthError('');
                    }}
                    placeholder="••••••••"
                    dir="ltr"
                    className="w-full h-11 px-3.5 pe-10 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-sm focus:border-[var(--red)] focus:ring-1 focus:ring-[var(--red)] focus:outline-none transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 end-0 px-3 flex items-center text-[var(--muted)] hover:text-[var(--ink)]"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {authError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs text-center font-bold flex items-center justify-center gap-2 animate-in fade-in">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="touch-btn w-full h-12 rounded-xl bg-[var(--red)] hover:bg-[#a61217] text-white font-bold text-base transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 mt-2"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التحقق...</span>
                  </>
                ) : (
                  <span>دخول</span>
                )}
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-[var(--line)] text-center">
              <span className="text-[11px] text-[var(--muted)]">
                جلسة الإدارة مؤقتة وتنتهي تلقائياً عند إغلاق اللوحة أو عدم النشاط.
              </span>
            </div>
          </div>
        ) : (
          /* Logged In View */
          <div className="space-y-4">
            {/* 3 Equal Tabs row for 375px */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--card)] rounded-xl border border-[var(--line)] text-center text-xs font-bold">
              <button
                onClick={() => setActiveTab('men')}
                className={`touch-btn py-2.5 px-1 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                  activeTab === 'men'
                    ? 'bg-[var(--red)] text-white shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <span className="truncate">رجالي ({menCount})</span>
              </button>

              <button
                onClick={() => setActiveTab('women')}
                className={`touch-btn py-2.5 px-1 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                  activeTab === 'women'
                    ? 'bg-[var(--red)] text-white shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <span className="truncate">نسائي ({womenCount})</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`touch-btn py-2.5 px-1 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                  activeTab === 'settings'
                    ? 'bg-[var(--red)] text-white shadow-xs'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                <span className="truncate">الإعدادات</span>
              </button>
            </div>

            {/* PRODUCT TABS (Men or Women) */}
            {activeTab !== 'settings' && (
              <div className="space-y-4">
                {/* Add Product Button */}
                <button
                  onClick={() => setIsAddOpen(true)}
                  className="touch-btn w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  <span>
                    إضافة منتج جديد ({activeTab === 'men' ? 'قسم رجالي' : 'قسم نسائي'})
                  </span>
                </button>

                {/* Add Product Drawer */}
                {isAddOpen && (
                  <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl animate-in slide-in-from-top-3 duration-200">
                    <div className="flex items-center justify-between border-b border-[var(--line)] pb-2.5">
                      <h3 className="font-bold text-sm text-[var(--ink)] flex items-center gap-2">
                        <Plus className="w-4 h-4 text-emerald-500" />
                        <span>إضافة منتج جديد</span>
                      </h3>
                      <button
                        onClick={() => setIsAddOpen(false)}
                        className="p-1 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleAddProduct} className="space-y-3.5">
                      {/* Photo Upload with client compression */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--ink)] mb-1.5">
                          صورة المنتج (تُضغط وتُحفظ في قاعدة البيانات)
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="w-16 h-20 rounded-lg overflow-hidden bg-[var(--bg)] border border-[var(--line)] shrink-0 flex items-center justify-center relative">
                            {isCompressingNew ? (
                              <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" />
                            ) : newImageBase64 ? (
                              <img
                                src={newImageBase64}
                                alt="Preview"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-[var(--muted)]/40" />
                            )}
                          </div>

                          <div className="space-y-1 flex-1">
                            <input
                              type="file"
                              ref={addFileInputRef}
                              accept="image/*"
                              onChange={handleAddImageChange}
                              className="hidden"
                              id="add-product-photo"
                            />
                            <label
                              htmlFor="add-product-photo"
                              className="touch-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] cursor-pointer hover:border-[var(--muted)]"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>{newImageBase64 ? 'تغيير الصورة' : 'اختيار صورة'}</span>
                            </label>

                            {newImageBase64 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setNewImageBase64('');
                                  if (addFileInputRef.current) addFileInputRef.current.value = '';
                                }}
                                className="block text-[11px] text-red-500 hover:underline cursor-pointer"
                              >
                                إزالة الصورة
                              </button>
                            )}
                            <p className="text-[10px] text-[var(--muted)]">
                              يتم ضغط الصورة تلقائياً لأقصى عرض 800 بكسل بجودة عالية.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                            الاسم بالعربية <span className="text-[var(--red)]">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={newNameAr}
                            onChange={(e) => setNewNameAr(e.target.value)}
                            placeholder="مثال: قميص صيفي فاخر"
                            className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                            الاسم بالإنجليزية (اختياري)
                          </label>
                          <input
                            type="text"
                            value={newNameEn}
                            onChange={(e) => setNewNameEn(e.target.value)}
                            placeholder="Classic Summer Shirt"
                            dir="ltr"
                            className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                            التصنيف (اختياري)
                          </label>
                          <input
                            type="text"
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            placeholder="قمصان، أحذية، كنزات..."
                            className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                            السعر بالدولار ($)
                          </label>
                          <input
                            type="text"
                            value={newPrice}
                            onChange={(e) => setNewPrice(e.target.value)}
                            placeholder="35"
                            dir="ltr"
                            className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Error & Success Messages */}
                      {addError && (
                        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold animate-in fade-in">
                          {addError}
                        </div>
                      )}

                      {addSuccess && (
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>تم الحفظ ✓</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={isAdding || isCompressingNew}
                          className="touch-btn flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          {isAdding ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>جاري الحفظ في فايربيس...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>نشر وحفظ المنتج</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsAddOpen(false)}
                          className="touch-btn px-4 h-11 rounded-xl bg-[var(--bg)] border border-[var(--line)] text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]"
                        >
                          إلغاء
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Products List */}
                <div className="space-y-2.5">
                  {currentStoreProducts.length === 0 ? (
                    <div className="text-center py-12 px-4 rounded-2xl bg-[var(--card)] border border-dashed border-[var(--line)]">
                      <p className="text-sm font-bold text-[var(--ink)] mb-1">
                        لا توجد منتجات في هذا القسم بعد
                      </p>
                      <p className="text-xs text-[var(--muted)] mb-4">
                        انقر على "إضافة منتج جديد" لإضافة أول عنصر مباشرة في قاعدة البيانات.
                      </p>
                    </div>
                  ) : (
                    currentStoreProducts.map((product, idx) => (
                      <div
                        key={product.id}
                        className={`p-3 rounded-xl bg-[var(--card)] border border-[var(--line)] flex items-center gap-3 transition-colors ${
                          product.hidden ? 'opacity-60 bg-[var(--bg)]' : ''
                        }`}
                      >
                        {/* Photo */}
                        <div className="w-14 h-16 rounded-lg bg-[var(--bg)] border border-[var(--line)] overflow-hidden shrink-0 relative flex items-center justify-center">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.nameAr}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] text-[var(--muted)] text-center px-1">
                              بلا صورة
                            </span>
                          )}
                        </div>

                        {/* Title and details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-bold text-[var(--ink)] truncate">
                              {product.nameAr}
                            </h4>
                            {product.soldOut && (
                              <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[10px] font-bold shrink-0">
                                نفد
                              </span>
                            )}
                            {product.hidden && (
                              <span className="px-1.5 py-0.5 rounded bg-neutral-500/20 text-neutral-400 text-[10px] font-bold shrink-0">
                                مخفي
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] mt-1">
                            {product.price && (
                              <span className="text-[var(--gold)] font-bold" dir="ltr">
                                ${product.price}
                              </span>
                            )}
                            {product.category && <span>• {product.category}</span>}
                          </div>
                        </div>

                        {/* Reorder arrows */}
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={(e) => handleReorder(product, 'up', e)}
                            disabled={idx === 0}
                            className="p-1 rounded bg-[var(--bg)] hover:bg-[var(--line)] disabled:opacity-30 text-[var(--ink)]"
                            title="تحريك لأعلى"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleReorder(product, 'down', e)}
                            disabled={idx === currentStoreProducts.length - 1}
                            className="p-1 rounded bg-[var(--bg)] hover:bg-[var(--line)] disabled:opacity-30 text-[var(--ink)]"
                            title="تحريك لأسفل"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Actions: Edit, Toggle Sold, Toggle Hidden */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={(e) => handleToggleSoldOut(product, e)}
                            disabled={togglingId === product.id}
                            className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                              product.soldOut
                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                : 'bg-[var(--bg)] border-[var(--line)] text-[var(--muted)] hover:text-[var(--ink)]'
                            }`}
                          >
                            {product.soldOut ? 'إلغاء نفد' : 'نفد'}
                          </button>

                          <button
                            onClick={() => handleOpenEdit(product)}
                            className="p-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-[var(--ink)] hover:border-[var(--muted)] transition-colors"
                            title="تعديل"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                {/* 1. General Site Settings */}
                <form
                  onSubmit={handleSaveSettings}
                  className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm"
                >
                  <h3 className="font-bold text-sm sm:text-base text-[var(--ink)] flex items-center gap-2 border-b border-[var(--line)] pb-3">
                    <Megaphone className="w-4 h-4 text-[var(--red)]" />
                    <span>إعدادات المتجر العامة</span>
                  </h3>

                  {/* Announcement Banner */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                      شريط الإعلان أعلى الصفحة (أحمر)
                    </label>
                    <input
                      type="text"
                      value={bannerText}
                      onChange={(e) => setBannerText(e.target.value)}
                      placeholder="مثال: خصم 20% على جميع تشكيلات الشتاء! اترك الحقل فارغاً لإخفاء الشريط."
                      className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                    />
                    <p className="text-[10px] text-[var(--muted)] mt-1">
                      اترك الحقل فارغاً لإخفاء الشريط تماماً من أعلى الموقع.
                    </p>
                  </div>

                  {/* Phone Numbers */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        رقم هاتف / واتساب رجالي
                      </label>
                      <input
                        type="text"
                        value={menPhoneVal}
                        onChange={(e) => setMenPhoneVal(e.target.value)}
                        placeholder="76 320 279"
                        dir="ltr"
                        className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        رقم هاتف / واتساب نسائي
                      </label>
                      <input
                        type="text"
                        value={womenPhoneVal}
                        onChange={(e) => setWomenPhoneVal(e.target.value)}
                        placeholder="81 612 154"
                        dir="ltr"
                        className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Hero Background Image */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink)] mb-1.5">
                      صورة خلفية الواجهة الرئيسية (Hero Image)
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-14 rounded-lg bg-[var(--bg)] border border-[var(--line)] overflow-hidden shrink-0 flex items-center justify-center relative">
                        {isCompressingHero ? (
                          <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" />
                        ) : heroImageBase64 ? (
                          <img
                            src={heroImageBase64}
                            alt="Hero"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-[var(--muted)]">خلفية داكنة</span>
                        )}
                      </div>

                      <div className="space-y-1 flex-1">
                        <input
                          type="file"
                          ref={heroFileInputRef}
                          accept="image/*"
                          onChange={handleHeroImageChange}
                          className="hidden"
                          id="hero-bg-photo"
                        />
                        <label
                          htmlFor="hero-bg-photo"
                          className="touch-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{heroImageBase64 ? 'تغيير الخلفية' : 'رفع صورة للواجهة'}</span>
                        </label>

                        {heroImageBase64 && (
                          <button
                            type="button"
                            onClick={() => {
                              setHeroImageBase64('');
                              if (heroFileInputRef.current) heroFileInputRef.current.value = '';
                            }}
                            className="block text-[11px] text-red-500 hover:underline cursor-pointer"
                          >
                            إزالة الخلفية والعودة للنمط الافتراضي
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Error & Success Feedback */}
                  {settingsError && (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold animate-in fade-in">
                      {settingsError}
                    </div>
                  )}

                  {settingsSuccess && (
                    <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تم الحفظ في فايربيس ✓</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingSettings || isCompressingHero}
                    className="touch-btn w-full h-11 rounded-xl bg-[var(--red)] hover:bg-[#a61217] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                  >
                    {isSavingSettings ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري حفظ الإعدادات...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>حفظ الإعدادات</span>
                      </>
                    )}
                  </button>
                </form>

                {/* 2. Change Admin Password */}
                <form
                  onSubmit={handleChangePassword}
                  className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm"
                >
                  <h3 className="font-bold text-sm sm:text-base text-[var(--ink)] flex items-center gap-2 border-b border-[var(--line)] pb-3">
                    <KeyRound className="w-4 h-4 text-[var(--gold)]" />
                    <span>تغيير الرمز السري للمسؤول</span>
                  </h3>

                  <div className="space-y-3">
                    {/* Current password */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        الرمز الحالي <span className="text-[var(--red)]">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showCurrentPwd ? 'text' : 'password'}
                          required
                          autoComplete="off"
                          value={currentPassword}
                          onChange={(e) => {
                            setCurrentPassword(e.target.value);
                            if (passwordError) setPasswordError('');
                          }}
                          placeholder="الرمز الحالي"
                          dir="ltr"
                          className="w-full h-10 px-3 pe-10 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--gold)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                          className="absolute inset-y-0 end-0 px-3 flex items-center text-[var(--muted)] hover:text-[var(--ink)]"
                          tabIndex={-1}
                        >
                          {showCurrentPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* New password */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        الرمز الجديد <span className="text-[var(--red)]">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPwd ? 'text' : 'password'}
                          required
                          autoComplete="off"
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            if (passwordError) setPasswordError('');
                          }}
                          placeholder="6 أحرف أو أكثر"
                          dir="ltr"
                          className="w-full h-10 px-3 pe-10 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--gold)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPwd(!showNewPwd)}
                          className="absolute inset-y-0 end-0 px-3 flex items-center text-[var(--muted)] hover:text-[var(--ink)]"
                          tabIndex={-1}
                        >
                          {showNewPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm new password */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                        تأكيد الرمز الجديد <span className="text-[var(--red)]">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPwd ? 'text' : 'password'}
                          required
                          autoComplete="off"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            if (passwordError) setPasswordError('');
                          }}
                          placeholder="أعد إدخال الرمز الجديد"
                          dir="ltr"
                          className="w-full h-10 px-3 pe-10 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--gold)] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                          className="absolute inset-y-0 end-0 px-3 flex items-center text-[var(--muted)] hover:text-[var(--ink)]"
                          tabIndex={-1}
                        >
                          {showConfirmPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Error & Success Feedback */}
                    {passwordError && (
                      <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold animate-in fade-in">
                        {passwordError}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>تم تحديث الرمز بنجاح ✓</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="touch-btn w-full h-11 rounded-xl bg-[var(--gold)] hover:bg-[#9d7725] text-black font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                    >
                      {isChangingPassword ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>جاري التحديث...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4" />
                          <span>تغيير الرمز</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 3. EDIT PRODUCT MODAL DRAWER */}
      {editingProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          dir="rtl"
        >
          <div className="bg-[var(--card)] border border-[var(--line)] rounded-t-2xl sm:rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h3 className="font-bold text-base text-[var(--ink)]">تعديل المنتج</h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="w-8 h-8 rounded-lg bg-[var(--bg)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              {/* Photo preview and replace */}
              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1.5">
                  الصورة
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-20 rounded-lg overflow-hidden bg-[var(--bg)] border border-[var(--line)] shrink-0 flex items-center justify-center relative">
                    {isCompressingEdit ? (
                      <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" />
                    ) : editImageBase64 ? (
                      <img
                        src={editImageBase64}
                        alt="Product"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] text-[var(--muted)]">بلا صورة</span>
                    )}
                  </div>

                  <div className="space-y-1 flex-1">
                    <input
                      type="file"
                      ref={editFileInputRef}
                      accept="image/*"
                      onChange={handleEditImageChange}
                      className="hidden"
                      id="edit-product-photo"
                    />
                    <label
                      htmlFor="edit-product-photo"
                      className="touch-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg)] border border-[var(--line)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>تغيير الصورة</span>
                    </label>

                    {editImageBase64 && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditImageBase64('');
                          if (editFileInputRef.current) editFileInputRef.current.value = '';
                        }}
                        className="block text-[11px] text-red-500 hover:underline cursor-pointer"
                      >
                        إزالة الصورة الحالية
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  الاسم بالعربية <span className="text-[var(--red)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editNameAr}
                  onChange={(e) => setEditNameAr(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  الاسم بالإنجليزية (اختياري)
                </label>
                <input
                  type="text"
                  value={editNameEn}
                  onChange={(e) => setEditNameEn(e.target.value)}
                  dir="ltr"
                  className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                    التصنيف
                  </label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                    السعر ($)
                  </label>
                  <input
                    type="text"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    dir="ltr"
                    className="w-full h-10 px-3 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-xs focus:border-[var(--red)] focus:outline-none"
                  />
                </div>
              </div>

              {/* Error & Success Messages */}
              {editError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold animate-in fade-in">
                  {editError}
                </div>
              )}

              {editSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تم الحفظ ✓</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSavingEdit || isCompressingEdit}
                  className="touch-btn flex-1 h-11 rounded-xl bg-[var(--red)] hover:bg-[#a61217] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>حفظ التعديلات</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDeleteProduct(editingProduct.id)}
                  className="touch-btn px-3 h-11 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold flex items-center gap-1.5 border border-red-500/20 cursor-pointer disabled:opacity-50"
                  title="حذف المنتج"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>حذف</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
