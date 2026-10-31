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
  Edit3,
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
  const addFileInputRef = useRef<HTMLInputElement>(null);

  // Edit product modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editNameAr, setEditNameAr] = useState('');
  const [editNameEn, setEditNameEn] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState(false);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Settings form
  const [bannerText, setBannerText] = useState(settings.banner);
  const [menPhone, setMenPhone] = useState(settings.menPhone);
  const [womenPhone, setWomenPhone] = useState(settings.womenPhone);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState('');

  // Lock body when admin panel is open, restore on close
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('admin-open');
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const originalWidth = document.body.style.width;
      const originalInset = document.body.style.top;

      document.body.style.position = 'fixed';
      document.body.style.inset = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.classList.remove('admin-open');
        document.body.style.position = originalPosition;
        document.body.style.inset = originalInset;
        document.body.style.width = originalWidth;
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Lockout timer ticker
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
    setEditingProduct(null);
  };

  const handleAddImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

    // Only Arabic name is required
    if (!newNameAr.trim()) {
      setAddError('يرجى إدخال اسم المنتج بالعربية');
      return;
    }

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
        nameEn: newNameEn.trim() || newNameAr.trim(),
        price: newPrice,
        imageUrl: base64Url,
      });

      // Reset form
      setNewNameAr('');
      setNewNameEn('');
      setNewPrice('');
      setNewImageFile(null);
      setImagePreview('');
      if (addFileInputRef.current) addFileInputRef.current.value = '';

      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 2000);
    } catch (err: any) {
      console.error('Error adding product:', err);
      setAddError(formatErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  };

  // Open Edit Product Modal for tapped row
  const openEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setEditNameAr(prod.nameAr);
    setEditNameEn(prod.nameEn || prod.nameAr);
    setEditPrice(prod.price || '');
    setEditImageUrl(prod.imageUrl || '');
    setEditError('');
    setEditSuccess(false);
  };

  const handleEditImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        const file = e.target.files[0];
        const compressedBase64 = await compressImageToBase64(file);
        setEditImageUrl(compressedBase64);
      } catch (err: any) {
        setEditError('تعذر معالجة الصورة: ' + err.message);
      }
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setEditError('');
    setEditSuccess(false);

    if (!editNameAr.trim()) {
      setEditError('يرجى إدخال اسم المنتج بالعربية');
      return;
    }

    if (isFirebaseLiveMode() && !getCurrentAuthUser()) {
      setEditError('سجّل الدخول من جديد');
      return;
    }

    setIsUpdating(true);
    try {
      await updateProduct(editingProduct.id, {
        nameAr: editNameAr.trim(),
        nameEn: editNameEn.trim() || editNameAr.trim(),
        price: editPrice.trim(),
        imageUrl: editImageUrl,
      });

      setEditSuccess(true);
      setTimeout(() => {
        setEditSuccess(false);
        setEditingProduct(null);
      }, 1500);
    } catch (err: any) {
      console.error('Error updating product:', err);
      setEditError(formatErrorMessage(err));
    } finally {
      setIsUpdating(false);
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
        if (editingProduct?.id === id) {
          setEditingProduct(null);
        }
      } catch (err: any) {
        alert(formatErrorMessage(err));
      }
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
      className="admin-overlay-container z-50 flex flex-col bg-[var(--bg)] text-[var(--ink)] font-body"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        maxWidth: '100vw',
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehaviorX: 'none',
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Top Header - flex-wrap and gap: 8px to prevent overflow on iPhone Safari */}
      <header className="flex flex-wrap items-center justify-between px-3 py-2.5 bg-[var(--card)] border-b border-[var(--line)] safe-top gap-2 w-full max-w-full shrink-0 box-border">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[var(--red)]/10 text-[var(--red)] flex items-center justify-center font-bold shrink-0">
            H
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-sm sm:text-base leading-tight truncate">لوحة تحكم حمدر</h2>
            <p className="text-[11px] text-[var(--muted)] truncate">إدارة المتجر</p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {user && (
            <button
              onClick={handleLogout}
              className="touch-btn px-2.5 py-1.5 rounded-lg border border-red-500/20 text-red-600 hover:bg-red-500/10 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
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
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 flex items-center justify-center w-full max-w-full box-border">
          <div className="w-full max-w-sm bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sm:p-7 shadow-sm box-border overflow-hidden">
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
                className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 text-center font-bold text-sm"
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

            <form onSubmit={handleLogin} className="space-y-4 w-full box-border">
              <div className="w-full box-border">
                <label className="block text-xs font-bold mb-1.5 text-[var(--ink)]">
                  الرمز السري
                </label>
                <div className="relative w-full box-border">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={lockoutSeconds > 0}
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full box-border px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] focus:outline-none focus:border-[var(--red)] pl-10 disabled:opacity-50"
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
        <div className="flex-1 flex flex-col overflow-hidden w-full max-w-full box-border">
          {/* Navigation Tabs (3 equal tabs, flex: 1, min-width: 0, fits 375px screens) */}
          <div className="flex w-full max-w-full border-b border-[var(--line)] bg-[var(--card)] p-1 gap-1 shrink-0 box-border">
            <button
              onClick={() => setActiveTab('men')}
              className={`touch-btn flex-1 min-w-0 py-2 px-1 text-center font-bold text-xs rounded-lg transition-all cursor-pointer truncate box-border ${
                activeTab === 'men'
                  ? 'bg-[var(--red)] text-white shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)] bg-transparent'
              }`}
            >
              <span className="truncate">رجالي ({products.filter((p) => p.store === 'men').length})</span>
            </button>

            <button
              onClick={() => setActiveTab('women')}
              className={`touch-btn flex-1 min-w-0 py-2 px-1 text-center font-bold text-xs rounded-lg transition-all cursor-pointer truncate box-border ${
                activeTab === 'women'
                  ? 'bg-[var(--gold)] text-black shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)] bg-transparent'
              }`}
            >
              <span className="truncate">نسائي ({products.filter((p) => p.store === 'women').length})</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`touch-btn flex-1 min-w-0 py-2 px-1 text-center font-bold text-xs rounded-lg transition-all cursor-pointer truncate box-border ${
                activeTab === 'settings'
                  ? 'bg-[var(--ink)] text-[var(--bg)] shadow-xs'
                  : 'text-[var(--muted)] hover:text-[var(--ink)] bg-transparent'
              }`}
            >
              <span className="truncate">إعدادات</span>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 pb-24 w-full max-w-full box-border">
            {activeTab === 'men' || activeTab === 'women' ? (
              <div className="max-w-4xl mx-auto space-y-6 w-full max-w-full box-border">
                {/* Add Product Form Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 shadow-sm w-full max-w-full box-border overflow-hidden">
                  <h3 className="font-bold text-sm sm:text-base mb-1 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--red)] shrink-0"></span>
                    <span>إضافة منتج جديد ({activeTab === 'men' ? 'حمدر رجالي' : 'حمدر نسائي'})</span>
                  </h3>
                  <p className="text-xs text-[var(--muted)] mb-4">
                    أدخل بيانات المنتج (الصورة والاسم الإنجليزي والسعر اختيارية).
                  </p>

                  <form onSubmit={handleAddProduct} className="space-y-4 w-full max-w-full box-border">
                    {/* Photo Picker */}
                    <div className="w-full box-border">
                      <label className="block text-xs font-bold mb-1.5 text-[var(--ink)]">
                        صورة المنتج (اختياري)
                      </label>
                      <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-full overflow-hidden box-border">
                        <div
                          onClick={() => addFileInputRef.current?.click()}
                          className="w-28 h-28 max-w-full rounded-xl border-2 border-dashed border-[var(--line)] hover:border-[var(--red)] transition-colors flex flex-col items-center justify-center cursor-pointer bg-[var(--bg)] relative overflow-hidden group shrink-0 box-border"
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
                              <span className="text-[11px] font-semibold">اختيار صورة</span>
                              <span className="text-[9px] text-[var(--muted)]">كاميرا / معرض</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 text-xs text-[var(--muted)] space-y-1.5 min-w-0 w-full box-border">
                          <input
                            ref={addFileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAddImageSelect}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => addFileInputRef.current?.click()}
                            className="touch-btn px-3.5 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--card)] hover:bg-[var(--bg)] font-semibold text-xs text-[var(--ink)] flex items-center gap-2 cursor-pointer max-w-full"
                          >
                            <ImageIcon className="w-4 h-4 text-[var(--red)] shrink-0" />
                            <span className="truncate">{imagePreview ? 'تغيير الصورة المحددة' : 'فتح المعرض أو الكاميرا'}</span>
                          </button>
                          <p className="text-[11px] leading-relaxed">
                            يتم ضغط الصورة في المتصفح إلى أقل من 150KB وتُحفظ فوراً.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Inputs - minimum 16px font-size to prevent iOS auto-zoom */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-full box-border">
                      <div className="w-full min-w-0 box-border">
                        <label className="block text-xs font-bold mb-1 text-[var(--ink)]">
                          الاسم بالعربية <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newNameAr}
                          onChange={(e) => {
                            setNewNameAr(e.target.value);
                            if (addError) setAddError('');
                          }}
                          placeholder="مثال: جاكيت صوف دافئ"
                          style={{ fontSize: '16px' }}
                          className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)]"
                        />
                      </div>

                      <div className="w-full min-w-0 box-border">
                        <label className="block text-xs font-bold mb-1 text-[var(--ink)]">
                          الاسم بالإنجليزية (اختياري)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={newNameEn}
                          onChange={(e) => setNewNameEn(e.target.value)}
                          placeholder="اختياري - يترك فارغاً للتكرار"
                          style={{ fontSize: '16px' }}
                          className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)] text-left"
                        />
                      </div>

                      <div className="w-full min-w-0 box-border">
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
                          className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)] text-left"
                        />
                      </div>
                    </div>

                    <div className="pt-2 w-full box-border">
                      <button
                        type="submit"
                        disabled={isAdding}
                        className="touch-btn px-6 py-2.5 rounded-xl bg-[var(--red)] hover:bg-[#a51217] text-white font-bold text-sm transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 cursor-pointer max-w-full"
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
                        <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-lg">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>تم الحفظ ✓</span>
                        </div>
                      )}

                      {/* Real error message displayed in Arabic under button */}
                      {addError && (
                        <div
                          role="alert"
                          className="mt-2.5 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 text-xs font-bold flex items-center gap-2"
                        >
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{addError}</span>
                        </div>
                      )}
                    </div>
                  </form>
                </section>

                {/* Product List Section (Tappable rows to edit / delete) */}
                <section className="space-y-3 w-full max-w-full box-border">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-bold text-sm sm:text-base text-[var(--ink)]">
                      قائمة المنتجات الحالية ({filteredProducts.length})
                    </h3>
                    <span className="text-[11px] text-[var(--muted)]">
                      اضغط على أي منتج لتعديله
                    </span>
                  </div>

                  {filteredProducts.length === 0 ? (
                    <div className="text-center py-10 bg-[var(--card)] border border-[var(--line)] rounded-2xl text-[var(--muted)] text-xs sm:text-sm box-border">
                      لا توجد منتجات في هذا القسم حالياً. استخدم النموذج أعلاه للإضافة.
                    </div>
                  ) : (
                    <div className="space-y-2.5 w-full max-w-full box-border">
                      {filteredProducts.map((prod) => (
                        <div
                          key={prod.id}
                          onClick={() => openEditModal(prod)}
                          className="bg-[var(--card)] border border-[var(--line)] rounded-xl p-3 flex items-center justify-between gap-2.5 shadow-xs hover:border-[var(--red)] transition-all cursor-pointer w-full max-w-full box-border overflow-hidden"
                        >
                          {/* Thumbnail */}
                          <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-[var(--line)] bg-[var(--bg)] relative box-border">
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

                          {/* Product Info */}
                          <div className="flex-1 min-w-0 box-border">
                            <h4 className="font-bold text-sm text-[var(--ink)] truncate">
                              {prod.nameAr}
                            </h4>
                            <p className="text-xs text-[var(--muted)] truncate" dir="ltr">
                              {prod.nameEn || prod.nameAr}
                            </p>
                            {prod.price && (
                              <span className="text-xs font-bold text-[var(--gold)]">
                                ${prod.price.replace('$', '')}
                              </span>
                            )}
                          </div>

                          {/* Action Cue */}
                          <div className="flex items-center gap-1.5 shrink-0 text-xs text-[var(--muted)]">
                            <span className="hidden sm:inline text-[11px]">تعديل</span>
                            <Edit3 className="w-4 h-4 text-[var(--red)]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : (
              // Settings Tab
              <div className="max-w-2xl mx-auto space-y-6 w-full max-w-full box-border">
                {/* General Settings Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 shadow-sm w-full max-w-full box-border overflow-hidden">
                  <h3 className="font-bold text-base mb-1 flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-[var(--red)] shrink-0" />
                    <span>بيانات وشريط الإعلانات</span>
                  </h3>
                  <p className="text-xs text-[var(--muted)] mb-4">
                    التحكم في نص الإعلان الأحمر وأرقام التواصل الرسمية
                  </p>

                  <form onSubmit={handleSaveSettings} className="space-y-4 w-full max-w-full box-border">
                    <div className="w-full box-border">
                      <label className="block text-xs font-bold mb-1">
                        نص الشريط الإعلاني (أعلى الموقع)
                      </label>
                      <input
                        type="text"
                        value={bannerText}
                        onChange={(e) => setBannerText(e.target.value)}
                        placeholder="اتركه فاضي ليختفي"
                        style={{ fontSize: '16px' }}
                        className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)]"
                      />
                      <span className="text-[11px] text-[var(--muted)] mt-1 block">
                        اتركه فاضي ليختفي تلقائياً من الصفحة.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-full box-border">
                      <div className="w-full min-w-0 box-border">
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
                          className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-left focus:outline-none focus:border-[var(--red)] font-mono"
                        />
                      </div>

                      <div className="w-full min-w-0 box-border">
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
                          className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-left focus:outline-none focus:border-[var(--red)] font-mono"
                        />
                      </div>
                    </div>

                    <div className="w-full box-border">
                      <button
                        type="submit"
                        disabled={isSavingSettings}
                        className="touch-btn px-6 py-2.5 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-bold text-sm hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer disabled:opacity-50 max-w-full"
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
                        <div className="mt-2.5 inline-flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-500/10 px-3 py-1.5 rounded-lg">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>تم الحفظ ✓</span>
                        </div>
                      )}

                      {settingsError && (
                        <div
                          role="alert"
                          className="mt-2.5 p-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 text-xs font-bold flex items-center gap-2"
                        >
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{settingsError}</span>
                        </div>
                      )}
                    </div>
                  </form>
                </section>

                {/* Change Password Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 shadow-sm w-full max-w-full box-border overflow-hidden">
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

                  <form onSubmit={handleChangePassword} className="space-y-3 w-full max-w-full box-border">
                    <div className="w-full box-border">
                      <label className="block text-xs font-bold mb-1">
                        الرمز السري الجديد
                      </label>
                      <input
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        placeholder="أدخل 6 أحرف أو أرقام على الأقل"
                        style={{ fontSize: '16px' }}
                        className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)]"
                      />
                    </div>

                    <button
                      type="submit"
                      className="touch-btn px-5 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--card)] font-bold text-xs transition-colors cursor-pointer max-w-full"
                    >
                      تحديث الرمز السري
                    </button>
                  </form>
                </section>

                {/* Database Connection Status Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-5 shadow-sm w-full max-w-full box-border overflow-hidden">
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
                    قواعد الأمان مفعلة: القراءة متاحة للجميع، والكتابة محصورة بمدير المتجر المعتمد (admin@hamdar-site.app).
                  </p>
                </section>

                {/* Logout Button */}
                <div className="pt-1 text-center w-full box-border">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="touch-btn px-5 py-2 rounded-xl border border-red-500/20 text-red-600 hover:bg-red-500/10 text-xs font-bold transition-colors inline-flex items-center gap-2 cursor-pointer max-w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>تسجيل الخروج من لوحة التحكم</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Bar */}
          <footer className="sticky bottom-0 bg-[var(--card)] border-t border-[var(--line)] px-3 py-2 flex flex-wrap items-center justify-between gap-2 safe-bottom w-full max-w-full shrink-0 box-border">
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

      {/* Edit Product Modal (Tapping any product opens this editor) */}
      {editingProduct && (
        <div
          dir="rtl"
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto w-full max-w-full box-border"
        >
          <div className="w-full max-w-lg bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-6 shadow-xl my-auto box-border overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--line)] w-full box-border">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[var(--red)]" />
                <span>تعديل المنتج</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-1 rounded-lg hover:bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 w-full box-border">
              {/* Photo preview and replace button */}
              <div className="w-full box-border">
                <label className="block text-xs font-bold mb-1.5">صورة المنتج</label>
                <div className="flex items-center gap-3 w-full box-border">
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--bg)] shrink-0 relative box-border">
                    {editImageUrl ? (
                      <img
                        src={editImageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full diagonal-placeholder flex items-center justify-center text-[10px] text-[var(--muted)] font-mono">
                        بدون صورة
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 flex-1 min-w-0 box-border">
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleEditImageSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => editFileInputRef.current?.click()}
                      className="touch-btn px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--card)] text-xs font-bold flex items-center gap-1.5 cursor-pointer max-w-full"
                    >
                      <Upload className="w-3.5 h-3.5 text-[var(--red)]" />
                      <span className="truncate">استبدال الصورة</span>
                    </button>
                    {editImageUrl && (
                      <button
                        type="button"
                        onClick={() => setEditImageUrl('')}
                        className="text-[11px] text-red-500 hover:underline block cursor-pointer"
                      >
                        حذف الصورة الحالية
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Editable Name Ar */}
              <div className="w-full box-border">
                <label className="block text-xs font-bold mb-1">
                  الاسم بالعربية <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editNameAr}
                  onChange={(e) => setEditNameAr(e.target.value)}
                  style={{ fontSize: '16px' }}
                  className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)]"
                />
              </div>

              {/* Editable Name En */}
              <div className="w-full box-border">
                <label className="block text-xs font-bold mb-1">
                  الاسم بالإنجليزية (اختياري)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editNameEn}
                  onChange={(e) => setEditNameEn(e.target.value)}
                  style={{ fontSize: '16px' }}
                  className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)] text-left"
                />
              </div>

              {/* Editable Price */}
              <div className="w-full box-border">
                <label className="block text-xs font-bold mb-1">السعر ($)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="مثال: 25 أو $25"
                  style={{ fontSize: '16px' }}
                  className="w-full box-border px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] focus:outline-none focus:border-[var(--red)] text-left"
                />
              </div>

              {/* Actions & Feedback */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] w-full box-border">
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="touch-btn px-5 py-2 rounded-xl bg-[var(--red)] hover:bg-[#a51217] text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isUpdating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري الحفظ…</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>حفظ التعديلات</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(editingProduct.id)}
                    className="touch-btn px-3 py-2 rounded-xl border border-red-500/20 text-red-600 hover:bg-red-500/10 font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="touch-btn px-4 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--card)] font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
              </div>

              {editSuccess && (
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>تم الحفظ ✓</span>
                </div>
              )}

              {editError && (
                <div
                  role="alert"
                  className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-600 text-xs font-bold flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
