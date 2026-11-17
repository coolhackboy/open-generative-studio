import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const REPO_URL = 'https://github.com/coolhackboy/open-generative-studio'
/** Until a site URL is configured, the OG image is served from the repository itself. */
const REPO_OG_IMAGE = 'https://raw.githubusercontent.com/coolhackboy/open-generative-studio/main/public/og.jpg'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Fills index.html placeholders (brand name, absolute og:url / og:image) and, in builds,
 * preloads the code-split model catalog so it downloads in parallel with the app bundle.
 */
function htmlMeta(opts: { brandName: string; siteUrl: string }): Plugin {
  const site = opts.siteUrl.replace(/\/+$/, '')
  const ogImage = site ? `${site}/og.jpg` : REPO_OG_IMAGE
  return {
    name: 'html-meta',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const out = html
          .replaceAll('__BRAND_NAME__', escapeHtml(opts.brandName))
          .replaceAll('__SITE_URL__', escapeHtml(site || REPO_URL))
          .replaceAll('__OG_IMAGE__', escapeHtml(ogImage))
        const catalog = Object.values(ctx.bundle ?? {}).find(
          (c) => c.type === 'chunk' && c.name === 'catalog' && !c.isEntry,
        )
        if (!catalog) return out
        return {
          html: out,
          tags: [{ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: true, href: `/${catalog.fileName}` }, injectTo: 'head' }],
        }
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  return {
    plugins: [
      react(),
      tailwindcss(),
      htmlMeta({
        brandName: env.VITE_BRAND_NAME?.trim() || 'Open Generative Studio',
        siteUrl: env.VITE_SITE_URL?.trim() || '',
      }),
    ],
  }
})
