/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageCircle,
  PhoneCall,
  MapPin,
  ExternalLink,
  Instagram,
  ArrowDown,
  Sparkles,
} from 'lucide-react';
import { Product, SiteSettings, Language } from './types';
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
    // keep taps from last 1500ms
    const recent = [...tapTimesRef.current.filter((t) => now - t < 1500), now];
    tapTimesRef.current = recent;
    if (recent.length >= 5) {
      tapTimesRef.current = [];
      setIsAdminOpen(true);
    }
  };

  // Filter products
  const menProducts = products.filter((p) => p.store === 'men');
  const womenProducts = products.filter((p) => p.store === 'women');

  // Format clean phone for tel and wa
  const cleanPhone = (phoneStr: string) => phoneStr.replace(/[^0-9]/g, '');

  const menPhoneRaw = settings.menPhone || '76 320 279';
  const womenPhoneRaw = settings.womenPhone || '81 612 154';
  const menPhoneDigits = cleanPhone(menPhoneRaw);
  const womenPhoneDigits = cleanPhone(womenPhoneRaw);

  const menWaMessage =
    lang === 'ar'
      ? 'مرحبا، بدي أسأل عن حمدر رجالي'
      : "Hello, I'd like to ask about Hamdar Men's Wear";

  const womenWaMessage =
    lang === 'ar'
      ? 'مرحبا، بدي أسأل عن حمدر نسائي'
      : "Hello, I'd like to ask about Hamdar Women's Wear";

  const menWaUrl = `https://wa.me/961${menPhoneDigits}?text=${encodeURIComponent(menWaMessage)}`;
  const womenWaUrl = `https://wa.me/961${womenPhoneDigits}?text=${encodeURIComponent(womenWaMessage)}`;

  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=Saadnayel+Bekaa+Lebanon';
  const instagramUrl = 'https://www.instagram.com/hamdar_mens_wear';

  return (
    <div className="min-h-screen flex flex-col font-body selection:bg-[var(--red)] selection:text-white">
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

      {/* Sticky Header */}
      <header className="sticky top-0 z-30 bg-[var(--bg)]/90 backdrop-blur-md border-b border-[var(--line)] safe-top transition-colors">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo "HAMDAR" (letter-spaced, the "A" in red) */}
          <a
            href="#"
            dir="ltr"
            className="font-heading text-2xl sm:text-3xl font-bold tracking-[0.08em] select-none hover:opacity-95 transition-opacity inline-flex items-center flex-row"
            aria-label="Hamdar Fashion Wear Home"
          >
            <span>H</span>
            <span className="text-[var(--red)]">A</span>
            <span>MD</span>
            <span className="text-[var(--red)]">A</span>
            <span>R</span>
          </a>

          {/* Language toggle pill (EN / عربي) */}
          <div className="flex items-center">
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              dir="ltr"
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

      {/* 2. Hero (dark background) */}
      <section className="bg-[var(--dark)] text-white py-16 sm:py-24 md:py-32 px-4 flex flex-col items-center justify-center text-center relative overflow-hidden">
        {/* Subtle background ambient light */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--red)_0%,_transparent_70%)]"
        />

        <div className="max-w-4xl mx-auto relative z-10 flex flex-col items-center">
          {/* Giant "HAMDAR" wordmark with the "A" in red */}
          <h1
            dir="ltr"
            style={{
              fontSize: 'clamp(54px, 17vw, 168px)',
              letterSpacing: '0.04em',
              lineHeight: 1,
            }}
            className="font-heading font-bold select-none mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700 inline-flex items-center justify-center flex-row"
          >
            <span>H</span>
            <span className="text-[var(--red)]">A</span>
            <span>MD</span>
            <span className="text-[var(--red)]">A</span>
            <span>R</span>
          </h1>

          {/* Tagline in gold */}
          <p className="text-[var(--gold)] text-lg sm:text-2xl md:text-3xl font-semibold tracking-wide mb-8 sm:mb-12">
            {lang === 'ar' ? 'أناقة لكل العائلة' : 'Style for the whole family'}
          </p>

          {/* Two Buttons: Men (red) & Women (gold outline) */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-xs sm:max-w-md justify-center">
            <a
              href="#men"
              className="touch-btn w-full sm:w-auto px-8 rounded-full bg-[var(--red)] hover:bg-[#a31117] text-white font-bold text-base transition-all shadow-md hover:scale-102 flex items-center justify-center gap-2"
            >
              <span>{lang === 'ar' ? 'رجالي' : 'Men'}</span>
              <ArrowDown className="w-4 h-4 opacity-80" />
            </a>

            <a
              href="#women"
              className="touch-btn w-full sm:w-auto px-8 rounded-full border-2 border-[var(--gold)] hover:bg-[var(--gold)] hover:text-black text-[var(--gold)] font-bold text-base transition-all hover:scale-102 flex items-center justify-center gap-2"
            >
              <span>{lang === 'ar' ? 'نسائي' : 'Women'}</span>
              <ArrowDown className="w-4 h-4 opacity-80" />
            </a>
          </div>
        </div>
      </section>

      {/* 3. Men section (#men) */}
      <section id="men" className="py-14 sm:py-20 px-4 max-w-6xl mx-auto w-full scroll-mt-20">
        <header className="mb-8">
          <div className="inline-block px-3 py-1 rounded-md bg-[var(--red)]/10 text-[var(--red)] text-xs font-bold mb-2">
            {lang === 'ar' ? 'قسم الرجال' : "Men's Collection"}
          </div>
          <h2 className="font-heading text-2xl sm:text-4xl font-bold mb-2">
            {lang === 'ar' ? 'حمدر رجالي' : "Hamdar Men's Wear"}
          </h2>
          <p className="text-[var(--muted)] text-sm sm:text-base">
            {lang === 'ar'
              ? 'قمصان، بدلات وكل ما يلزم للرجل.'
              : 'Shirts, suits, and everything for him.'}
          </p>
        </header>

        {/* 2 columns on mobile, 4 on desktop, 12px gap */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {menProducts.map((product) => {
            const displayName = lang === 'ar' ? product.nameAr : product.nameEn;
            const priceTag = product.price ? ` · $${product.price.replace('$', '')}` : '';

            return (
              <div
                key={product.id}
                className="group flex flex-col bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden hover:border-[var(--muted)] transition-colors shadow-2xs"
              >
                {/* Photo: object-fit cover, lazy, square aspect-ratio */}
                <div className="w-full aspect-square overflow-hidden bg-[var(--bg)] relative">
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
                </div>

                {/* Footer strip */}
                <div className="p-2.5 sm:p-3 text-center border-t border-[var(--line)] bg-[var(--card)]">
                  <p className="text-xs sm:text-sm font-semibold truncate text-[var(--ink)]">
                    {displayName}
                    {priceTag && (
                      <span className="text-[var(--gold)] font-bold ltr:inline rtl:inline">
                        {priceTag}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Red text line below grid */}
        <div className="mt-8 text-center">
          <p className="text-[var(--red)] font-bold text-sm sm:text-base tracking-wide">
            {lang === 'ar'
              ? 'البيع بالجملة والمفرق متوفر'
              : 'Wholesale and retail available'}
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-6xl mx-auto px-4 w-full">
        <hr className="border-[var(--line)]" />
      </div>

      {/* 4. Women section (#women) */}
      <section id="women" className="py-14 sm:py-20 px-4 max-w-6xl mx-auto w-full scroll-mt-20">
        <header className="mb-8">
          <div className="inline-block px-3 py-1 rounded-md bg-[var(--gold)]/15 text-[var(--gold)] text-xs font-bold mb-2">
            {lang === 'ar' ? 'قسم النساء' : "Women's Collection"}
          </div>
          <h2 className="font-heading text-2xl sm:text-4xl font-bold mb-2">
            {lang === 'ar' ? 'حمدر نسائي' : "Hamdar Women's Wear"}
          </h2>
          <p className="text-[var(--muted)] text-sm sm:text-base">
            {lang === 'ar' ? 'أزياء نسائية عصرية.' : "Modern women's fashion."}
          </p>
        </header>

        {/* Grid: 2 columns on mobile, 4 on desktop, 12px gap */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {womenProducts.map((product) => {
            const displayName = lang === 'ar' ? product.nameAr : product.nameEn;
            const priceTag = product.price ? ` · $${product.price.replace('$', '')}` : '';

            return (
              <div
                key={product.id}
                className="group flex flex-col bg-[var(--card)] border border-[var(--line)] rounded-xl overflow-hidden hover:border-[var(--muted)] transition-colors shadow-2xs"
              >
                {/* Photo: object-fit cover, lazy, square aspect-ratio */}
                <div className="w-full aspect-square overflow-hidden bg-[var(--bg)] relative">
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
                </div>

                {/* Footer strip */}
                <div className="p-2.5 sm:p-3 text-center border-t border-[var(--line)] bg-[var(--card)]">
                  <p className="text-xs sm:text-sm font-semibold truncate text-[var(--ink)]">
                    {displayName}
                    {priceTag && (
                      <span className="text-[var(--gold)] font-bold ltr:inline rtl:inline">
                        {priceTag}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Contact Section */}
      <section className="py-14 sm:py-20 px-4 bg-[var(--card)] border-t border-[var(--line)]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="font-heading text-2xl sm:text-4xl font-bold mb-2">
              {lang === 'ar' ? 'تواصل معنا' : 'Contact us'}
            </h2>
            <p className="text-[var(--muted)] text-sm">
              {lang === 'ar'
                ? 'يسعدنا استقبالكم في معارضنا في سعدنايل، أو الرد على استفساراتكم عبر واتساب'
                : 'Visit our stores in Saadnayel or reach out directly on WhatsApp'}
            </p>
          </div>

          {/* Two cards (Men, Women) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Store 1: Men's Card */}
            <div className="p-6 rounded-2xl border border-[var(--line)] bg-[var(--bg)] flex flex-col justify-between shadow-xs hover:border-[var(--muted)] transition-colors">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg text-[var(--ink)]">
                    {lang === 'ar' ? 'حمدر رجالي' : "Hamdar Men's Wear"}
                  </h3>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--red)]/10 text-[var(--red)] font-bold">
                    {lang === 'ar' ? 'مفرق وجملة' : 'Retail & Wholesale'}
                  </span>
                </div>

                <div className="flex items-start gap-2 text-xs sm:text-sm text-[var(--muted)] mb-4">
                  <MapPin className="w-4 h-4 text-[var(--red)] shrink-0 mt-0.5" />
                  <span>
                    {lang === 'ar'
                      ? 'سعدنايل، الشارع العام، البقاع'
                      : 'Saadnayel main road, Bekaa, Lebanon'}
                  </span>
                </div>

                {/* Big phone number LTR */}
                <div className="mb-6">
                  <span className="block text-[11px] text-[var(--muted)] mb-1">
                    {lang === 'ar' ? 'رقم الهاتف / واتساب:' : 'Phone / WhatsApp:'}
                  </span>
                  <a
                    href={`tel:+961${menPhoneDigits}`}
                    dir="ltr"
                    className="font-heading text-2xl sm:text-3xl font-bold text-[var(--ink)] hover:text-[var(--red)] transition-colors inline-block tracking-wider"
                  >
                    +961 {menPhoneRaw}
                  </a>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href={menWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-btn flex-1 rounded-xl bg-[var(--dark)] hover:bg-black text-white font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4 text-[#25d366]" />
                  <span>WhatsApp</span>
                </a>

                <a
                  href={`tel:+961${menPhoneDigits}`}
                  className="touch-btn flex-1 rounded-xl border border-[var(--line)] hover:border-[var(--ink)] text-[var(--ink)] font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                  <PhoneCall className="w-4 h-4 text-[var(--red)]" />
                  <span>{lang === 'ar' ? 'اتصل الآن' : 'Call now'}</span>
                </a>
              </div>
            </div>

            {/* Store 2: Women's Card */}
            <div className="p-6 rounded-2xl border border-[var(--line)] bg-[var(--bg)] flex flex-col justify-between shadow-xs hover:border-[var(--muted)] transition-colors">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-lg text-[var(--ink)]">
                    {lang === 'ar' ? 'حمدر نسائي' : "Hamdar Women's Wear"}
                  </h3>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--gold)]/15 text-[var(--gold)] font-bold">
                    {lang === 'ar' ? 'أزياء عصرية' : 'Modern Fashion'}
                  </span>
                </div>

                <div className="flex items-start gap-2 text-xs sm:text-sm text-[var(--muted)] mb-4">
                  <MapPin className="w-4 h-4 text-[var(--gold)] shrink-0 mt-0.5" />
                  <span>
                    {lang === 'ar'
                      ? 'سعدنايل، الشارع العام، البقاع'
                      : 'Saadnayel main road, Bekaa, Lebanon'}
                  </span>
                </div>

                {/* Big phone number LTR */}
                <div className="mb-6">
                  <span className="block text-[11px] text-[var(--muted)] mb-1">
                    {lang === 'ar' ? 'رقم الهاتف / واتساب:' : 'Phone / WhatsApp:'}
                  </span>
                  <a
                    href={`tel:+961${womenPhoneDigits}`}
                    dir="ltr"
                    className="font-heading text-2xl sm:text-3xl font-bold text-[var(--ink)] hover:text-[var(--gold)] transition-colors inline-block tracking-wider"
                  >
                    +961 {womenPhoneRaw}
                  </a>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href={womenWaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="touch-btn flex-1 rounded-xl bg-[var(--dark)] hover:bg-black text-white font-bold text-sm transition-all shadow-xs flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4 text-[#25d366]" />
                  <span>WhatsApp</span>
                </a>

                <a
                  href={`tel:+961${womenPhoneDigits}`}
                  className="touch-btn flex-1 rounded-xl border border-[var(--line)] hover:border-[var(--ink)] text-[var(--ink)] font-bold text-sm transition-all flex items-center justify-center gap-2"
                >
                  <PhoneCall className="w-4 h-4 text-[var(--gold)]" />
                  <span>{lang === 'ar' ? 'اتصل الآن' : 'Call now'}</span>
                </a>
              </div>
            </div>
          </div>

          {/* Under the cards: outlined "Open map" button */}
          <div className="text-center">
            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="touch-btn px-6 py-2.5 rounded-full border border-[var(--line)] hover:border-[var(--ink)] bg-[var(--bg)] text-[var(--ink)] font-bold text-sm transition-all inline-flex items-center gap-2"
            >
              <MapPin className="w-4 h-4 text-[var(--red)]" />
              <span>{lang === 'ar' ? 'افتح الخريطة' : 'Open map'}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-60" />
            </a>
          </div>
        </div>
      </section>

      {/* 6. Footer (dark) */}
      <footer className="mt-auto bg-[var(--dark)] text-[#a09b94] py-12 px-4 border-t border-[#2e2c2a] text-center safe-bottom">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-6">
          {/* Logo in footer */}
          <div
            dir="ltr"
            className="font-heading text-xl font-bold tracking-[0.06em] text-white inline-flex items-center flex-row"
          >
            <span>H</span>
            <span className="text-[var(--red)]">A</span>
            <span>MD</span>
            <span className="text-[var(--red)]">A</span>
            <span>R</span>
          </div>

          {/* Instagram link */}
          <div>
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#2e2c2a] hover:border-[#ef4047] hover:text-white transition-all text-xs font-semibold"
            >
              <Instagram className="w-4 h-4 text-[#ef4047]" />
              <span dir="ltr">@hamdar_mens_wear</span>
            </a>
          </div>

          {/* Secret admin trigger copyright text */}
          <div className="pt-4 border-t border-[#2e2c2a]/60 w-full">
            <button
              onClick={handleSecretTap}
              type="button"
              className="text-xs hover:text-[#f3f0eb] transition-colors cursor-pointer select-none py-1 px-3 rounded hover:bg-white/5 active:scale-98"
              title="© Hamdar Fashion Wear · Saadnayel"
            >
              © Hamdar Fashion Wear · Saadnayel
            </button>
            <p className="text-[10px] text-[#6b6762] mt-1">
              {lang === 'ar'
                ? 'سعدنايل، البقاع، لبنان · جميع الحقوق محفوظة'
                : 'Saadnayel, Bekaa, Lebanon · All rights reserved'}
            </p>
          </div>
        </div>
      </footer>

      {/* 7. Floating green (#25d366) round WhatsApp button, bottom inline-end */}
      <a
        href={menWaUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat on WhatsApp"
        className="fixed bottom-6 end-6 z-40 w-14 h-14 rounded-full bg-[#25d366] text-white flex items-center justify-center shadow-lg hover:scale-108 active:scale-95 transition-transform"
        style={{
          boxShadow: '0 8px 24px rgba(37, 211, 102, 0.4)',
        }}
      >
        <MessageCircle className="w-7 h-7 fill-white text-[#25d366]" />
      </a>

      {/* Hidden Admin Modal Panel */}
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
