export type StoreType = 'men' | 'women';

export interface Product {
  id: string;
  store: StoreType;
  nameAr: string;
  nameEn?: string;
  category?: string;
  price?: string;
  imageUrl?: string;
  soldOut?: boolean;
  hidden?: boolean;
  order?: number;
  createdAt: number;
}

export interface SiteSettings {
  banner: string;
  menPhone: string;
  womenPhone: string;
  heroImage?: string;
}

export type Language = 'ar' | 'en';
