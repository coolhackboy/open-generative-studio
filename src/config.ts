/**
 * Brand + backend configuration. Everything a white-label fork usually changes lives here
 * (plus `.env`). Values come from Vite env vars at build time.
 */

const env = import.meta.env;

function str(value: string | undefined, fallback: string): string {
  const v = value?.trim();
  return v ? v : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
}

const UTM = 'utm_source=open-generative-studio&utm_medium=app';

export const config = {
  brandName: str(env.VITE_BRAND_NAME, 'Open Generative Studio'),
  /** Optional logo URL; when empty the built-in mark is used. */
  brandLogoUrl: str(env.VITE_BRAND_LOGO_URL, ''),
  /** Optional accent override (any CSS color). */
  accent: str(env.VITE_ACCENT, ''),
  defaultApiBase: str(env.VITE_API_BASE, 'https://api.poyo.ai').replace(/\/+$/, ''),
  showPoweredBy: bool(env.VITE_SHOW_POWERED_BY, true),

  repoUrl: 'https://github.com/coolhackboy/open-generative-studio',

  /** Backend / provider links. */
  provider: {
    name: 'PoYo',
    homeUrl: `https://poyo.ai/?${UTM}&utm_campaign=powered_by`,
    apiKeyUrl: `https://poyo.ai/dashboard/api-key?${UTM}&utm_campaign=settings`,
    onboardingKeyUrl: `https://poyo.ai/dashboard/api-key?${UTM}&utm_campaign=onboarding`,
    billingUrl: `https://poyo.ai/dashboard/billing?${UTM}&utm_campaign=credits`,
    docsUrl: `https://docs.poyo.ai/?${UTM}&utm_campaign=docs`,
    /** Shown as the env var name in "Copy as code" snippets. */
    keyEnvVar: 'POYO_API_KEY',
    /** USD value of one billing credit. */
    creditUSD: 0.005,
  },
} as const;

export type AppConfig = typeof config;
