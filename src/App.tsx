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
  Share2,
  ShoppingBag,
} from 'lucide-react';
import { Product, SiteSettings, Language, StoreType } from './types';
import {
  subscribeProducts,
  subscribeSettings,
  subscribeAuth,
} from './firebaseService';
import { AdminModal } from './components/AdminModal';
import { INITIAL_PRODUCTS, INITIAL_SETTINGS } from './initialData';

export default function App() {
  const [lang, setLang] = useState<Language>('ar');
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
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

  // Secret admin tap tracker
  const tapTimesRef = useRef<number[]>([]);

  // Update HTML tag attributes on language change
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Listen to Firestore / Realtime subscriptions
  useEffect(() => {
    const unsubProducts = subscribeProducts((prods) => {
      setProducts(prods);
    });
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

  // Listen for #admin in url hash
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
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  // Secret tap handler: 5 taps within 1.5 seconds
  const handleSecretTap = () => {
    const now = Date.now();
    const recent = [...tapTimesRef.current.filter((t) => now - t < 1500), now];
    tapTimesRef.current = recent;
    if (recent.length >= 5) {
      tapTimesRef.current = [];
      setIsAdminOpen(true);
    }
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
    <div className="min-h-screen flex flex-col font-body selection:bg-[var(--red)] selection:text-white max-w-full overflow-x-hidden">
      {/* 1. Optional red announcement banner (from database, hidden when empty) */}
      {settings.banner && settings.banner.trim().length > 0 && (
        <aside
          role="region"
          aria-label="Announcement"
          className="bg-[var(--red)] text-white text-xs sm:text-sm font-semibold py-2.5 px-4 text-center tracking-wide transition-all z-40 relative shadow-inner"
        >
          <div className="max-w-6xl mx-auto flex items-center justify-center gap-2">
            <Sparkles className="w-3.5 h-3.5 shrink-0 animate-pulse text-amber-200" />
            <span>{settings.banner}</span>
          </div>
        </aside>
      )}

      {/* 2. Sticky Header with HAMDAR Logo */}
      <header className="sticky top-0 z-30 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--line)] safe-top transition-colors">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo "HAMDAR" with explicit LTR isolation to prevent Arabic RTL inversion */}
          <a
            href="#"
            className="font-heading text-2xl sm:text-3xl font-bold tracking-[0.08em] select-none hover:opacity-90 transition-opacity"
            style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}
            aria-label="Hamdar Fashion Wear Home"
          >
            <span>H</span>
            <span className="text-[var(--red)]">A</span>
            <span>MD</span>
            <span className="text-[var(--red)]">A</span>
            <span>R</span>
          </a>

          {/* Center Navigation Links (Hidden on small mobile) */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-[var(--muted)]">
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
          <div className="flex items-center">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
              className="touch-btn px-4 py-1.5 rounded-full border border-[var(--line)] bg-[var(--card)] hover:border-[var(--muted)] text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
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
      <section className="relative min-h-[90dvh] sm:min-h-[100dvh] bg-[var(--dark)] text-white flex flex-col items-center justify-center text-center px-4 overflow-hidden">
        {/* Background Image or Gradient */}
        {settings.heroImage ? (
          <div className="absolute inset-0 z-0">
            <img
              src={settings.heroImage}
              alt="Hamdar Fashion"
              className="w-full h-full object-cover opacity-35 filter brightness-75 scale-102 transition-transform duration-1000"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--dark)] via-[var(--dark)]/60 to-[var(--dark)]/80" />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--red)_0%,_transparent_75%)]"
          />
        )}

        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center py-12">
          {/* Giant HAMDAR Wordmark (Guaranteed LTR order) */}
          <h1
            style={{
              direction: 'ltr',
              unicodeBidi: 'isolate',
              fontSize: 'clamp(52px, 17vw, 160px)',
              letterSpacing: '0.04em',
              lineHeight: 1,
              display: 'inline-block',
            }}
            className="font-heading font-bold select-none mb-3 animate-in fade-in duration-700"
          >
            <span>H</span>
            <span className="text-[var(--red)]">A</span>
            <span>MD</span>
            <span className="text-[var(--red)]">A</span>
            <span>R</span>
          </h1>

          {/* Subtitle / Tagline in gold */}
          <p className="text-[var(--gold)] text-lg sm:text-2xl md:text-3xl font-semibold tracking-wide mb-8 sm:mb-12">
            {lang === 'ar' ? 'أناقة لكل العائلة' : 'Style for the whole family'}
          </p>

          <p className="max-w-md text-xs sm:text-sm text-neutral-300 font-normal mb-8 leading-relaxed opacity-90">
            {lang === 'ar'
              ? 'سعدنايل، الشارع العام، البقاع · ملابس رجالية ونسائية بأحدث خطوط الموضة والأناقة'
              : 'Saadnayel Main Road, Bekaa, Lebanon · Premium Men & Women Collections'}
          </p>

          {/* Smooth Scroll Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full max-w-xs sm:max-w-md justify-center">
            <a
              href="#men"
              className="touch-btn w-full sm:w-auto px-8 rounded-full bg-[var(--red)] hover:bg-[#a31117] text-white font-bold text-base transition-all shadow-lg hover:scale-102 flex items-center justify-center gap-2"
            >
              <span>{lang === 'ar' ? 'قسم رجالي' : "Men's Collection"}</span>
              <ArrowDown className="w-4 h-4 opacity-80" />
            </a>

            <a
              href="#women"
              className="touch-btn w-full sm:w-auto px-8 rounded-full border-2 border-[var(--gold)] hover:bg-[var(--gold)] hover:text-black text-[var(--gold)] font-bold text-base transition-all hover:scale-102 flex items-center justify-center gap-2"
            >
              <span>{lang === 'ar' ? 'قسم نسائي' : "Women's Collection"}</span>
              <ArrowDown className="w-4 h-4 opacity-80" />
            </a>
          </div>
        </div>
      </section>

      {/* 4. Men's Section (#men) */}
      <section id="men" className="py-16 sm:py-24 px-4 max-w-6xl mx-auto w-full scroll-mt-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
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
            className="touch-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 text-xs sm:text-sm font-bold transition-colors w-fit"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{lang === 'ar' ? `واتساب رجالي: ${menPhoneRaw}` : `WhatsApp: ${menPhoneRaw}`}</span>
          </a>
        </div>

        {/* Category Filter Chips */}
        {menCategories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
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

        {/* 4:5 Product Grid: 2 cols on mobile, 3 on tablet, 4 on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {displayedMenProducts.map((product) => {
            const displayName = lang === 'ar' ? product.nameAr : (product.nameEn || product.nameAr);

            return (
              <div
                key={product.id}
                onClick={() => setActiveViewerProduct(product)}
                className="group flex flex-col bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden hover:border-[var(--muted)] transition-all shadow-2xs hover:shadow-md cursor-pointer"
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

        {/* Wholesale Banner Strip */}
        <div className="mt-12 p-6 rounded-2xl bg-[var(--card)] border border-[var(--line)] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-start shadow-xs">
          <div>
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
            className="touch-btn shrink-0 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm transition-all shadow-md flex items-center gap-2"
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
      <section id="women" className="py-16 sm:py-24 px-4 max-w-6xl mx-auto w-full scroll-mt-20">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
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
            className="touch-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600/10 text-emerald-600 hover:bg-emerald-600/20 text-xs sm:text-sm font-bold transition-colors w-fit"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{lang === 'ar' ? `واتساب نسائي: ${womenPhoneRaw}` : `WhatsApp: ${womenPhoneRaw}`}</span>
          </a>
        </div>

        {/* Category Filter Chips */}
        {womenCategories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
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

        {/* 4:5 Product Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {displayedWomenProducts.map((product) => {
            const displayName = lang === 'ar' ? product.nameAr : (product.nameEn || product.nameAr);

            return (
              <div
                key={product.id}
                onClick={() => setActiveViewerProduct(product)}
                className="group flex flex-col bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden hover:border-[var(--muted)] transition-all shadow-2xs hover:shadow-md cursor-pointer"
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

                  {product.soldOut && (
                    <div className="absolute top-2 start-2 bg-red-600 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md shadow-md uppercase tracking-wider">
                      {lang === 'ar' ? 'نفد' : 'Sold Out'}
                    </div>
                  )}

                  {product.price && (
                    <div
                      dir="ltr"
                      className="absolute bottom-2 end-2 bg-black/75 backdrop-blur-xs text-[var(--gold)] text-xs font-bold px-2 py-0.5 rounded-md shadow-xs"
                    >
                      ${product.price.replace('$', '')}
                    </div>
                  )}
                </div>

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
      </section>

      {/* 6. Contact & Visit Section (#visit) */}
      <section id="visit" className="bg-[var(--card)] border-t border-[var(--line)] py-16 sm:py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <header className="text-center max-w-xl mx-auto mb-12">
            <h2 className="font-heading text-2xl sm:text-4xl font-bold mb-2">
              {lang === 'ar' ? 'تفضلوا بزيارتنا' : 'Visit Our Stores'}
            </h2>
            <p className="text-sm sm:text-base text-[var(--muted)]">
              {lang === 'ar'
                ? 'سعدنايل، الشارع العام، البقاع، لبنان · نسعد دائماً باستقبالكم وخدمتكم'
                : 'Saadnayel Main Road, Bekaa, Lebanon · We look forward to serving you'}
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Store 1: Men's */}
            <div className="p-6 rounded-2xl border border-[var(--line)] bg-[var(--bg)] flex flex-col justify-between space-y-4">
              <div>
                <div className="inline-block px-2.5 py-1 rounded bg-[var(--red)]/10 text-[var(--red)] text-xs font-bold mb-3">
                  {lang === 'ar' ? 'متجر 1' : 'Store 1'}
                </div>
                <h3 className="font-heading text-xl font-bold mb-1">
                  {lang === 'ar' ? 'حمدر رجالي' : "Hamdar Men's Wear"}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {lang === 'ar' ? 'مفرق وجملة · أحدث الموديلات' : 'Wholesale & Retail'}
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <a
                  href={`https://wa.me/961${menPhoneDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-btn w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{lang === 'ar' ? `واتساب: ${menPhoneRaw}` : `WhatsApp: ${menPhoneRaw}`}</span>
                </a>
                <a
                  href={`tel:+961${menPhoneDigits}`}
                  className="touch-btn w-full py-2.5 px-4 rounded-xl border border-[var(--line)] bg-[var(--card)] hover:border-[var(--muted)] font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>{lang === 'ar' ? `اتصال: ${menPhoneRaw}` : `Call: ${menPhoneRaw}`}</span>
                </a>
              </div>
            </div>

            {/* Store 2: Women's */}
            <div className="p-6 rounded-2xl border border-[var(--line)] bg-[var(--bg)] flex flex-col justify-between space-y-4">
              <div>
                <div className="inline-block px-2.5 py-1 rounded bg-[var(--gold)]/15 text-[var(--gold)] text-xs font-bold mb-3">
                  {lang === 'ar' ? 'متجر 2' : 'Store 2'}
                </div>
                <h3 className="font-heading text-xl font-bold mb-1">
                  {lang === 'ar' ? 'حمدر نسائي' : "Hamdar Women's Wear"}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {lang === 'ar' ? 'أرقى تشكيلة فساتين وأطقم' : 'Fine Women Collections'}
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <a
                  href={`https://wa.me/961${womenPhoneDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-btn w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{lang === 'ar' ? `واتساب: ${womenPhoneRaw}` : `WhatsApp: ${womenPhoneRaw}`}</span>
                </a>
                <a
                  href={`tel:+961${womenPhoneDigits}`}
                  className="touch-btn w-full py-2.5 px-4 rounded-xl border border-[var(--line)] bg-[var(--card)] hover:border-[var(--muted)] font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <PhoneCall className="w-4 h-4" />
                  <span>{lang === 'ar' ? `اتصال: ${womenPhoneRaw}` : `Call: ${womenPhoneRaw}`}</span>
                </a>
              </div>
            </div>

            {/* Location & Map Card */}
            <div className="p-6 rounded-2xl border border-[var(--line)] bg-[var(--bg)] flex flex-col justify-between space-y-4">
              <div>
                <div className="inline-block px-2.5 py-1 rounded bg-blue-500/10 text-blue-500 text-xs font-bold mb-3">
                  {lang === 'ar' ? 'الموقع' : 'Location'}
                </div>
                <h3 className="font-heading text-xl font-bold mb-1">
                  {lang === 'ar' ? 'سعدنايل، البقاع' : 'Saadnayel, Bekaa'}
                </h3>
                <p className="text-xs text-[var(--muted)]">
                  {lang === 'ar' ? 'الشارع العام، لبنان' : 'Main Road, Lebanon'}
                </p>
              </div>

              <div className="pt-2">
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-btn w-full py-3 px-4 rounded-xl bg-[var(--ink)] text-[var(--bg)] font-bold text-xs flex items-center justify-center gap-2 transition-opacity hover:opacity-90 shadow-sm"
                >
                  <MapPin className="w-4 h-4 text-[var(--red)]" />
                  <span>{lang === 'ar' ? 'افتح الموقع على الخريطة' : 'Open Location in Maps'}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Footer */}
      <footer className="bg-[var(--dark)] text-neutral-300 py-12 px-4 border-t border-neutral-800 safe-bottom">
        <div className="max-w-6xl mx-auto flex flex-col items-center justify-center text-center space-y-6">
          {/* Logo with strict LTR inline style */}
          <a
            href="#"
            className="font-heading text-2xl font-bold tracking-[0.08em] select-none text-white inline-block"
            style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
          >
            <span>H</span>
            <span className="text-[var(--red)]">A</span>
            <span>MD</span>
            <span className="text-[var(--red)]">A</span>
            <span>R</span>
          </a>

          {/* Instagram link */}
          <a
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="touch-btn inline-flex items-center gap-2 text-sm text-[var(--gold)] hover:text-white transition-colors"
          >
            <Instagram className="w-4 h-4" />
            <span dir="ltr">@hamdar_mens_wear</span>
          </a>

          {/* Secret Tap Copyright Trigger (5 taps opens admin) */}
          <div
            onClick={handleSecretTap}
            className="text-xs text-neutral-500 cursor-pointer select-none py-2 hover:text-neutral-400 transition-colors"
            title="Hamdar Fashion Wear"
          >
            <p>© {new Date().getFullYear()} Hamdar Fashion Wear. سعدنايل، البقاع.</p>
          </div>
        </div>
      </footer>

      {/* 8. Floating Round WhatsApp Button (Mobile-friendly) */}
      <div className="fixed bottom-5 start-5 z-40 safe-bottom">
        <div className="relative">
          {/* Choice popup */}
          {isWaPopupOpen && (
            <div
              className="absolute bottom-16 start-0 w-64 bg-[var(--card)] border border-[var(--line)] rounded-2xl p-3 shadow-2xl space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-150 text-start"
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-[var(--ink)]">
                  {lang === 'ar' ? 'تواصل عبر واتساب' : 'Chat via WhatsApp'}
                </span>
                <button
                  onClick={() => setIsWaPopupOpen(false)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--ink)] p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <a
                href={`https://wa.me/961${menPhoneDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsWaPopupOpen(false)}
                className="touch-btn flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--bg)] transition-colors border border-[var(--line)]"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--red)]/10 text-[var(--red)] flex items-center justify-center font-bold text-xs shrink-0">
                  رجالي
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--ink)] truncate">حمدر رجالي</p>
                  <p className="text-[10px] text-[var(--muted)]" dir="ltr">
                    {menPhoneRaw}
                  </p>
                </div>
              </a>

              <a
                href={`https://wa.me/961${womenPhoneDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsWaPopupOpen(false)}
                className="touch-btn flex items-center gap-2.5 p-2 rounded-xl hover:bg-[var(--bg)] transition-colors border border-[var(--line)]"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--gold)]/15 text-[var(--gold)] flex items-center justify-center font-bold text-xs shrink-0">
                  نسائي
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--ink)] truncate">حمدر نسائي</p>
                  <p className="text-[10px] text-[var(--muted)]" dir="ltr">
                    {womenPhoneRaw}
                  </p>
                </div>
              </a>
            </div>
          )}

          {/* Toggle trigger button */}
          <button
            onClick={() => setIsWaPopupOpen(!isWaPopupOpen)}
            className="w-13 h-13 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
            aria-label="Open WhatsApp Chat"
          >
            <MessageCircle className="w-6 h-6 fill-current" />
          </button>
        </div>
      </div>

      {/* 9. Product Detail Viewer Modal */}
      {activeViewerProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onClick={() => setActiveViewerProduct(null)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--line)] rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setActiveViewerProduct(null)}
              className="absolute top-3 end-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Product Image */}
            <div className="w-full aspect-[4/5] max-h-[60vh] bg-[var(--bg)] relative overflow-hidden">
              {activeViewerProduct.imageUrl ? (
                <img
                  src={activeViewerProduct.imageUrl}
                  alt={lang === 'ar' ? activeViewerProduct.nameAr : (activeViewerProduct.nameEn || activeViewerProduct.nameAr)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full diagonal-placeholder flex items-center justify-center p-6 text-center text-sm text-[var(--muted)]">
                  {lang === 'ar' ? activeViewerProduct.nameAr : (activeViewerProduct.nameEn || activeViewerProduct.nameAr)}
                </div>
              )}

              {/* Prev / Next buttons */}
              {currentViewerStoreList.length > 1 && (
                <>
                  <button
                    onClick={handlePrevProduct}
                    className="absolute top-1/2 start-3 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center cursor-pointer transition-colors"
                    aria-label="Previous Product"
                  >
                    <ChevronRight className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
                  </button>
                  <button
                    onClick={handleNextProduct}
                    className="absolute top-1/2 end-3 -translate-y-1/2 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center cursor-pointer transition-colors"
                    aria-label="Next Product"
                  >
                    <ChevronLeft className="w-5 h-5 rtl:rotate-0 ltr:rotate-180" />
                  </button>
                </>
              )}

              {activeViewerProduct.soldOut && (
                <div className="absolute top-3 start-3 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-md">
                  {lang === 'ar' ? 'نفد من المتجر' : 'Sold Out'}
                </div>
              )}
            </div>

            {/* Product Details & WhatsApp Inquiry Button */}
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-heading text-lg sm:text-xl font-bold text-[var(--ink)]">
                    {lang === 'ar' ? activeViewerProduct.nameAr : (activeViewerProduct.nameEn || activeViewerProduct.nameAr)}
                  </h3>
                  {activeViewerProduct.nameEn && lang === 'ar' && (
                    <p className="text-xs text-[var(--muted)]" dir="ltr">
                      {activeViewerProduct.nameEn}
                    </p>
                  )}
                  {activeViewerProduct.category && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-[var(--bg)] border border-[var(--line)] text-[10px] text-[var(--muted)]">
                      {activeViewerProduct.category}
                    </span>
                  )}
                </div>

                {activeViewerProduct.price && (
                  <div className="text-end shrink-0" dir="ltr">
                    <span className="text-xl sm:text-2xl font-bold text-[var(--gold)]">
                      ${activeViewerProduct.price.replace('$', '')}
                    </span>
                  </div>
                )}
              </div>

              {/* Inquiry Action */}
              <a
                href={getProductWaLink(activeViewerProduct)}
                target="_blank"
                rel="noopener noreferrer"
                className="touch-btn w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-md flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                <span>{lang === 'ar' ? 'استفسر أو اطلب عبر واتساب' : 'Inquire / Order on WhatsApp'}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 10. Admin Modal */}
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
