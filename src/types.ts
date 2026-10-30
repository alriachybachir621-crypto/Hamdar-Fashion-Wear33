export type StoreType = 'men' | 'women';

export interface Product {
  id: string;
  store: StoreType;
  nameAr: string;
  nameEn: string;
  price?: string;
  imageUrl?: string;
  createdAt: number;
}

export interface SiteSettings {
  banner: string;
  menPhone: string;
  womenPhone: string;
}

export type Language = 'ar' | 'en';
