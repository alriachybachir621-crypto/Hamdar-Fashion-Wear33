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
  KeyRound,
  LogOut,
  Image as ImageIcon,
  Database,
  Eye,
  EyeOff,
  AlertTriangle,
} from 'lucide-react';
import { Product, SiteSettings, StoreType } from '../types';
import {
  addProduct,
  updateProduct,
  deleteProduct,
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

const LOCKOUT_KEY = 'hamdar_admin_lockout_until';
const ATTEMPTS_KEY = 'hamdar_admin_failed_attempts';

function formatErrorMessage(err: any): string {
  if (!err) return 'حدث خطأ غير متوقع';
  const code = err.code || '';
  const message = err.message || '';

  if (code === 'auth/not-authenticated' || message.includes('سجّل الدخول')) {
    return 'سجّل الدخول من جديد';
  }
  if (code === 'permission-denied' || message.includes('permission-denied')) {
    return 'ليس لديك صلاحية الكتابة (permission-denied) - سجّل الدخول من جديد';
  }
  if (code === 'deadline-exceeded' || message.includes('مهلة')) {
    return 'انتهت مهلة الاتصال بالخادم (20 ثانية) - تحقق من اتصال الإنترنت';
  }
  if (code === 'unavailable') {
    return 'خدمة قاعدة البيانات غير متوفرة حالياً (unavailable)';
  }
  if (code) {
    return `فشلت العملية (${code})`;
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

  // Add product form
  const [newStore, setNewStore] = useState<StoreType>('men');
  const [newNameAr, setNewNameAr] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newImageFile, setNewImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings form
  const [bannerText, setBannerText] = useState(settings.banner);
  const [menPhone, setMenPhone] = useState(settings.menPhone);
  const [womenPhone, setWomenPhone] = useState(settings.womenPhone);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState('');

  // Lockout ticker
  useEffect(() => {
    const checkLockout = () => {
      const stored = localStorage.getItem(LOCKOUT_KEY);
      if (stored) {
        const lockoutTime = parseInt(stored, 10);
        const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
        if (remaining > 0) {
          setLockoutSeconds(remaining);
        } else {
          setLockoutSeconds(0);
          localStorage.removeItem(LOCKOUT_KEY);
          localStorage.removeItem(ATTEMPTS_KEY);
        }
      } else {
        setLockoutSeconds(0);
      }
    };

    checkLockout();
    const interval = setInterval(checkLockout, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync settings when props change
  useEffect(() => {
    setBannerText(settings.banner);
    setMenPhone(settings.menPhone);
    setWomenPhone(settings.womenPhone);
  }, [settings]);

  // Keep newStore tab synchronized with active tab
  useEffect(() => {
    if (activeTab === 'men' || activeTab === 'women') {
      setNewStore(activeTab);
    }
  }, [activeTab]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;

    setAuthError('');
    setAuthLoading(true);

    try {
      await adminLogin(passcode);
      setPasscode('');
      localStorage.removeItem(ATTEMPTS_KEY);
      localStorage.removeItem(LOCKOUT_KEY);
      setLockoutSeconds(0);
    } catch {
      const currentAttempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) + 1;
      localStorage.setItem(ATTEMPTS_KEY, currentAttempts.toString());

      if (currentAttempts >= 5) {
        const lockoutUntil = Date.now() + 60 * 1000;
        localStorage.setItem(LOCKOUT_KEY, lockoutUntil.toString());
        setLockoutSeconds(60);
      }
      setAuthError('الرمز غلط');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await adminLogout();
    setPasscode('');
    setAuthError('');
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setNewImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess(false);

    if (!newNameAr.trim() || !newNameEn.trim()) {
      setAddError('يرجى كتابة اسم المنتج باللغتين العربية والإنجليزية');
      return;
    }

    // Check Firebase Auth currentUser before saving
    if (isFirebaseLiveMode() && !getCurrentAuthUser()) {
      setAddError('سجّل الدخول من جديد');
      return;
    }

    setIsAdding(true);
    try {
      let base64Url = '';
      if (newImageFile) {
        // Compress client-side to canvas max 500px, quality 0.7, <150KB
        base64Url = await compressImageToBase64(newImageFile);
      }

      await addProduct({
        store: newStore,
        nameAr: newNameAr,
        nameEn: newNameEn,
        price: newPrice,
        imageUrl: base64Url,
      });

      // Reset form
      setNewNameAr('');
      setNewNameEn('');
      setNewPrice('');
      setNewImageFile(null);
      setImagePreview('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 2000);
    } catch (err: any) {
      console.error('Error adding product:', err);
      setAddError(formatErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('حذف هذا المنتج؟')) {
      if (isFirebaseLiveMode() && !getCurrentAuthUser()) {
        alert('سجّل الدخول من جديد');
        return;
      }
      try {
        await deleteProduct(id);
      } catch (err: any) {
        alert(formatErrorMessage(err));
      }
    }
  };

  const handleInlineUpdate = async (
    id: string,
    field: 'nameAr' | 'nameEn' | 'price',
    value: string
  ) => {
    if (isFirebaseLiveMode() && !getCurrentAuthUser()) {
      alert('سجّل الدخول من جديد');
      return;
    }
    try {
      await updateProduct(id, { [field]: value });
    } catch (err: any) {
      alert(formatErrorMessage(err));
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError('');
    setSettingsSuccess(false);

    if (isFirebaseLiveMode() && !getCurrentAuthUser()) {
      setSettingsError('سجّل الدخول من جديد');
      return;
    }

    setIsSavingSettings(true);
    try {
      await updateSettings({
        banner: bannerText.trim(),
        menPhone: menPhone.trim(),
        womenPhone: womenPhone.trim(),
      });
      setSettingsSuccess(true);
      setTimeout(() => setSettingsSuccess(false), 2000);
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setSettingsError(formatErrorMessage(err));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus('');

    if (!newAdminPassword || newAdminPassword.length < 6) {
      setPasswordStatus('الرمز السري الجديد يجب أن لا يقل عن 6 أحرف');
      return;
    }
    try {
      await adminChangePassword(newAdminPassword);
      setNewAdminPassword('');
      setPasswordStatus('تم تحديث الرمز بنجاح ✓');
      setTimeout(() => setPasswordStatus(''), 3000);
    } catch (err: any) {
      setPasswordStatus(formatErrorMessage(err));
    }
  };

  const filteredProducts = products.filter((p) => p.store === activeTab);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] text-[var(--ink)] overflow-hidden font-body animate-in fade-in duration-200 max-w-full w-full"
    >
      {/* Top Header - buttons wrap and space cleanly on small devices */}
      <header className="flex flex-wrap items-center justify-between px-3 sm:px-4 py-2.5 bg-[var(--card)] border-b border-[var(--line)] safe-top gap-2 max-w-full shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[var(--red)]/10 text-[var(--red)] flex items-center justify-center font-bold shrink-0">
            H
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm sm:text-base leading-tight truncate">لوحة تحكم حمدر</h2>
            <p className="text-[11px] text-[var(--muted)] truncate">إدارة المتجر</p>
          </div>
        </div>

        {/* Global Action Buttons (flex-wrap: wrap, gap: 8px) */}
        <div className="flex flex-wrap items-center gap-2">
          {user && (
            <button
              onClick={handleLogout}
              className="touch-btn px-2.5 sm:px-3 py-1.5 rounded-lg border border-red-500/20 text-red-600 hover:bg-red-500/10 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="touch-btn px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--card)] text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
            aria-label="إغلاق لوحة التحكم"
          >
            <X className="w-4 h-4" />
            <span>إغلاق</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      {!user ? (
        // Single Passcode Login View
        <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center max-w-full">
          <div className="w-full max-w-sm bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sm:p-7 shadow-sm">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--red)]/10 text-[var(--red)] mb-2.5">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold">دخول الإدارة</h3>
              <p className="text-xs text-[var(--muted)] mt-1">
                أدخل الرمز السري للمتابعة
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 text-center font-bold text-sm animate-shake"
              >
                {authError}
              </div>
            )}

            {lockoutSeconds > 0 && (
              <div
                role="alert"
                className="mb-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 text-center text-xs font-bold flex flex-col items-center gap-1"
              >
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>تم قفل النموذج مؤقتاً بسبب 5 محاولات خاطئة.</span>
                <span>يرجى الانتظار {lockoutSeconds} ثانية.</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1.5 text-[var(--ink)]">
                  الرمز السري
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={lockoutSeconds > 0}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[var(--red)] pl-10 disabled:opacity-50"
                    placeholder="••••••••"
                    style={{ fontSize: '16px' }}
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={lockoutSeconds > 0}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] p-1 disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading || lockoutSeconds > 0}
                className="touch-btn w-full mt-2 rounded-xl bg-[var(--red)] hover:bg-[#a51217] text-white font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer text-sm"
              >
                {authLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري التحقق…
                  </span>
                ) : lockoutSeconds > 0 ? (
                  `يرجى الانتظار (${lockoutSeconds} ثانية)`
                ) : (
                  'دخول'
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        // Authenticated Admin Dashboard
        <div className="flex-1 flex flex-col overflow-hidden max-w-full">
          {/* Navigation Tabs (each tab is flex: 1 with min-width: 0 so nothing is cut off on 375px) */}
          <div className="flex w-full border-b border-[var(--line)] bg-[var(--card)] p-1 gap-1 shrink-0">
            <button
              onClick={() => setActiveTab('men')}
              className={`touch-btn flex-1 min-w-0 py-2 px-1 text-center font-bold text-xs sm:text-sm rounded-lg transition-all cursor-pointer truncate ${
                activeTab === 'men'
                  ? 'bg-[var(--red)] text-white shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)] bg-transparent'
              }`}
            >
              <span className="truncate">رجالي ({products.filter((p) => p.store === 'men').length})</span>
            </button>

            <button
              onClick={() => setActiveTab('women')}
              className={`touch-btn flex-1 min-w-0 py-2 px-1 text-center font-bold text-xs sm:text-sm rounded-lg transition-all cursor-pointer truncate ${
                activeTab === 'women'
                  ? 'bg-[var(--gold)] text-black shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)] bg-transparent'
              }`}
            >
              <span className="truncate">نسائي ({products.filter((p) => p.store === 'women').length})</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`touch-btn flex-1 min-w-0 py-2 px-1 text-center font-bold text-xs sm:text-sm rounded-lg transition-all cursor-pointer truncate ${
                activeTab === 'settings'
                  ? 'bg-[var(--ink)] text-[var(--bg)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)] bg-transparent'
              }`}
            >
              <span className="truncate">إعدادات</span>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-5 pb-24 max-w-full">
            {activeTab === 'men' || activeTab === 'women' ? (
              <div className="max-w-4xl mx-auto space-y-6 w-full">
                {/* Add Product Form Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 shadow-sm max-w-full">
                  <h3 className="font-bold text-sm sm:text-base mb-1 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--red)] shrink-0"></span>
                    <span>إضافة منتج جديد ({activeTab === 'men' ? 'حمدر رجالي' : 'حمدر نسائي'})</span>
                  </h3>
                  <p className="text-xs text-[var(--muted)] mb-4">
                    يتم ضغط الصورة تلقائياً في المتصفح إلى أقل من 150KB لحفظ فوري وسريع.
                  </p>

                  <form onSubmit={handleAddProduct} className="space-y-4 max-w-full">
                    {/* Photo Picker */}
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-[var(--ink)]">
                        صورة المنتج (اختياري)
                      </label>
                      <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 max-w-full">
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="w-32 h-32 rounded-xl border-2 border-dashed border-[var(--line)] hover:border-[var(--red)] transition-colors flex flex-col items-center justify-center cursor-pointer bg-[var(--bg)] relative overflow-hidden group shrink-0"
                        >
                          {imagePreview ? (
                            <img
                              src={imagePreview}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center text-center p-2 text-[var(--muted)] group-hover:text-[var(--red)]">
                              <Upload className="w-5 h-5 mb-1" />
                              <span className="text-xs font-semibold">اختيار صورة</span>
                              <span className="text-[10px] text-[var(--muted)]">كاميرا / معرض</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 text-xs text-[var(--muted)] space-y-1.5 min-w-0">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageSelect}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="touch-btn px-3.5 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--card)] hover:bg-[var(--bg)] font-semibold text-xs text-[var(--ink)] flex items-center gap-2 cursor-pointer"
                          >
                            <ImageIcon className="w-4 h-4 text-[var(--red)] shrink-0" />
                            <span>{imagePreview ? 'تغيير الصورة المحددة' : 'فتح المعرض أو الكاميرا'}</span>
                          </button>
                          <p className="text-[11px] leading-relaxed">
                            تُحفظ الصورة كبيانات مشفرة مباشرة في قاعدة البيانات بدون خوادم تخزين وسيطة.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Inputs - minimum 16px font-size to prevent iOS auto-zoom */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-full">
                      <div>
                        <label className="block text-xs font-bold mb-1 text-[var(--ink)]">
                          الاسم بالعربية <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newNameAr}
                          onChange={(e) => setNewNameAr(e.target.value)}
                          placeholder="مثال: جاكيت صوف دافئ"
                          style={{ fontSize: '16px' }}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold mb-1 text-[var(--ink)]">
                          الاسم بالإنجليزية <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          dir="ltr"
                          value={newNameEn}
                          onChange={(e) => setNewNameEn(e.target.value)}
                          placeholder="e.g. Warm Wool Jacket"
                          style={{ fontSize: '16px' }}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)] text-left"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold mb-1 text-[var(--ink)]">
                          السعر بالدولار $ (اختياري)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={newPrice}
                          onChange={(e) => setNewPrice(e.target.value)}
                          placeholder="مثال: 25 أو $25"
                          style={{ fontSize: '16px' }}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)] text-left"
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isAdding}
                        className="touch-btn px-6 py-2.5 rounded-xl bg-[var(--red)] hover:bg-[#a51217] text-white font-bold text-sm transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                      >
                        {isAdding ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>جاري النشر…</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 shrink-0" />
                            <span>إضافة المنتج للقائمة</span>
                          </>
                        )}
                      </button>

                      {/* Success state: show "تم الحفظ ✓" for 2 seconds */}
                      {addSuccess && (
                        <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-lg animate-in fade-in">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>تم الحفظ ✓</span>
                        </div>
                      )}

                      {/* Real error message displayed in Arabic under button */}
                      {addError && (
                        <div
                          role="alert"
                          className="mt-2.5 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 text-xs font-bold flex items-center gap-2 animate-shake"
                        >
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{addError}</span>
                        </div>
                      )}
                    </div>
                  </form>
                </section>

                {/* Product List Section */}
                <section className="space-y-3 max-w-full">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-bold text-sm sm:text-base text-[var(--ink)]">
                      قائمة المنتجات الحالية ({filteredProducts.length})
                    </h3>
                    <span className="text-[11px] text-[var(--muted)]">
                      التعديلات تحفظ فورياً
                    </span>
                  </div>

                  {filteredProducts.length === 0 ? (
                    <div className="text-center py-10 bg-[var(--card)] border border-[var(--line)] rounded-2xl text-[var(--muted)] text-xs sm:text-sm">
                      لا توجد منتجات في هذا القسم حالياً. استخدم النموذج أعلاه للإضافة.
                    </div>
                  ) : (
                    <div className="space-y-2 max-w-full">
                      {filteredProducts.map((prod) => (
                        <div
                          key={prod.id}
                          className="bg-[var(--card)] border border-[var(--line)] rounded-xl p-2.5 sm:p-3 flex flex-col sm:flex-row items-center gap-2.5 shadow-xs hover:border-[var(--muted)] transition-colors max-w-full"
                        >
                          {/* Thumbnail */}
                          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden shrink-0 border border-[var(--line)] bg-[var(--bg)] relative">
                            {prod.imageUrl ? (
                              <img
                                src={prod.imageUrl}
                                alt={prod.nameAr}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full diagonal-placeholder flex items-center justify-center text-[10px] text-[var(--muted)] font-mono">
                                بدون صورة
                              </div>
                            )}
                          </div>

                          {/* Editable fields */}
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full min-w-0">
                            <div>
                              <span className="block text-[10px] text-[var(--muted)] font-medium">
                                الاسم بالعربية
                              </span>
                              <input
                                type="text"
                                defaultValue={prod.nameAr}
                                style={{ fontSize: '16px' }}
                                onBlur={(e) => {
                                  if (e.target.value !== prod.nameAr) {
                                    handleInlineUpdate(prod.id, 'nameAr', e.target.value);
                                  }
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)]"
                              />
                            </div>

                            <div>
                              <span className="block text-[10px] text-[var(--muted)] font-medium">
                                الاسم بالإنجليزية
                              </span>
                              <input
                                type="text"
                                dir="ltr"
                                defaultValue={prod.nameEn}
                                style={{ fontSize: '16px' }}
                                onBlur={(e) => {
                                  if (e.target.value !== prod.nameEn) {
                                    handleInlineUpdate(prod.id, 'nameEn', e.target.value);
                                  }
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)] text-left"
                              />
                            </div>

                            <div>
                              <span className="block text-[10px] text-[var(--muted)] font-medium">
                                السعر ($)
                              </span>
                              <input
                                type="text"
                                dir="ltr"
                                defaultValue={prod.price || ''}
                                style={{ fontSize: '16px' }}
                                onBlur={(e) => {
                                  if (e.target.value !== (prod.price || '')) {
                                    handleInlineUpdate(prod.id, 'price', e.target.value);
                                  }
                                }}
                                placeholder="اختياري"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)] text-left"
                              />
                            </div>
                          </div>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(prod.id)}
                            title="حذف المنتج"
                            className="touch-btn w-9 h-9 rounded-lg text-red-600 hover:bg-red-500/10 flex items-center justify-center shrink-0 transition-colors cursor-pointer self-end sm:self-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              // Settings Tab
              <div className="max-w-2xl mx-auto space-y-6 w-full">
                {/* General Settings Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 shadow-sm max-w-full">
                  <h3 className="font-bold text-base mb-1 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-[var(--red)] shrink-0" />
                    <span>بيانات وشريط الإعلانات</span>
                  </h3>
                  <p className="text-xs text-[var(--muted)] mb-4">
                    التحكم في نص الإعلان الأحمر وأرقام التواصل الرسمية
                  </p>

                  <form onSubmit={handleSaveSettings} className="space-y-4 max-w-full">
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        نص الشريط الإعلاني (أعلى الموقع)
                      </label>
                      <input
                        type="text"
                        value={bannerText}
                        onChange={(e) => setBannerText(e.target.value)}
                        placeholder="اتركه فاضي ليختفي"
                        style={{ fontSize: '16px' }}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)]"
                      />
                      <span className="text-[11px] text-[var(--muted)] mt-1 block">
                        اتركه فاضي ليختفي تلقائياً من الصفحة.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-full">
                      <div>
                        <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[var(--red)] shrink-0" />
                          <span>رقم حمدر رجالي</span>
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={menPhone}
                          onChange={(e) => setMenPhone(e.target.value)}
                          style={{ fontSize: '16px' }}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-left focus:outline-none focus:border-[var(--red)] font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[var(--gold)] shrink-0" />
                          <span>رقم حمدر نسائي</span>
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={womenPhone}
                          onChange={(e) => setWomenPhone(e.target.value)}
                          style={{ fontSize: '16px' }}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-left focus:outline-none focus:border-[var(--red)] font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <button
                        type="submit"
                        disabled={isSavingSettings}
                        className="touch-btn px-6 py-2.5 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-bold text-sm hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isSavingSettings ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                            <span>جاري الحفظ…</span>
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 shrink-0" />
                            <span>حفظ إعدادات الموقع</span>
                          </>
                        )}
                      </button>

                      {settingsSuccess && (
                        <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-lg animate-in fade-in">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>تم الحفظ ✓</span>
                        </div>
                      )}

                      {settingsError && (
                        <div
                          role="alert"
                          className="mt-2.5 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 text-xs font-bold flex items-center gap-2 animate-shake"
                        >
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{settingsError}</span>
                        </div>
                      )}
                    </div>
                  </form>
                </section>

                {/* Change Password Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 shadow-sm max-w-full">
                  <h3 className="font-bold text-base mb-1 flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[var(--gold)] shrink-0" />
                    <span>تغيير الرمز السري</span>
                  </h3>
                  <p className="text-xs text-[var(--muted)] mb-3">
                    تغيير رمز الدخول الخاص بالمسؤول
                  </p>

                  {passwordStatus && (
                    <div
                      className={`p-2.5 rounded-xl text-xs font-semibold mb-3 ${
                        passwordStatus.includes('بنجاح')
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-red-500/10 text-red-600'
                      }`}
                    >
                      {passwordStatus}
                    </div>
                  )}

                  <form onSubmit={handleChangePassword} className="space-y-3 max-w-full">
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        الرمز السري الجديد
                      </label>
                      <input
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        placeholder="أدخل 6 أحرف أو أرقام على الأقل"
                        style={{ fontSize: '16px' }}
                        className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)]"
                      />
                    </div>

                    <button
                      type="submit"
                      className="touch-btn px-5 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--card)] font-bold text-xs transition-colors cursor-pointer"
                    >
                      تحديث الرمز السري
                    </button>
                  </form>
                </section>

                {/* Database Connection Status Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 shadow-sm max-w-full">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-xs sm:text-sm flex items-center gap-2">
                      <Database className="w-4 h-4 text-[var(--red)] shrink-0" />
                      <span>حالة الاتصال</span>
                    </h3>
                    {isFirebaseLiveMode() ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-bold text-[11px]">
                        ● متصل بـ Firebase
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-bold text-[11px]">
                        ● وضع التجربة
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                    تم إيقاف خدمة التخزين السحابي Firebase Storage بالكامل لتجنب التعليق. الصور تحفظ مباشرة داخل قاعدة البيانات بعد ضغطها إلى أقل من 150KB.
                  </p>
                </section>

                {/* Logout Button */}
                <div className="pt-1 text-center">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="touch-btn px-5 py-2 rounded-xl border border-red-500/20 text-red-600 hover:bg-red-500/10 text-xs font-bold transition-colors inline-flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>تسجيل الخروج من لوحة التحكم</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Bar (never wider than 100vw, flex-wrap, safe bottom) */}
          <footer className="sticky bottom-0 bg-[var(--card)] border-t border-[var(--line)] px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 safe-bottom max-w-full shrink-0">
            <button
              onClick={handleLogout}
              className="touch-btn px-2.5 py-1 rounded-lg border border-red-500/20 text-red-600 hover:bg-red-500/10 text-xs font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
            <button
              onClick={onClose}
              className="touch-btn px-4 py-1.5 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer"
            >
              إغلاق والعودة للمتجر
            </button>
          </footer>
        </div>
      )}
    </div>
  );
};
