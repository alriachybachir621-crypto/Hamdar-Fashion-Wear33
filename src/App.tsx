/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageCircle,
  PhoneCall,
  MapPin,
  ExternalLink,
  Instagram,
  ArrowDown,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  X,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import { Product, SiteSettings, Language } from './types';
import {
  subscribeProducts,
  subscribeSettings,
  subscribeAuth,
  signOutAdminOnLoad,
} from './firebaseService';
import { AdminModal } from './components/AdminModal';
import { INITIAL_PRODUCTS, INITIAL_SETTINGS } from './initialData';

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [settings, setSettings] = useState<SiteSettings>(INITIAL_SETTINGS);
  const [user, setUser] = useState<any>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  // Category filter state
  const [selectedMenCategory, setSelectedMenCategory] = useState<string>('all');
  const [selectedWomenCategory, setSelectedWomenCategory] = useState<string>('all');

  // Product detail viewer modal
  const [activeViewerProduct, setActiveViewerProduct] = useState<Product | null>(null);

  // Floating WhatsApp modal state
  const [isWaPopupOpen, setIsWaPopupOpen] = useState(false);

  // Dual Admin Triggers: (a) 5 taps within 3 seconds using pointerdown, (b) 1.5s long press
  const pointerTapTimesRef = useRef<number[]>([]);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Sign out admin on page load to ensure ephemeral admin session
  useEffect(() => {
    signOutAdminOnLoad();
  }, []);

  // Update HTML tag attributes on language change
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Listen to Firestore Realtime subscriptions
  useEffect(() => {
    const unsubProducts = subscribeProducts(
      (prods) => {
        setProducts(prods);
        setIsLoadingProducts(false);
      },
      () => {
        setIsLoadingProducts(false);
      }
    );

    const unsubSettings = subscribeSettings((sett) => {
      setSettings(sett);
    });

    const unsubAuth = subscribeAuth((u) => {
      setUser(u);
    });

    return () => {
      unsubProducts();
      unsubSettings();
      unsubAuth();
    };
  }, []);

  // Listen for #admin in url hash on load and on hashchange
  useEffect(() => {
    const checkHash = () => {
      if (window.location.hash === '#admin') {
        setIsAdminOpen(true);
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  const handleCloseAdmin = () => {
    setIsAdminOpen(false);
    if (window.location.hash === '#admin') {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        window.location.hash = '';
      }
    }
  };

  // Pointer event handlers for footer copyright admin trigger
  const handleCopyrightPointerDown = (e: React.PointerEvent) => {
    // 1. Taps within 3 seconds
    const now = Date.now();
    const recent = [...pointerTapTimesRef.current.filter((t) => now - t < 3000), now];
    pointerTapTimesRef.current = recent;

    if (recent.length >= 5) {
      pointerTapTimesRef.current = [];
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      setIsAdminOpen(true);
      return;
    }

    // 2. 1.5 second long press
    pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      setIsAdminOpen(true);
      pointerTapTimesRef.current = [];
      longPressTimerRef.current = null;
    }, 1500);
  };

  const handleCopyrightPointerMove = (e: React.PointerEvent) => {
    if (pointerStartPosRef.current && longPressTimerRef.current) {
      const dx = Math.abs(e.clientX - pointerStartPosRef.current.x);
      const dy = Math.abs(e.clientY - pointerStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  const handleCopyrightPointerEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pointerStartPosRef.current = null;
  };

  // Phone clean up
  const cleanPhone = (phoneStr: string) => phoneStr.replace(/[^0-9]/g, '');
  const menPhoneRaw = settings.menPhone || '76 320 279';
  const womenPhoneRaw = settings.womenPhone || '81 612 154';
  const menPhoneDigits = cleanPhone(menPhoneRaw);
  const womenPhoneDigits = cleanPhone(womenPhoneRaw);

  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=Saadnayel+Bekaa+Lebanon';
  const instagramUrl = 'https://www.instagram.com/hamdar_mens_wear';

  // Visible products filtered by store and hidden flag
  const visibleProducts = useMemo(() => {
    return products.filter((p) => !p.hidden);
  }, [products]);

  const menProducts = useMemo(() => {
    return visibleProducts
      .filter((p) => p.store === 'men')
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  }, [visibleProducts]);

  const womenProducts = useMemo(() => {
    return visibleProducts
      .filter((p) => p.store === 'women')
      .sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
  }, [visibleProducts]);

  // Derived categories
  const menCategories = useMemo(() => {
    const set = new Set<string>();
    menProducts.forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [menProducts]);

  const womenCategories = useMemo(() => {
    const set = new Set<string>();
    womenProducts.forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set);
  }, [womenProducts]);

  // Filtered by selected category chip
  const displayedMenProducts = useMemo(() => {
    if (selectedMenCategory === 'all') return menProducts;
    return menProducts.filter((p) => p.category === selectedMenCategory);
  }, [menProducts, selectedMenCategory]);

  const displayedWomenProducts = useMemo(() => {
    if (selectedWomenCategory === 'all') return womenProducts;
    return womenProducts.filter((p) => p.category === selectedWomenCategory);
  }, [womenProducts, selectedWomenCategory]);

  // Handle WhatsApp inquiry for specific product
  const getProductWaLink = (product: Product) => {
    const phone = product.store === 'men' ? menPhoneDigits : womenPhoneDigits;
    const name = lang === 'ar' ? product.nameAr : (product.nameEn || product.nameAr);
    const priceText = product.price ? ` ($${product.price})` : '';
    const storeLabel = product.store === 'men' ? 'حمدر رجالي' : 'حمدر نسائي';
    const message =
      lang === 'ar'
        ? `مرحبا ${storeLabel}، بدي استفسر عن: "${name}"${priceText}`
        : `Hello ${storeLabel}, I would like to inquire about: "${name}"${priceText}`;
    return `https://wa.me/961${phone}?text=${encodeURIComponent(message)}`;
  };

  // Wholesale WhatsApp link
  const wholesaleWaLink = useMemo(() => {
    const msg =
      lang === 'ar'
        ? 'مرحبا حمدر رجالي، أود الاستفسار عن تفاصيل وأسعار البيع بالجملة.'
        : 'Hello Hamdar Men\'s Wear, I would like to inquire about wholesale orders and pricing.';
    return `https://wa.me/961${menPhoneDigits}?text=${encodeURIComponent(msg)}`;
  }, [lang, menPhoneDigits]);

  // Product Viewer navigation (Next / Prev)
  const currentViewerStoreList = useMemo(() => {
    if (!activeViewerProduct) return [];
    return activeViewerProduct.store === 'men' ? displayedMenProducts : displayedWomenProducts;
  }, [activeViewerProduct, displayedMenProducts, displayedWomenProducts]);

  const handlePrevProduct = () => {
    if (!activeViewerProduct || currentViewerStoreList.length <= 1) return;
    const idx = currentViewerStoreList.findIndex((p) => p.id === activeViewerProduct.id);
    if (idx > 0) {
      setActiveViewerProduct(currentViewerStoreList[idx - 1]);
    } else {
      setActiveViewerProduct(currentViewerStoreList[currentViewerStoreList.length - 1]);
    }
  };

  const handleNextProduct = () => {
    if (!activeViewerProduct || currentViewerStoreList.length <= 1) return;
    const idx = currentViewerStoreList.findIndex((p) => p.id === activeViewerProduct.id);
    if (idx < currentViewerStoreList.length - 1) {
      setActiveViewerProduct(currentViewerStoreList[idx + 1]);
    } else {
      setActiveViewerProduct(currentViewerStoreList[0]);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-body selection:bg-[var(--red)] selection:text-white w-full max-w-full overflow-x-hidden min-w-0">
      {/* 1. Optional red announcement banner (from database, hidden when empty) */}
      {settings.banner && settings.banner.trim().length > 0 && (
        <aside
          role="region"
          aria-label="Announcement"
          className="bg-[var(--red)] text-white text-xs sm:text-sm font-semibold py-2.5 px-4 text-center tracking-wide transition-all z-40 relative shadow-inner w-full max-w-full overflow-hidden"
        >
          <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 shrink-0 animate-pulse text-amber-200" />
            <span className="truncate">{settings.banner}</span>
          </div>
        </aside>
      )}

      {/* 2. Sticky Header with strictly LTR HAMDAR Logo (Immune to RTL reversal) */}
      <header className="sticky top-0 z-30 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--line)] safe-top transition-colors w-full max-w-full min-w-0">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-2 min-w-0 w-full">
          {/* Logo "HAMDAR": Uses bdo dir="ltr" + inline-flex to guarantee H-A-M-D-A-R order in all browsers */}
          <a
            href="#"
            dir="ltr"
            className="select-none hover:opacity-90 transition-opacity shrink-0 inline-flex flex-row items-center"
            style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}
            aria-label="Hamdar Fashion Wear Home"
          >
            <bdo
              dir="ltr"
              className="inline-flex flex-row items-center font-heading text-xl sm:text-2xl md:text-3xl font-bold tracking-[0.06em]"
              style={{ direction: 'ltr' }}
            >
              <span>H</span>
              <span className="text-[var(--red)]">A</span>
              <span>MD</span>
              <span className="text-[var(--red)]">A</span>
              <span>R</span>
            </bdo>
          </a>

          {/* Center Navigation Links (Hidden on small mobile) */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-semibold text-[var(--muted)] shrink-0">
            <a href="#men" className="hover:text-[var(--ink)] transition-colors">
              {lang === 'ar' ? 'رجالي' : "Men's Wear"}
            </a>
            <a href="#women" className="hover:text-[var(--ink)] transition-colors">
              {lang === 'ar' ? 'نسائي' : "Women's Wear"}
            </a>
            <a href="#visit" className="hover:text-[var(--ink)] transition-colors">
              {lang === 'ar' ? 'زيارتنا والتواصل' : 'Visit & Contact'}
            </a>
          </nav>

          {/* Language toggle pill (EN / عربي) */}
          <div className="flex items-center shrink-0">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
              className="touch-btn px-3 sm:px-4 py-1.5 rounded-full border border-[var(--line)] bg-[var(--card)] hover:border-[var(--muted)] text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              aria-label="Switch Language"
            >
              <span className={lang === 'en' ? 'text-[var(--red)] font-extrabold' : 'text-[var(--muted)]'}>
                EN
              </span>
              <span className="text-[var(--line)]">/</span>
              <span className={lang === 'ar' ? 'text-[var(--red)] font-extrabold' : 'text-[var(--muted)]'}>
                عربي
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* 3. Hero Section (100dvh boutique feel, with optional admin hero image) */}
      <section className="relative min-h-[85dvh] sm:min-h-[100dvh] bg-[var(--dark)] text-white flex flex-col items-center justify-center text-center px-4 overflow-hidden w-full max-w-full">
        {/* Background Image or Gradient */}
        {settings.heroImage ? (
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
            <img
              src={settings.heroImage}
              alt="Hamdar Fashion"
              className="w-full h-full object-cover opacity-35 filter brightness-75"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--dark)] via-[var(--dark)]/60 to-[var(--dark)]/80" />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--red)_0%,_transparent_75%)]"
          />
        )}

        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center py-10 w-full min-w-0">
          {/* Big HAMDAR Wordmark with strict bdo LTR override */}
          <div className="w-full max-w-full overflow-hidden flex justify-center px-2">
            <bdo
              dir="ltr"
              style={{
                direction: 'ltr',
                unicodeBidi: 'bidi-override',
                fontSize: 'clamp(32px, 10vw, 100px)',
                letterSpacing: '0.02em',
                lineHeight: 1.05,
              }}
              className="font-heading font-bold select-none mb-3 max-w-full inline-flex flex-row items-center justify-center truncate"
            >
              <span>H</span>
              <span className="text-[var(--red)]">A</span>
              <span>MD</span>
              <span className="text-[var(--red)]">A</span>
              <span>R</span>
            </bdo>
          </div>

          {/* Subtitle / Tagline in gold */}
          <p className="text-[var(--gold)] text-base sm:text-2xl md:text-3xl font-semibold tracking-wide mb-6 sm:mb-10 max-w-full px-2">
            {lang === 'ar' ? 'أناقة لكل العائلة' : 'Style for the whole family'}
          </p>

          <p className="max-w-md text-xs sm:text-sm text-neutral-300 font-normal mb-8 leading-relaxed opacity-90 px-4">
            {lang === 'ar'
              ? 'سعدنايل، الشارع العام، البقاع — عنوان الفخامة والذوق الرفيع في عالم الأزياء الرجالية والنسائية.'
              : 'Saadnayel, Main Road, Bekaa — Your destination for refined men & women fashion.'}
          </p>

          {/* Call to Actions */}
          <div className="flex flex-wrap items-center justify-center gap-3 w-full px-2">
            <a
              href="#men"
              className="touch-btn px-6 py-3 rounded-full bg-[var(--red)] hover:bg-[#a61217] text-white font-bold text-xs sm:text-sm tracking-wide transition-all shadow-lg hover:shadow-red-900/30 shrink-0"
            >
              {lang === 'ar' ? 'تشكيلة الرجال' : "Men's Collection"}
            </a>
            <a
              href="#women"
              className="touch-btn px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm tracking-wide backdrop-blur-xs border border-white/20 transition-all shrink-0"
            >
              {lang === 'ar' ? 'تشكيلة النساء' : "Women's Collection"}
            </a>
          </div>

          {/* Subtle scroll down indicator */}
          <a
            href="#men"
            aria-label="Scroll to collection"
            className="mt-12 text-white/50 hover:text-white transition-colors animate-bounce p-2"
          >
            <ArrowDown className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* 4. Men's Section (#men) */}
      <section id="men" className="py-14 sm:py-20 px-4 max-w-6xl mx-auto w-full scroll-mt-20 min-w-0">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 min-w-0">
          <div>
            <div className="inline-block px-3 py-1 rounded-md bg-[var(--red)]/10 text-[var(--red)] text-xs font-bold mb-2">
              {lang === 'ar' ? 'قسم الرجال' : "Men's Wear"}
            </div>
            <h2 className="font-heading text-2xl sm:text-4xl font-bold mb-1">
              {lang === 'ar' ? 'حمدر رجالي' : "Hamdar Men's Wear"}
            </h2>
            <p className="text-[var(--muted)] text-sm sm:text-base">
              {lang === 'ar'
                ? 'قمصان، بدلات وكل ما يلزم للرجل.'
                : 'Shirts, suits, and everything for him.'}
            </p>
          </div>

          {/* WhatsApp Direct Link for Men */}
          <a
            href={`https://wa.me/961${menPhoneDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="touch-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 text-xs sm:text-sm font-bold transition-colors w-fit shrink-0"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{lang === 'ar' ? `واتساب رجالي: ${menPhoneRaw}` : `WhatsApp: ${menPhoneRaw}`}</span>
          </a>
        </div>

        {/* Category Filter Chips */}
        {menCategories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none max-w-full">
            <button
              onClick={() => setSelectedMenCategory('all')}
              className={`touch-btn px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedMenCategory === 'all'
                  ? 'bg-[var(--ink)] text-[var(--bg)] shadow-xs'
                  : 'bg-[var(--card)] text-[var(--muted)] border border-[var(--line)] hover:border-[var(--muted)]'
              }`}
            >
              {lang === 'ar' ? 'الكل' : 'All'}
            </button>
            {menCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedMenCategory(cat)}
                className={`touch-btn px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedMenCategory === cat
                    ? 'bg-[var(--ink)] text-[var(--bg)] shadow-xs'
                    : 'bg-[var(--card)] text-[var(--muted)] border border-[var(--line)] hover:border-[var(--muted)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Loading State or Products Grid or Empty State */}
        {isLoadingProducts ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--red)]" />
            <p className="text-xs text-[var(--muted)]">
              {lang === 'ar' ? 'جاري تحميل التشكيلة من قاعدة البيانات...' : 'Loading collection...'}
            </p>
          </div>
        ) : displayedMenProducts.length === 0 ? (
          /* Friendly Empty State */
          <div className="py-12 px-6 rounded-2xl bg-[var(--card)] border border-[var(--line)] text-center max-w-md mx-auto my-6 shadow-2xs">
            <div className="w-14 h-14 mx-auto rounded-full bg-[var(--red)]/10 text-[var(--red)] flex items-center justify-center mb-3.5">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold text-[var(--ink)] mb-1.5">
              {lang === 'ar' ? 'لا توجد منتجات معروضة حالياً' : 'No items currently on display'}
            </h4>
            <p className="text-xs sm:text-sm text-[var(--muted)] mb-5 leading-relaxed">
              {lang === 'ar'
                ? 'نقوم بتحديث التشكيلات باستمرار في متجرنا بسعدنايل. تفضلوا بالتواصل معنا مباشرة عبر واتساب لمعرفة أحدث الموديلات والأسعار.'
                : 'We regularly refresh our collections at our Saadnayel store. Contact us directly on WhatsApp to explore our latest arrivals.'}
            </p>
            <a
              href={`https://wa.me/961${menPhoneDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تواصل معنا عبر واتساب' : 'Chat with us on WhatsApp'}</span>
            </a>
          </div>
        ) : (
          /* 4:5 Product Grid: 2 cols on mobile, 3 on tablet, 4 on desktop */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 w-full max-w-full min-w-0">
            {displayedMenProducts.map((product) => {
              const displayName = lang === 'ar' ? product.nameAr : (product.nameEn || product.nameAr);

              return (
                <div
                  key={product.id}
                  onClick={() => setActiveViewerProduct(product)}
                  className="group flex flex-col bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden hover:border-[var(--muted)] transition-all shadow-2xs hover:shadow-md cursor-pointer w-full max-w-full min-w-0"
                >
                  {/* Photo 4:5 aspect ratio */}
                  <div className="w-full aspect-[4/5] overflow-hidden bg-[var(--bg)] relative">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={displayName}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-500 ease-out"
                      />
                    ) : (
                      <div
                        className="w-full h-full diagonal-placeholder flex items-center justify-center p-3 text-center"
                        title={displayName}
                      >
                        <span className="text-[11px] sm:text-xs text-[var(--muted)] font-medium line-clamp-2 px-2 py-1 rounded bg-[var(--card)]/80 shadow-2xs">
                          {displayName}
                        </span>
                      </div>
                    )}

                    {/* Sold out badge */}
                    {product.soldOut && (
                      <div className="absolute top-2 start-2 bg-red-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md shadow-md uppercase tracking-wider">
                        {lang === 'ar' ? 'نفد' : 'Sold Out'}
                      </div>
                    )}

                    {/* Price overlay pill */}
                    {product.price && (
                      <div
                        dir="ltr"
                        className="absolute bottom-2 end-2 bg-black/75 backdrop-blur-xs text-[var(--gold)] text-xs font-bold px-2 py-0.5 rounded-md shadow-xs"
                      >
                        ${product.price.replace('$', '')}
                      </div>
                    )}
                  </div>

                  {/* Footer strip */}
                  <div className="p-2.5 sm:p-3 text-center border-t border-[var(--line)] bg-[var(--card)]">
                    <p className="text-xs sm:text-sm font-semibold truncate text-[var(--ink)]">
                      {displayName}
                    </p>
                    {product.category && (
                      <p className="text-[10px] text-[var(--muted)] truncate mt-0.5">
                        {product.category}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Wholesale Banner Strip */}
        <div className="mt-10 sm:mt-12 p-4 sm:p-6 rounded-2xl bg-[var(--card)] border border-[var(--line)] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-start shadow-xs w-full max-w-full min-w-0 overflow-hidden">
          <div className="min-w-0">
            <h3 className="font-bold text-base sm:text-lg text-[var(--red)]">
              {lang === 'ar' ? 'البيع بالجملة والمفرق متوفر' : 'Wholesale & Retail Available'}
            </h3>
            <p className="text-xs sm:text-sm text-[var(--muted)] mt-1">
              {lang === 'ar'
                ? 'نوفر أفضل الأسعار لتجار الملابس والمحلات في جميع مناطق لبنان.'
                : 'Best competitive rates for clothing retailers and shops across Lebanon.'}
            </p>
          </div>
          <a
            href={wholesaleWaLink}
            target="_blank"
            rel="noopener noreferrer"
            className="touch-btn shrink-0 px-5 sm:px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm transition-all shadow-md flex items-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{lang === 'ar' ? 'طلب عرض أسعار بالجملة' : 'Request Wholesale Quote'}</span>
          </a>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-4 w-full">
        <hr className="border-[var(--line)]" />
      </div>

      {/* 5. Women's Section (#women) */}
      <section id="women" className="py-14 sm:py-20 px-4 max-w-6xl mx-auto w-full scroll-mt-20 min-w-0">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 min-w-0">
          <div>
            <div className="inline-block px-3 py-1 rounded-md bg-[var(--gold)]/15 text-[var(--gold)] text-xs font-bold mb-2">
              {lang === 'ar' ? 'قسم النساء' : "Women's Wear"}
            </div>
            <h2 className="font-heading text-2xl sm:text-4xl font-bold mb-1">
              {lang === 'ar' ? 'حمدر نسائي' : "Hamdar Women's Wear"}
            </h2>
            <p className="text-[var(--muted)] text-sm sm:text-base">
              {lang === 'ar'
                ? 'فساتين، أطقم وأرقى الموديلات.'
                : 'Dresses, sets, and fine wear for her.'}
            </p>
          </div>

          {/* WhatsApp Direct Link for Women */}
          <a
            href={`https://wa.me/961${womenPhoneDigits}`}
            target="_blank"
            rel="noopener noreferrer"
            className="touch-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 text-xs sm:text-sm font-bold transition-colors w-fit shrink-0"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{lang === 'ar' ? `واتساب نسائي: ${womenPhoneRaw}` : `WhatsApp: ${womenPhoneRaw}`}</span>
          </a>
        </div>

        {/* Category Filter Chips */}
        {womenCategories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none max-w-full">
            <button
              onClick={() => setSelectedWomenCategory('all')}
              className={`touch-btn px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedWomenCategory === 'all'
                  ? 'bg-[var(--ink)] text-[var(--bg)] shadow-xs'
                  : 'bg-[var(--card)] text-[var(--muted)] border border-[var(--line)] hover:border-[var(--muted)]'
              }`}
            >
              {lang === 'ar' ? 'الكل' : 'All'}
            </button>
            {womenCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedWomenCategory(cat)}
                className={`touch-btn px-4 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedWomenCategory === cat
                    ? 'bg-[var(--ink)] text-[var(--bg)] shadow-xs'
                    : 'bg-[var(--card)] text-[var(--muted)] border border-[var(--line)] hover:border-[var(--muted)]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Loading State or Products Grid or Empty State */}
        {isLoadingProducts ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--gold)]" />
            <p className="text-xs text-[var(--muted)]">
              {lang === 'ar' ? 'جاري تحميل التشكيلة من قاعدة البيانات...' : 'Loading collection...'}
            </p>
          </div>
        ) : displayedWomenProducts.length === 0 ? (
          /* Friendly Empty State */
          <div className="py-12 px-6 rounded-2xl bg-[var(--card)] border border-[var(--line)] text-center max-w-md mx-auto my-6 shadow-2xs">
            <div className="w-14 h-14 mx-auto rounded-full bg-[var(--gold)]/10 text-[var(--gold)] flex items-center justify-center mb-3.5">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold text-[var(--ink)] mb-1.5">
              {lang === 'ar' ? 'لا توجد منتجات معروضة حالياً' : 'No items currently on display'}
            </h4>
            <p className="text-xs sm:text-sm text-[var(--muted)] mb-5 leading-relaxed">
              {lang === 'ar'
                ? 'نقوم بتحديث تشكيلة حمدر نسائي باستمرار. تواصلوا معنا عبر واتساب للاطلاع على أحدث التصاميم والفساتين المتوفرة.'
                : 'We regularly update our women collection. Contact us on WhatsApp to view available styles and dresses.'}
            </p>
            <a
              href={`https://wa.me/961${womenPhoneDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-btn inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{lang === 'ar' ? 'تواصل معنا عبر واتساب' : 'Chat with us on WhatsApp'}</span>
            </a>
          </div>
        ) : (
          /* 4:5 Product Grid */
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 w-full max-w-full min-w-0">
            {displayedWomenProducts.map((product) => {
              const displayName = lang === 'ar' ? product.nameAr : (product.nameEn || product.nameAr);

              return (
                <div
                  key={product.id}
                  onClick={() => setActiveViewerProduct(product)}
                  className="group flex flex-col bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden hover:border-[var(--muted)] transition-all shadow-2xs hover:shadow-md cursor-pointer w-full max-w-full min-w-0"
                >
                  {/* Photo 4:5 aspect ratio */}
                  <div className="w-full aspect-[4/5] overflow-hidden bg-[var(--bg)] relative">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={displayName}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-104 transition-transform duration-500 ease-out"
                      />
                    ) : (
                      <div
                        className="w-full h-full diagonal-placeholder flex items-center justify-center p-3 text-center"
                        title={displayName}
                      >
                        <span className="text-[11px] sm:text-xs text-[var(--muted)] font-medium line-clamp-2 px-2 py-1 rounded bg-[var(--card)]/80 shadow-2xs">
                          {displayName}
                        </span>
                      </div>
                    )}

                    {/* Sold out badge */}
                    {product.soldOut && (
                      <div className="absolute top-2 start-2 bg-red-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md shadow-md uppercase tracking-wider">
                        {lang === 'ar' ? 'نفد' : 'Sold Out'}
                      </div>
                    )}

                    {/* Price overlay pill */}
                    {product.price && (
                      <div
                        dir="ltr"
                        className="absolute bottom-2 end-2 bg-black/75 backdrop-blur-xs text-[var(--gold)] text-xs font-bold px-2 py-0.5 rounded-md shadow-xs"
                      >
                        ${product.price.replace('$', '')}
                      </div>
                    )}
                  </div>

                  {/* Footer strip */}
                  <div className="p-2.5 sm:p-3 text-center border-t border-[var(--line)] bg-[var(--card)]">
                    <p className="text-xs sm:text-sm font-semibold truncate text-[var(--ink)]">
                      {displayName}
                    </p>
                    {product.category && (
                      <p className="text-[10px] text-[var(--muted)] truncate mt-0.5">
                        {product.category}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 6. Visit & Contact Section (#visit) */}
      <section id="visit" className="py-14 sm:py-20 px-4 bg-[var(--card)] border-t border-[var(--line)] scroll-mt-20 w-full min-w-0">
        <div className="max-w-6xl mx-auto min-w-0">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="font-heading text-2xl sm:text-3xl font-bold mb-2">
              {lang === 'ar' ? 'زيارتنا والتواصل' : 'Visit & Contact'}
            </h2>
            <p className="text-xs sm:text-sm text-[var(--muted)]">
              {lang === 'ar'
                ? 'يسعدنا استقبالكم في محلاتنا بسعدنايل أو خدمتكم عبر الهاتف والواتساب طوال أيام الأسبوع.'
                : 'We welcome you at our Saadnayel stores or via phone and WhatsApp anytime.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 min-w-0">
            {/* Contact 1: Men's */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[var(--bg)] border border-[var(--line)] space-y-4 flex flex-col justify-between shadow-2xs">
              <div className="space-y-2">
                <div className="inline-block px-2.5 py-1 rounded bg-[var(--red)]/10 text-[var(--red)] text-xs font-bold">
                  {lang === 'ar' ? 'حمدر رجالي' : "Hamdar Men's Wear"}
                </div>
                <h3 className="font-bold text-base text-[var(--ink)]">
                  {lang === 'ar' ? 'مفرق وجملة' : 'Wholesale & Retail'}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {lang === 'ar' ? 'هاتف وواتساب:' : 'Phone & WhatsApp:'}
                </p>
                <p dir="ltr" className="font-heading text-lg font-bold text-[var(--ink)]">
                  {menPhoneRaw}
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <a
                  href={`https://wa.me/961${menPhoneDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-btn w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'مراسلة واتساب' : 'WhatsApp'}</span>
                </a>
                <a
                  href={`tel:+961${menPhoneDigits}`}
                  className="touch-btn w-full py-2.5 px-3 rounded-xl border border-[var(--line)] hover:border-[var(--muted)] text-[var(--ink)] font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'اتصال مباشر' : 'Call Store'}</span>
                </a>
              </div>
            </div>

            {/* Contact 2: Women's */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[var(--bg)] border border-[var(--line)] space-y-4 flex flex-col justify-between shadow-2xs">
              <div className="space-y-2">
                <div className="inline-block px-2.5 py-1 rounded bg-[var(--gold)]/15 text-[var(--gold)] text-xs font-bold">
                  {lang === 'ar' ? 'حمدر نسائي' : "Hamdar Women's Wear"}
                </div>
                <h3 className="font-bold text-base text-[var(--ink)]">
                  {lang === 'ar' ? 'أحدث الأزياء النسائية' : 'Latest Women Fashion'}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {lang === 'ar' ? 'هاتف وواتساب:' : 'Phone & WhatsApp:'}
                </p>
                <p dir="ltr" className="font-heading text-lg font-bold text-[var(--ink)]">
                  {womenPhoneRaw}
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <a
                  href={`https://wa.me/961${womenPhoneDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-btn w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{lang === 'ar' ? 'مراسلة واتساب' : 'WhatsApp'}</span>
                </a>
                <a
                  href={`tel:+961${womenPhoneDigits}`}
                  className="touch-btn w-full py-2.5 px-3 rounded-xl border border-[var(--line)] hover:border-[var(--muted)] text-[var(--ink)] font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>{lang === 'ar' ? 'اتصال مباشر' : 'Call Store'}</span>
                </a>
              </div>
            </div>

            {/* Contact 3: Location */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[var(--bg)] border border-[var(--line)] space-y-4 flex flex-col justify-between shadow-2xs">
              <div className="space-y-2">
                <div className="inline-block px-2.5 py-1 rounded bg-blue-500/10 text-blue-500 text-xs font-bold">
                  {lang === 'ar' ? 'موقعنا' : 'Store Location'}
                </div>
                <h3 className="font-bold text-base text-[var(--ink)]">
                  {lang === 'ar' ? 'سعدنايل، البقاع' : 'Saadnayel, Bekaa'}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {lang === 'ar' ? 'الشارع العام، لبنان' : 'Main Road, Lebanon'}
                </p>
              </div>

              <div className="pt-2 w-full min-w-0">
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-btn w-full py-3 px-3 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-bold text-xs flex items-center justify-center gap-2 transition-opacity hover:opacity-90 shadow-sm min-w-0 truncate"
                >
                  <MapPin className="w-4 h-4 text-[var(--red)] shrink-0" />
                  <span className="truncate">{lang === 'ar' ? 'افتح الخريطة' : 'Open in Maps'}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60 shrink-0" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Footer with strictly LTR HAMDAR Wordmark */}
      <footer className="bg-[var(--dark)] text-neutral-300 py-12 px-4 border-t border-neutral-800 safe-bottom w-full max-w-full overflow-hidden">
        <div className="max-w-6xl mx-auto flex flex-col items-center justify-center text-center space-y-5 w-full min-w-0">
          {/* Logo with strict bdo LTR override */}
          <a
            href="#"
            dir="ltr"
            className="select-none text-white inline-flex flex-row items-center"
            style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}
          >
            <bdo
              dir="ltr"
              className="inline-flex flex-row items-center font-heading text-2xl font-bold tracking-[0.06em]"
              style={{ direction: 'ltr' }}
            >
              <span>H</span>
              <span className="text-[var(--red)]">A</span>
              <span>MD</span>
              <span className="text-[var(--red)]">A</span>
              <span>R</span>
            </bdo>
          </a>

          {/* Instagram link pill */}
          <div className="w-full max-w-full overflow-hidden flex justify-center px-2">
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-btn inline-flex items-center gap-2 text-xs sm:text-sm text-[var(--gold)] hover:text-white transition-colors max-w-full truncate px-4 py-1.5 rounded-full border border-neutral-700 bg-neutral-900/60"
            >
              <Instagram className="w-4 h-4 shrink-0" />
              <span dir="ltr" className="truncate">@hamdar_mens_wear</span>
            </a>
          </div>

          {/* Reliable Admin Trigger: 5 pointerdown taps within 3s OR 1.5s long press */}
          <div
            onPointerDown={handleCopyrightPointerDown}
            onPointerMove={handleCopyrightPointerMove}
            onPointerUp={handleCopyrightPointerEnd}
            onPointerCancel={handleCopyrightPointerEnd}
            onPointerLeave={handleCopyrightPointerEnd}
            style={{
              minHeight: '48px',
              padding: '12px 24px',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              WebkitTouchCallout: 'none',
              touchAction: 'manipulation',
            }}
            className="inline-flex items-center justify-center text-xs text-neutral-500 cursor-pointer select-none hover:text-neutral-400 transition-colors max-w-full"
            title="Hamdar Fashion Wear"
            role="button"
            tabIndex={0}
            aria-label="Hamdar Fashion Wear Saadnayel"
          >
            <p className="pointer-events-none select-none text-center">
              © {new Date().getFullYear()} Hamdar Fashion Wear. سعدنايل، البقاع.
            </p>
          </div>
        </div>
      </footer>

      {/* 8. Floating Round WhatsApp Button (Mobile-friendly) */}
      <div className="fixed bottom-5 start-5 z-40 safe-bottom">
        <div className="relative">
          {/* Choice popup */}
          {isWaPopupOpen && (
            <div
              className="absolute bottom-16 start-0 w-64 max-w-[calc(100vw-2.5rem)] bg-[var(--card)] border border-[var(--line)] rounded-2xl p-3 shadow-2xl space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-150 text-start"
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-[var(--ink)]">
                  {lang === 'ar' ? 'تواصل عبر واتساب' : 'Chat via WhatsApp'}
                </span>
                <button
                  onClick={() => setIsWaPopupOpen(false)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--ink)] p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <a
                href={`https://wa.me/961${menPhoneDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsWaPopupOpen(false)}
                className="touch-btn flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--bg)] transition-colors border border-[var(--line)] min-w-0"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--red)]/10 text-[var(--red)] flex items-center justify-center font-bold text-xs shrink-0">
                  رجالي
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--ink)] truncate">حمدر رجالي</p>
                  <p dir="ltr" className="text-[11px] text-[var(--muted)] truncate">{menPhoneRaw}</p>
                </div>
              </a>

              <a
                href={`https://wa.me/961${womenPhoneDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsWaPopupOpen(false)}
                className="touch-btn flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--bg)] transition-colors border border-[var(--line)] min-w-0"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--gold)]/15 text-[var(--gold)] flex items-center justify-center font-bold text-xs shrink-0">
                  نسائي
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--ink)] truncate">حمدر نسائي</p>
                  <p dir="ltr" className="text-[11px] text-[var(--muted)] truncate">{womenPhoneRaw}</p>
                </div>
              </a>
            </div>
          )}

          {/* Floating Action Button */}
          <button
            onClick={() => setIsWaPopupOpen(!isWaPopupOpen)}
            className="touch-btn w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl hover:shadow-emerald-500/30 flex items-center justify-center transition-all cursor-pointer relative"
            aria-label="تواصل معنا عبر واتساب"
          >
            <MessageCircle className="w-7 h-7" />
            <span className="absolute -top-1 -end-1 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white animate-pulse" />
          </button>
        </div>
      </div>

      {/* 9. Product Full Detail Viewer Modal */}
      {activeViewerProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          style={{ touchAction: 'pan-y' }}
          onClick={() => setActiveViewerProduct(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-[var(--card)] border border-[var(--line)] rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
            dir={lang === 'ar' ? 'rtl' : 'ltr'}
          >
            {/* Close button */}
            <button
              onClick={() => setActiveViewerProduct(null)}
              className="absolute top-3 end-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Photo with Prev / Next navigators */}
            <div className="relative w-full aspect-[4/5] bg-[var(--bg)] overflow-hidden shrink-0">
              {activeViewerProduct.imageUrl ? (
                <img
                  src={activeViewerProduct.imageUrl}
                  alt={
                    lang === 'ar'
                      ? activeViewerProduct.nameAr
                      : (activeViewerProduct.nameEn || activeViewerProduct.nameAr)
                  }
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full diagonal-placeholder flex items-center justify-center p-6 text-center">
                  <span className="text-sm text-[var(--muted)] font-medium">
                    {lang === 'ar'
                      ? activeViewerProduct.nameAr
                      : (activeViewerProduct.nameEn || activeViewerProduct.nameAr)}
                  </span>
                </div>
              )}

              {/* Prev / Next buttons */}
              {currentViewerStoreList.length > 1 && (
                <>
                  <button
                    onClick={handlePrevProduct}
                    className="touch-btn absolute start-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Previous"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleNextProduct}
                    className="touch-btn absolute end-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Next"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Details strip */}
            <div className="p-4 sm:p-5 flex flex-col gap-3 overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[11px] font-bold text-[var(--gold)] uppercase tracking-wider">
                    {activeViewerProduct.store === 'men'
                      ? (lang === 'ar' ? 'حمدر رجالي' : "Men's Wear")
                      : (lang === 'ar' ? 'حمدر نسائي' : "Women's Wear")}
                  </span>
                  <h3 className="font-heading text-lg sm:text-xl font-bold text-[var(--ink)] mt-0.5">
                    {lang === 'ar'
                      ? activeViewerProduct.nameAr
                      : (activeViewerProduct.nameEn || activeViewerProduct.nameAr)}
                  </h3>
                  {activeViewerProduct.category && (
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {activeViewerProduct.category}
                    </p>
                  )}
                </div>

                {activeViewerProduct.price && (
                  <div dir="ltr" className="font-heading text-xl font-bold text-[var(--gold)] shrink-0">
                    ${activeViewerProduct.price.replace('$', '')}
                  </div>
                )}
              </div>

              {activeViewerProduct.soldOut && (
                <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold text-center">
                  {lang === 'ar' ? 'هذا المنتج نفد حالياً من المتجر' : 'Currently sold out'}
                </div>
              )}

              {/* Inquiry Action */}
              <a
                href={getProductWaLink(activeViewerProduct)}
                target="_blank"
                rel="noopener noreferrer"
                className="touch-btn w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all mt-1"
              >
                <MessageCircle className="w-4 h-4" />
                <span>
                  {lang === 'ar'
                    ? 'الاستفسار والطلب عبر واتساب'
                    : 'Inquire & Order via WhatsApp'}
                </span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 10. Admin Modal Panel */}
      <AdminModal
        isOpen={isAdminOpen}
        onClose={handleCloseAdmin}
        products={products}
        settings={settings}
        user={user}
      />
    </div>
  );
}
