import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Injects VITE_BRAND_NAME into index.html (title + Open Graph) with a default, no .env required. */
function brandHtml(brandName: string): Plugin {
  return {
    name: 'brand-html',
    transformIndexHtml: (html) => html.replaceAll('__BRAND_NAME__', escapeHtml(brandName)),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  const brandName = env.VITE_BRAND_NAME?.trim() || 'Open Generative Studio'
  return {
    plugins: [react(), tailwindcss(), brandHtml(brandName)],
  }
})
