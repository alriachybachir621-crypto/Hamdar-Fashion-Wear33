/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
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
  ShoppingBag,
} from 'lucide-react';
import { Product, SiteSettings, StoreType } from '../types';
import {
  addProduct,
  updateProduct,
  deleteProduct,
  reorderProducts,
  updateSettings,
  adminLogin,
  adminLogout,
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

const LOCKOUT_KEY = 'hamdar_admin_lockout_until';
const ATTEMPTS_KEY = 'hamdar_admin_failed_attempts';

function formatErrorMessage(err: any): string {
  if (!err) return 'حدث خطأ غير متوقع';
  const code = err.code || '';
  const message = err.message || String(err);

  if (code === 'auth/not-authenticated' || message.includes('سجّل الدخول')) {
    return 'سجّل الدخول من جديد (auth/not-authenticated)';
  }
  if (code === 'permission-denied' || message.includes('permission-denied')) {
    return 'ليس لديك صلاحية الكتابة (permission-denied). تأكد من تسجيل الدخول كمسؤول.';
  }
  if (code === 'deadline-exceeded' || message.includes('مهلة')) {
    return 'انتهت مهلة الاتصال بالخادم (deadline-exceeded). تحقق من اتصال الإنترنت.';
  }
  if (code === 'unavailable') {
    return 'الخدمة غير متوفرة حالياً (unavailable).';
  }
  if (message.includes('الرمز غلط') || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'الرمز غلط';
  }
  if (code) {
    return `فشلت العملية (${code}): ${message}`;
  }
  return message || 'تعذر إتمام العملية';
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  user,
}) => {
  const [activeTab, setActiveTab] = useState<StoreType | 'settings'>('men');

  // Single passcode auth
  const [passcode, setPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Lockout state
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Add product drawer / sheet
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

  // Quick edit modal state
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

  // Lock body scroll whenever admin modal is open to eliminate iOS bounce
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

  // Check lockout on mount and interval
  useEffect(() => {
    const checkLockout = () => {
      const until = parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10);
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLockoutSeconds(remaining);
      if (remaining === 0 && until > 0) {
        localStorage.removeItem(LOCKOUT_KEY);
        localStorage.removeItem(ATTEMPTS_KEY);
      }
    };

    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!isOpen) return null;

  // Handle Passcode Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    if (!passcode.trim()) {
      setAuthError('يرجى إدخال الرمز السري');
      return;
    }

    setAuthLoading(true);
    setAuthError('');

    try {
      await adminLogin(passcode.trim());
      // reset attempts on success
      localStorage.removeItem(ATTEMPTS_KEY);
      localStorage.removeItem(LOCKOUT_KEY);
      setPasscode('');
    } catch {
      // Failed attempt
      const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) + 1;
      localStorage.setItem(ATTEMPTS_KEY, attempts.toString());

      if (attempts >= 5) {
        const lockoutUntil = Date.now() + 60 * 1000;
        localStorage.setItem(LOCKOUT_KEY, lockoutUntil.toString());
        setLockoutSeconds(60);
        setAuthError('تم حظر المحاولات لمدة 60 ثانية بسبب تكرار الخطأ.');
      } else {
        const remainingAttempts = 5 - attempts;
        setAuthError(`الرمز غلط (تبقى ${remainingAttempts} محاولات)`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await adminLogout();
    } catch (err) {
      console.error(err);
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

  // Save new product
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
      // If English name is empty, fall back to Arabic name
      const finalEnName = newNameEn.trim() || newNameAr.trim();

      await addProduct({
        store: activeTab === 'settings' ? 'men' : activeTab,
        nameAr: newNameAr.trim(),
        nameEn: finalEnName,
        category: newCategory.trim() || undefined,
        price: cleanPrice || undefined,
        imageUrl: newImageBase64 || undefined,
        soldOut: false,
        hidden: false,
      });

      setAddSuccess(true);
      // Reset form
      setNewNameAr('');
      setNewNameEn('');
      setNewCategory('');
      setNewPrice('');
      setNewImageBase64('');
      if (addFileInputRef.current) addFileInputRef.current.value = '';

      setTimeout(() => {
        setAddSuccess(false);
        setIsAddOpen(false);
      }, 1500);
    } catch (err: any) {
      setAddError(formatErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  };

  // Open Edit Product Drawer
  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setEditNameAr(p.nameAr || '');
    setEditNameEn(p.nameEn || '');
    setEditCategory(p.category || '');
    setEditPrice(p.price || '');
    setEditImageBase64(p.imageUrl || '');
    setEditError('');
    setEditSuccess(false);
  };

  // Edit Image handler
  const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingEdit(true);
    setEditError('');
    try {
      const base64 = await compressImageToBase64(file);
      setEditImageBase64(base64);
    } catch (err: any) {
      setEditError(err.message || 'تعذر معالجة الصورة');
    } finally {
      setIsCompressingEdit(false);
    }
  };

  // Save edited product
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
      await updateProduct(editingProduct.id, {
        nameAr: editNameAr.trim(),
        nameEn: editNameEn.trim() || editNameAr.trim(),
        category: editCategory.trim() || undefined,
        price: cleanPrice || undefined,
        imageUrl: editImageBase64 || undefined,
      });

      setEditSuccess(true);
      setTimeout(() => {
        setEditSuccess(false);
        setEditingProduct(null);
      }, 1500);
    } catch (err: any) {
      setEditError(formatErrorMessage(err));
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete product
  const handleDeleteProduct = async () => {
    if (!editingProduct) return;
    const confirmed = window.confirm(`هل أنت متأكد من حذف "${editingProduct.nameAr}"؟`);
    if (!confirmed) return;

    setIsDeleting(true);
    setEditError('');
    try {
      await deleteProduct(editingProduct.id);
      setEditingProduct(null);
    } catch (err: any) {
      setEditError(formatErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  };

  // Quick SoldOut Toggle
  const handleToggleSoldOut = async (p: Product) => {
    setTogglingId(p.id);
    try {
      await updateProduct(p.id, { soldOut: !p.soldOut });
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  };

  // Quick Hidden Toggle
  const handleToggleHidden = async (p: Product) => {
    setTogglingId(p.id);
    try {
      await updateProduct(p.id, { hidden: !p.hidden });
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingId(null);
    }
  };

  // Quick Reorder
  const handleReorder = async (productId: string, direction: 'up' | 'down') => {
    if (activeTab === 'settings') return;
    try {
      await reorderProducts(productId, direction, activeTab);
    } catch (err) {
      console.error(err);
    }
  };

  // Hero background image upload in settings
  const handleHeroImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressingHero(true);
    setSettingsError('');
    try {
      const base64 = await compressImageToBase64(file);
      setHeroImageBase64(base64);
    } catch (err: any) {
      setSettingsError(err.message || 'تعذر معالجة صورة الواجهة');
    } finally {
      setIsCompressingHero(false);
    }
  };

  // Save Settings
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
      setTimeout(() => setSettingsSuccess(false), 2500);
    } catch (err: any) {
      setSettingsError(formatErrorMessage(err));
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Products filtered for active tab
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
      className="admin-overlay fixed inset-0 z-50 bg-[var(--dark)]/95 backdrop-blur-md flex flex-col w-full max-w-full overflow-y-auto overflow-x-hidden safe-paddings select-none"
      dir="rtl"
    >
      {/* 1. Header Bar: wrapped & touch-friendly for 375px */}
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
              <span>{isFirebaseLiveMode() ? 'قاعدة بيانات سحابية متصلة' : 'وضع محلي'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {user && (
            <button
              onClick={handleLogout}
              className="touch-btn px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
              title="تسجيل الخروج"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">تسجيل الخروج</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="touch-btn w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. Content Body */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-3.5 sm:p-6 pb-24">
        {/* If NOT logged in: Single Passcode Gate */}
        {!user ? (
          <div className="max-w-sm mx-auto my-12 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-[var(--red)]/10 text-[var(--red)] mx-auto flex items-center justify-center mb-5">
              <Lock className="w-8 h-8" />
            </div>

            <h2 className="text-xl font-bold mb-2 text-[var(--ink)]">تسجيل الدخول للإدارة</h2>
            <p className="text-xs text-[var(--muted)] mb-6">
              أدخل الرمز السري الخاص بمتجر حمدر للمتابعة
            </p>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative text-right">
                <label className="block text-xs font-bold text-[var(--ink)] mb-1.5">
                  الرمز السري
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passcode}
                    disabled={lockoutSeconds > 0 || authLoading}
                    onChange={(e) => {
                      setPasscode(e.target.value);
                      if (authError) setAuthError('');
                    }}
                    placeholder="••••••••"
                    dir="ltr"
                    className="w-full h-12 px-4 pe-11 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] font-mono text-base focus:border-[var(--red)] focus:ring-1 focus:ring-[var(--red)] focus:outline-none transition-all disabled:opacity-50"
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

              {authError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs text-center font-bold animate-in fade-in">
                  {authError}
                </div>
              )}

              {lockoutSeconds > 0 && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs text-center font-bold">
                  محظور مؤقتاً: انتظر {lockoutSeconds} ثانية
                </div>
              )}

              <button
                type="submit"
                disabled={lockoutSeconds > 0 || authLoading}
                className="touch-btn w-full h-12 rounded-xl bg-[var(--red)] hover:bg-[#a31117] text-white font-bold text-base transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التحقق...</span>
                  </>
                ) : (
                  <span>دخول</span>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* LOGGED IN VIEW */
          <div className="space-y-5">
            {/* 3 Equal Tabs: Men / Women / Settings */}
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10 w-full text-center">
              <button
                onClick={() => {
                  setActiveTab('men');
                  setIsAddOpen(false);
                }}
                className={`touch-btn py-2.5 px-1 rounded-lg text-xs sm:text-sm font-bold transition-all truncate flex items-center justify-center gap-1 ${
                  activeTab === 'men'
                    ? 'bg-[var(--red)] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <span>رجالي</span>
                <span className="text-[10px] opacity-75">({menCount})</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('women');
                  setIsAddOpen(false);
                }}
                className={`touch-btn py-2.5 px-1 rounded-lg text-xs sm:text-sm font-bold transition-all truncate flex items-center justify-center gap-1 ${
                  activeTab === 'women'
                    ? 'bg-[var(--red)] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <span>نسائي</span>
                <span className="text-[10px] opacity-75">({womenCount})</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('settings');
                  setIsAddOpen(false);
                }}
                className={`touch-btn py-2.5 px-1 rounded-lg text-xs sm:text-sm font-bold transition-all truncate ${
                  activeTab === 'settings'
                    ? 'bg-[var(--red)] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <span>إعدادات</span>
              </button>
            </div>

            {/* TAB CONTENT: PRODUCTS (MEN / WOMEN) */}
            {activeTab !== 'settings' && (
              <div className="space-y-4">
                {/* Add Product Toggle Button */}
                <button
                  onClick={() => setIsAddOpen(!isAddOpen)}
                  className={`touch-btn w-full py-3.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    isAddOpen
                      ? 'bg-neutral-800 text-white border-white/20'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-md'
                  }`}
                >
                  {isAddOpen ? (
                    <>
                      <X className="w-4 h-4" />
                      <span>إلغاء الإضافة</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>إضافة منتج جديد ({activeTab === 'men' ? 'رجالي' : 'نسائي'})</span>
                    </>
                  )}
                </button>

                {/* ADD PRODUCT BOTTOM SHEET / DRAWER */}
                {isAddOpen && (
                  <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 shadow-xl animate-in fade-in slide-in-from-top-3 duration-200">
                    <h3 className="text-base font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4 text-[var(--red)]" />
                      <span>إضافة منتج جديد لـ {activeTab === 'men' ? 'حمدر رجالي' : 'حمدر نسائي'}</span>
                    </h3>

                    <form onSubmit={handleAddProduct} className="space-y-4">
                      {/* Photo Picker */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--ink)] mb-2">
                          صورة المنتج (اختياري)
                        </label>
                        <div className="flex items-center gap-3">
                          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-[var(--line)] overflow-hidden bg-[var(--bg)] flex items-center justify-center relative shrink-0">
                            {isCompressingNew ? (
                              <Loader2 className="w-6 h-6 animate-spin text-[var(--muted)]" />
                            ) : newImageBase64 ? (
                              <img
                                src={newImageBase64}
                                alt="Preview"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <ImageIcon className="w-6 h-6 text-[var(--muted)] opacity-50" />
                            )}
                          </div>

                          <div className="space-y-1.5 flex-1 min-w-0">
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
                              className="touch-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] hover:border-[var(--muted)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>اختر صورة من الهاتف</span>
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
                                حذف الصورة
                              </button>
                            )}
                            <p className="text-[10px] text-[var(--muted)]">
                              تُضغط الصورة تلقائياً لسرعة فائقة (أقل من 150KB)
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Arabic Name (Required) */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                          اسم المنتج بالعربية <span className="text-[var(--red)]">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newNameAr}
                          onChange={(e) => setNewNameAr(e.target.value)}
                          placeholder="مثال: قميص كتان تركي كحلي"
                          className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base focus:border-[var(--red)] focus:outline-none"
                        />
                      </div>

                      {/* English Name (Optional) */}
                      <div>
                        <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                          الاسم بالإنجليزية (اختياري)
                        </label>
                        <input
                          type="text"
                          value={newNameEn}
                          onChange={(e) => setNewNameEn(e.target.value)}
                          placeholder="مثال: Navy Turkish Linen Shirt"
                          dir="ltr"
                          className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base focus:border-[var(--red)] focus:outline-none"
                        />
                        <p className="text-[10px] text-[var(--muted)] mt-1">
                          إذا تركته فارغاً، سيتم استخدام الاسم العربي تلقائياً.
                        </p>
                      </div>

                      {/* Category & Price Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                            التصنيف (اختياري)
                          </label>
                          <input
                            type="text"
                            value={newCategory}
                            onChange={(e) => setNewCategory(e.target.value)}
                            placeholder={activeTab === 'men' ? 'مثال: قمصان، بدلات' : 'مثال: فساتين، أطقم'}
                            className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base focus:border-[var(--red)] focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                            السعر بالدولار (اختياري)
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={newPrice}
                              onChange={(e) => setNewPrice(e.target.value)}
                              placeholder="25"
                              dir="ltr"
                              className="w-full h-11 px-3 pe-8 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base focus:border-[var(--red)] focus:outline-none font-bold"
                            />
                            <span className="absolute inset-y-0 end-3 flex items-center text-sm font-bold text-[var(--gold)]">
                              $
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Feedback messages */}
                      {addError && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold">
                          {addError}
                        </div>
                      )}

                      {addSuccess && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>تم الحفظ ✓</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isAdding || isCompressingNew}
                        className="touch-btn w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
                      >
                        {isAdding ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>جاري النشر...</span>
                          </>
                        ) : (
                          <span>إضافة المنتج الآن</span>
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {/* PRODUCT LIST WITH QUICK TOGGLES */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold text-neutral-400 px-1">
                    قائمة المنتجات ({currentStoreProducts.length})
                  </h3>

                  {currentStoreProducts.length === 0 ? (
                    <div className="p-8 text-center bg-white/5 rounded-2xl border border-white/10 text-neutral-400 text-xs">
                      لا توجد منتجات مسجلة في هذا القسم بعد. اضغط على "إضافة منتج جديد" بالأعلى.
                    </div>
                  ) : (
                    currentStoreProducts.map((p, index) => {
                      const isToggling = togglingId === p.id;

                      return (
                        <div
                          key={p.id}
                          className={`flex items-center gap-3 p-2.5 sm:p-3 rounded-xl border transition-all ${
                            p.hidden
                              ? 'bg-neutral-900/40 border-neutral-800 opacity-60'
                              : 'bg-[var(--card)] border-[var(--line)] shadow-2xs'
                          }`}
                        >
                          {/* Reorder Buttons (↑ / ↓) */}
                          <div className="flex flex-col gap-1 shrink-0">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => handleReorder(p.id, 'up')}
                              className="w-6 h-6 rounded bg-black/10 hover:bg-black/20 text-neutral-400 hover:text-white flex items-center justify-center disabled:opacity-20 cursor-pointer"
                              title="تحريك لأعلى"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={index === currentStoreProducts.length - 1}
                              onClick={() => handleReorder(p.id, 'down')}
                              className="w-6 h-6 rounded bg-black/10 hover:bg-black/20 text-neutral-400 hover:text-white flex items-center justify-center disabled:opacity-20 cursor-pointer"
                              title="تحريك لأسفل"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Thumbnail */}
                          <div className="w-12 h-14 rounded-lg overflow-hidden bg-[var(--bg)] border border-[var(--line)] shrink-0 relative">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.nameAr}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full diagonal-placeholder flex items-center justify-center text-[9px] text-[var(--muted)]">
                                بلا صورة
                              </div>
                            )}
                            {p.soldOut && (
                              <div className="absolute inset-0 bg-red-600/80 text-white text-[8px] font-bold flex items-center justify-center">
                                نفد
                              </div>
                            )}
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs sm:text-sm font-bold text-[var(--ink)] truncate">
                              {p.nameAr}
                            </h4>
                            <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                              {p.price && (
                                <span className="font-bold text-[var(--gold)]" dir="ltr">
                                  ${p.price}
                                </span>
                              )}
                              {p.category && (
                                <span className="px-1.5 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[10px]">
                                  {p.category}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* SoldOut Toggle */}
                            <button
                              type="button"
                              disabled={isToggling}
                              onClick={() => handleToggleSoldOut(p)}
                              className={`touch-btn px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                p.soldOut
                                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                  : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                              }`}
                            >
                              {p.soldOut ? 'نفد' : 'متوفر'}
                            </button>

                            {/* Hidden Toggle */}
                            <button
                              type="button"
                              disabled={isToggling}
                              onClick={() => handleToggleHidden(p)}
                              className={`touch-btn px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                p.hidden
                                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                  : 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20 hover:text-white'
                              }`}
                            >
                              {p.hidden ? 'مخفي' : 'ظاهر'}
                            </button>

                            {/* Edit / Delete */}
                            <button
                              type="button"
                              onClick={() => openEditModal(p)}
                              className="touch-btn w-8 h-8 rounded-lg bg-[var(--bg)] border border-[var(--line)] hover:border-[var(--muted)] text-[var(--ink)] flex items-center justify-center cursor-pointer"
                              title="تعديل أو حذف"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB CONTENT: SETTINGS */}
            {activeTab === 'settings' && (
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
                  {/* Announcement Banner */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink)] mb-1.5 flex items-center gap-1.5">
                      <Megaphone className="w-4 h-4 text-[var(--red)]" />
                      <span>شريط الإعلانات العلوي (فارغ = مخفي)</span>
                    </label>
                    <input
                      type="text"
                      value={bannerText}
                      onChange={(e) => setBannerText(e.target.value)}
                      placeholder="مثال: خصم 20% على جميع البدلات الرجالية بمناسبة الموسم"
                      className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base focus:border-[var(--red)] focus:outline-none"
                    />
                    <p className="text-[10px] text-[var(--muted)] mt-1">
                      يظهر كشريط أحمر أنيق في أعلى الموقع لجذب انتباه الزوار.
                    </p>
                  </div>

                  {/* Hero Background Image */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--ink)] mb-2 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[var(--gold)]" />
                      <span>صورة خلفية الواجهة الرئيسية (Hero)</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-16 rounded-xl border-2 border-dashed border-[var(--line)] overflow-hidden bg-[var(--bg)] flex items-center justify-center relative shrink-0">
                        {isCompressingHero ? (
                          <Loader2 className="w-6 h-6 animate-spin text-[var(--muted)]" />
                        ) : heroImageBase64 ? (
                          <img
                            src={heroImageBase64}
                            alt="Hero Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-[var(--muted)]">بدون خلفية</span>
                        )}
                      </div>

                      <div className="space-y-1.5 flex-1 min-w-0">
                        <input
                          type="file"
                          ref={heroFileInputRef}
                          accept="image/*"
                          onChange={handleHeroImageChange}
                          className="hidden"
                          id="hero-photo-input"
                        />
                        <label
                          htmlFor="hero-photo-input"
                          className="touch-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--line)] hover:border-[var(--muted)] text-xs font-bold text-[var(--ink)] cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>تغيير صورة الواجهة</span>
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
                            حذف صورة الواجهة واستخدام الخلفية الداكنة
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Phone Numbers */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--line)]">
                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[var(--red)]" />
                        <span>رقم هاتف / واتساب (رجالي)</span>
                      </label>
                      <input
                        type="text"
                        value={menPhoneVal}
                        onChange={(e) => setMenPhoneVal(e.target.value)}
                        placeholder="76 320 279"
                        dir="ltr"
                        className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base font-bold focus:border-[var(--red)] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[var(--ink)] mb-1 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[var(--gold)]" />
                        <span>رقم هاتف / واتساب (نسائي)</span>
                      </label>
                      <input
                        type="text"
                        value={womenPhoneVal}
                        onChange={(e) => setWomenPhoneVal(e.target.value)}
                        placeholder="81 612 154"
                        dir="ltr"
                        className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base font-bold focus:border-[var(--red)] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Feedback */}
                  {settingsError && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold">
                      {settingsError}
                    </div>
                  )}

                  {settingsSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تم الحفظ ✓</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingSettings || isCompressingHero}
                    className="touch-btn w-full h-12 rounded-xl bg-[var(--red)] hover:bg-[#a31117] text-white font-bold text-base transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-md"
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
                </div>
              </form>
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
                  <div className="w-16 h-20 rounded-lg overflow-hidden bg-[var(--bg)] border border-[var(--line)] shrink-0 relative">
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
                  className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base focus:border-[var(--red)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--ink)] mb-1">
                  الاسم بالإنجليزية
                </label>
                <input
                  type="text"
                  value={editNameEn}
                  onChange={(e) => setEditNameEn(e.target.value)}
                  dir="ltr"
                  className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base focus:border-[var(--red)] focus:outline-none"
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
                    className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base focus:border-[var(--red)] focus:outline-none"
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
                    className="w-full h-11 px-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-base font-bold focus:border-[var(--red)] focus:outline-none"
                  />
                </div>
              </div>

              {editError && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold">
                  {editError}
                </div>
              )}

              {editSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تم الحفظ ✓</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSavingEdit || isCompressingEdit}
                  className="touch-btn flex-1 h-11 rounded-xl bg-[var(--red)] hover:bg-[#a31117] text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <span>حفظ التعديلات</span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDeleteProduct}
                  className="touch-btn px-4 h-11 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 font-bold text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="حذف المنتج نهائياً"
                >
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>حذف</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
