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
  uploadProductImage,
  isFirebaseLiveMode,
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

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  user,
}) => {
  const [activeTab, setActiveTab] = useState<StoreType | 'settings'>('men');
  const [statusMsg, setStatusMsg] = useState<'idle' | 'saving' | 'saved'>('idle');

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings form
  const [bannerText, setBannerText] = useState(settings.banner);
  const [menPhone, setMenPhone] = useState(settings.menPhone);
  const [womenPhone, setWomenPhone] = useState(settings.womenPhone);
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');

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

  // Keep settings in sync when props change
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

  const showStatus = (state: 'saving' | 'saved') => {
    setStatusMsg(state);
    if (state === 'saved') {
      setTimeout(() => setStatusMsg('idle'), 2500);
    }
  };

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
      // Record failed attempts
      const currentAttempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0', 10) + 1;
      localStorage.setItem(ATTEMPTS_KEY, currentAttempts.toString());

      if (currentAttempts >= 5) {
        const lockoutUntil = Date.now() + 60 * 1000;
        localStorage.setItem(LOCKOUT_KEY, lockoutUntil.toString());
        setLockoutSeconds(60);
        setAuthError('الرمز غلط');
      } else {
        setAuthError('الرمز غلط');
      }
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
    if (!newNameAr.trim() || !newNameEn.trim()) {
      alert('يرجى كتابة اسم المنتج باللغتين العربية والإنجليزية');
      return;
    }

    setIsAdding(true);
    showStatus('saving');
    try {
      let uploadedUrl = '';
      if (newImageFile) {
        uploadedUrl = await uploadProductImage(newImageFile);
      }

      await addProduct({
        store: newStore,
        nameAr: newNameAr,
        nameEn: newNameEn,
        price: newPrice,
        imageUrl: uploadedUrl,
      });

      setNewNameAr('');
      setNewNameEn('');
      setNewPrice('');
      setNewImageFile(null);
      setImagePreview('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      showStatus('saved');
    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ أثناء إضافة المنتج: ' + (err.message || ''));
      setStatusMsg('idle');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (window.confirm('حذف هذا المنتج؟')) {
      showStatus('saving');
      try {
        await deleteProduct(id);
        showStatus('saved');
      } catch (err: any) {
        alert('تعذر حذف المنتج: ' + err.message);
        setStatusMsg('idle');
      }
    }
  };

  const handleInlineUpdate = async (
    id: string,
    field: 'nameAr' | 'nameEn' | 'price',
    value: string
  ) => {
    showStatus('saving');
    try {
      await updateProduct(id, { [field]: value });
      showStatus('saved');
    } catch (err: any) {
      alert('تعذر التعديل: ' + err.message);
      setStatusMsg('idle');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    showStatus('saving');
    try {
      await updateSettings({
        banner: bannerText.trim(),
        menPhone: menPhone.trim(),
        womenPhone: womenPhone.trim(),
      });
      showStatus('saved');
    } catch (err: any) {
      alert('تعذر حفظ الإعدادات: ' + err.message);
      setStatusMsg('idle');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminPassword || newAdminPassword.length < 6) {
      setPasswordStatus('كلمة المرور يجب أن لا تقل عن 6 أحرف');
      return;
    }
    showStatus('saving');
    try {
      await adminChangePassword(newAdminPassword);
      setNewAdminPassword('');
      setPasswordStatus('تم تغيير كلمة المرور بنجاح');
      showStatus('saved');
      setTimeout(() => setPasswordStatus(''), 4000);
    } catch (err: any) {
      setPasswordStatus('تعذر تغيير كلمة المرور: ' + (err.message || ''));
      setStatusMsg('idle');
    }
  };

  const filteredProducts = products.filter((p) => p.store === activeTab);

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)] text-[var(--ink)] overflow-hidden font-body animate-in fade-in duration-200"
    >
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-[var(--card)] border-b border-[var(--line)] safe-top">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[var(--red)]/10 text-[var(--red)] flex items-center justify-center font-bold">
            H
          </div>
          <div>
            <h2 className="font-bold text-base leading-tight">لوحة تحكم حمدر</h2>
            <p className="text-xs text-[var(--muted)]">إدارة المنتجات والإعدادات</p>
          </div>
        </div>

        {/* Status Indicator & Global Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {statusMsg === 'saving' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--gold)] font-medium bg-[var(--gold)]/10 px-2.5 py-1 rounded-full animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              جاري النشر…
            </span>
          )}
          {statusMsg === 'saved' && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              تم الحفظ
            </span>
          )}

          {user && (
            <button
              onClick={handleLogout}
              className="touch-btn px-3 py-1.5 rounded-lg border border-red-500/20 text-red-600 hover:bg-red-500/10 text-xs font-bold transition-colors flex items-center gap-1.5"
              aria-label="تسجيل الخروج"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
          )}

          <button
            onClick={onClose}
            className="touch-btn px-3 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--card)] text-sm font-semibold transition-colors flex items-center gap-1.5"
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
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex items-center justify-center">
          <div className="w-full max-w-sm bg-[var(--card)] border border-[var(--line)] rounded-2xl p-6 sm:p-8 shadow-sm">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--red)]/10 text-[var(--red)] mb-3">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold">دخول الإدارة</h3>
              <p className="text-xs text-[var(--muted)] mt-1">
                أدخل الرمز السري للمتابعة
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="mb-5 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 text-center font-bold text-sm animate-shake"
              >
                {authError}
              </div>
            )}

            {lockoutSeconds > 0 && (
              <div
                role="alert"
                className="mb-5 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 text-center text-xs font-bold flex flex-col items-center gap-1"
              >
                <AlertTriangle className="w-5 h-5" />
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] text-sm focus:outline-none focus:border-[var(--red)] pl-10 disabled:opacity-50"
                    placeholder="••••••••"
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
                className="touch-btn w-full mt-2 rounded-xl bg-[var(--red)] hover:bg-[#a51217] text-white font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer"
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Navigation Tabs */}
          <div className="flex border-b border-[var(--line)] bg-[var(--card)] px-4 gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('men')}
              className={`touch-btn px-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'men'
                  ? 'border-[var(--red)] text-[var(--red)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              رجالي (Men)
              <span className="mr-1.5 text-xs px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--line)]">
                {products.filter((p) => p.store === 'men').length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('women')}
              className={`touch-btn px-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'women'
                  ? 'border-[var(--gold)] text-[var(--gold)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              نسائي (Women)
              <span className="mr-1.5 text-xs px-2 py-0.5 rounded-full bg-[var(--bg)] border border-[var(--line)]">
                {products.filter((p) => p.store === 'women').length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`touch-btn px-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                activeTab === 'settings'
                  ? 'border-[var(--ink)] text-[var(--ink)]'
                  : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              إعدادات الموقع
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24">
            {activeTab === 'men' || activeTab === 'women' ? (
              <div className="max-w-4xl mx-auto space-y-8">
                {/* Add Product Form Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-4 sm:p-6 shadow-sm">
                  <h3 className="font-bold text-base sm:text-lg mb-1 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--red)]"></span>
                    إضافة منتج جديد ({activeTab === 'men' ? 'حمدر رجالي' : 'حمدر نسائي'})
                  </h3>
                  <p className="text-xs text-[var(--muted)] mb-5">
                    اختر صورة من الكاميرا أو المعرض (يتم ضغطها تلقائياً إلى 600px لسرعة التصفح)
                  </p>

                  <form onSubmit={handleAddProduct} className="space-y-4">
                    {/* Photo Picker */}
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-[var(--ink)]">
                        صورة المنتج (اختياري)
                      </label>
                      <div className="flex flex-col sm:flex-row items-center gap-4">
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full sm:w-36 h-36 rounded-xl border-2 border-dashed border-[var(--line)] hover:border-[var(--red)] transition-colors flex flex-col items-center justify-center cursor-pointer bg-[var(--bg)] relative overflow-hidden group"
                        >
                          {imagePreview ? (
                            <img
                              src={imagePreview}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center text-center p-3 text-[var(--muted)] group-hover:text-[var(--red)]">
                              <Upload className="w-6 h-6 mb-1" />
                              <span className="text-xs font-semibold">اختيار صورة</span>
                              <span className="text-[10px] text-[var(--muted)] mt-0.5">كاميرا / معرض</span>
                            </div>
                          )}
                        </div>

                        <div className="flex-1 text-xs text-[var(--muted)] space-y-2">
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
                            className="touch-btn px-4 py-2 rounded-xl border border-[var(--line)] bg-[var(--card)] hover:bg-[var(--bg)] font-semibold text-xs text-[var(--ink)] flex items-center gap-2 cursor-pointer"
                          >
                            <ImageIcon className="w-4 h-4 text-[var(--red)]" />
                            {imagePreview ? 'تغيير الصورة المحددة' : 'فتح المعرض أو الكاميرا'}
                          </button>
                          <p>
                            إذا لم تختر صورة، سيتم عرض المنتج بنمط الخطوط المائلة الأنيق تلقائياً.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm focus:outline-none focus:border-[var(--red)]"
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
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm focus:outline-none focus:border-[var(--red)] text-left"
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
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm focus:outline-none focus:border-[var(--red)] text-left"
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
                            <Loader2 className="w-4 h-4 animate-spin" />
                            جاري المعالجة والإضافة…
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            إضافة المنتج للقائمة
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </section>

                {/* Product List Section */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-bold text-base text-[var(--ink)]">
                      قائمة المنتجات الحالية ({filteredProducts.length})
                    </h3>
                    <span className="text-xs text-[var(--muted)]">
                      التعديلات في الحقول تحفظ فورياً
                    </span>
                  </div>

                  {filteredProducts.length === 0 ? (
                    <div className="text-center py-12 bg-[var(--card)] border border-[var(--line)] rounded-2xl text-[var(--muted)] text-sm">
                      لا توجد منتجات في هذا القسم حالياً. استخدم النموذج أعلاه للإضافة.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredProducts.map((prod) => (
                        <div
                          key={prod.id}
                          className="bg-[var(--card)] border border-[var(--line)] rounded-xl p-3 flex flex-col md:flex-row items-center gap-3 shadow-xs hover:border-[var(--muted)] transition-colors"
                        >
                          {/* Thumbnail */}
                          <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-[var(--line)] bg-[var(--bg)] relative">
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
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                            <div>
                              <span className="block text-[10px] text-[var(--muted)] font-medium">
                                الاسم بالعربية
                              </span>
                              <input
                                type="text"
                                defaultValue={prod.nameAr}
                                onBlur={(e) => {
                                  if (e.target.value !== prod.nameAr) {
                                    handleInlineUpdate(prod.id, 'nameAr', e.target.value);
                                  }
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-xs focus:outline-none focus:border-[var(--red)]"
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
                                onBlur={(e) => {
                                  if (e.target.value !== prod.nameEn) {
                                    handleInlineUpdate(prod.id, 'nameEn', e.target.value);
                                  }
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-xs focus:outline-none focus:border-[var(--red)] text-left"
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
                                onBlur={(e) => {
                                  if (e.target.value !== (prod.price || '')) {
                                    handleInlineUpdate(prod.id, 'price', e.target.value);
                                  }
                                }}
                                placeholder="اختياري"
                                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] text-xs focus:outline-none focus:border-[var(--red)] text-left"
                              />
                            </div>
                          </div>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(prod.id)}
                            title="حذف المنتج"
                            className="touch-btn w-9 h-9 rounded-lg text-red-600 hover:bg-red-500/10 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
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
              <div className="max-w-2xl mx-auto space-y-6">
                {/* General Settings Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sm:p-6 shadow-sm">
                  <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-[var(--red)]" />
                    بيانات وشريط الإعلانات
                  </h3>
                  <p className="text-xs text-[var(--muted)] mb-5">
                    التحكم في نص الإعلان الأحمر وأرقام التواصل الرسمية
                  </p>

                  <form onSubmit={handleSaveSettings} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        نص الشريط الإعلاني (أعلى الموقع)
                      </label>
                      <input
                        type="text"
                        value={bannerText}
                        onChange={(e) => setBannerText(e.target.value)}
                        placeholder="اتركه فاضي ليختفي"
                        className="w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm focus:outline-none focus:border-[var(--red)]"
                      />
                      <span className="text-[11px] text-[var(--muted)] mt-1 block">
                        اتركه فاضي ليختفي تلقائياً من الصفحة.
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[var(--red)]" />
                          رقم حمدر رجالي (واتساب / اتصال)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={menPhone}
                          onChange={(e) => setMenPhone(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-left focus:outline-none focus:border-[var(--red)] font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold mb-1 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[var(--gold)]" />
                          رقم حمدر نسائي (واتساب / اتصال)
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={womenPhone}
                          onChange={(e) => setWomenPhone(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm text-left focus:outline-none focus:border-[var(--red)] font-mono"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="touch-btn px-6 py-2.5 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-bold text-sm hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      حفظ إعدادات الموقع
                    </button>
                  </form>
                </section>

                {/* Change Password Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sm:p-6 shadow-sm">
                  <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[var(--gold)]" />
                    تغيير الرمز السري
                  </h3>
                  <p className="text-xs text-[var(--muted)] mb-4">
                    تغيير الرمز السري للدخول إلى لوحة التحكم
                  </p>

                  {passwordStatus && (
                    <div
                      className={`p-3 rounded-xl text-xs font-semibold mb-4 ${
                        passwordStatus.includes('بنجاح')
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-red-500/10 text-red-600'
                      }`}
                    >
                      {passwordStatus}
                    </div>
                  )}

                  <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold mb-1">
                        الرمز السري الجديد
                      </label>
                      <input
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        placeholder="أدخل 6 أحرف أو أرقام على الأقل"
                        className="w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-sm focus:outline-none focus:border-[var(--red)]"
                      />
                    </div>

                    <button
                      type="submit"
                      className="touch-btn px-6 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--card)] font-bold text-sm transition-colors cursor-pointer"
                    >
                      تحديث الرمز السري
                    </button>
                  </form>
                </section>

                {/* Database Connection Status Card */}
                <section className="bg-[var(--card)] border border-[var(--line)] rounded-2xl p-5 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <Database className="w-4 h-4 text-[var(--red)]" />
                      حالة الاتصال بالبيانات
                    </h3>
                    {isFirebaseLiveMode() ? (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-600 font-bold text-xs">
                        ● متصل بـ Firebase السحابي
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 font-bold text-xs">
                        ● وضع التجربة السريع
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted)] leading-relaxed">
                    قواعد الأمان مفعلة: القراءة متاحة للجميع، والكتابة محصورة بمدير المتجر المعتمد.
                  </p>
                </section>

                {/* Logout Button */}
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="touch-btn px-5 py-2 rounded-xl border border-red-500/20 text-red-600 hover:bg-red-500/10 text-xs font-bold transition-colors inline-flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    تسجيل الخروج من لوحة التحكم
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Bottom Bar */}
          <footer className="sticky bottom-0 bg-[var(--card)] border-t border-[var(--line)] px-4 py-2.5 flex items-center justify-between safe-bottom">
            <button
              onClick={handleLogout}
              className="touch-btn px-3 py-1 rounded-lg border border-red-500/20 text-red-600 hover:bg-red-500/10 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>تسجيل الخروج</span>
            </button>
            <button
              onClick={onClose}
              className="touch-btn px-5 py-1.5 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer"
            >
              إغلاق لوحة التحكم والعودة للمتجر
            </button>
          </footer>
        </div>
      )}
    </div>
  );
};
