import { Product, SiteSettings } from './types';

export const INITIAL_SETTINGS: SiteSettings = {
  banner: '',
  menPhone: '76 320 279',
  womenPhone: '81 612 154',
  heroImage: '',
};

// No sample or mock products. Only real products from Firestore are displayed.
export const INITIAL_PRODUCTS: Product[] = [];
