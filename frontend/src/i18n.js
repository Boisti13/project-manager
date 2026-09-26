// Interface language. English text is the key: t('Save') is 'Save' in
// English and de['Save'] in German. Placeholders: t('{n} tasks', { n: 3 }).
// src/locales/de.js holds the German texts; i18n.test.js checks that every
// t()/tn() key used in the code has one.
import de from './locales/de';

export const LANGUAGES = { en: 'English', de: 'Deutsch' };

let lang = 'en';

/** The user's preference, else the browser's first language (de or en). */
export function detectLanguage(preference) {
  if (preference && LANGUAGES[preference]) return preference;
  const browser = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'en';
  return /^de\b/i.test(browser) ? 'de' : 'en';
}

export function setLanguage(value) {
  lang = LANGUAGES[value] ? value : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export const getLanguage = () => lang;

/** Locale for dates and numbers. */
export const locale = () => (lang === 'de' ? 'de-DE' : 'en-US');

const fill = (text, vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m)) : text;

export function t(key, vars) {
  return fill(lang === 'de' && de[key] !== undefined ? de[key] : key, vars);
}

/** Singular/plural: tn(3, 'one task', '{n} tasks'). */
export function tn(n, one, other, vars) {
  return t(n === 1 ? one : other, { n, ...vars });
}

/** "Sep 29" / "29. Sept." */
export const shortDate = (value) => new Date(value).toLocaleDateString(locale(), { month: 'short', day: 'numeric' });
