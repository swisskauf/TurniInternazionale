import { useStore } from '@/store/store';
import type { Locale } from '@/engine/types';
import { it, type Dict } from './it';
import { en } from './en';
import { de } from './de';
import { fr } from './fr';

export const DICTS: Record<Locale, Dict> = { it, en, de, fr };

export const LOCALE_NAMES: Record<Locale, string> = { it: 'Italiano', en: 'English', de: 'Deutsch', fr: 'Français' };

export function useT(): Dict {
  const locale = useStore((s) => s.profile.locale);
  return DICTS[locale] ?? it;
}

export function getT(locale?: Locale): Dict {
  return DICTS[locale ?? useStore.getState().profile.locale] ?? it;
}

export type { Dict };
