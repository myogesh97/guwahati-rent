import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve } from 'path';

/** Pages that search engines may index, for sitemap.xml. admin, unsubscribe and 404 are noindex. */
const PUBLIC_PAGES = ['/', '/about.html', '/privacy.html', '/terms.html'];
const FALLBACK_SITE_URL = 'https://guwahati-rent.netlify.app';

/**
 * Site-level SEO plumbing (PROJECT_GAP_ANALYSIS.md P1-3, P2-1):
 *  - `%SITE_URL%` in HTML becomes VITE_SITE_URL (canonical / og:url / og:image need absolute URLs)
 *  - robots.txt + sitemap.xml are generated into dist/ with the same origin
 *  - the map chunk and MapLibre worker get `<link rel="prefetch">` so the lazy map starts
 *    downloading right after the shell paints instead of after main.js has run
 */
function site(siteUrl: string): Plugin {
  return {
    name: 'guwahati-rent-site',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        let out = html.replaceAll('%SITE_URL%', siteUrl);
        if (ctx.bundle && ctx.filename.endsWith('index.html')) {
          const links = Object.values(ctx.bundle)
            .filter(
              (c) =>
                (c.type === 'chunk' && /^assets\/map-[\w-]+\.js$/.test(c.fileName)) ||
                (c.type === 'asset' && /maplibre-gl-worker/.test(c.fileName)),
            )
            .map((c) => `    <link rel="prefetch" as="script" crossorigin href="/${c.fileName}" />`)
            .join('\n');
          if (links) out = out.replace(/\s*<\/head>/, `\n${links}\n  </head>`);
        }
        return out;
      },
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /unsubscribe.html\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source:
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          // No <lastmod>: the nightly rebuild would stamp every page "changed today", and search
          // engines stop trusting a lastmod that is always new.
          PUBLIC_PAGES.map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`).join('\n') +
          `\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  let siteUrl = (env.VITE_SITE_URL || FALLBACK_SITE_URL).replace(/\/$/, '');
  // A production build must never publish localhost in canonical URLs or the sitemap (a local
  // .env usually sets VITE_SITE_URL=http://localhost:5173). Netlify sets the real origin.
  if (command === 'build' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(siteUrl)) {
    console.warn(
      `VITE_SITE_URL is ${siteUrl}; using ${FALLBACK_SITE_URL} for canonical URLs and sitemap.`,
    );
    siteUrl = FALLBACK_SITE_URL;
  }
  return {
    plugins: [site(siteUrl)],
    build: {
      // MapLibre alone is ~1 MB (≈300 KB gzipped). It is lazy-loaded after first paint (SPEC §8.8).
      chunkSizeWarningLimit: 1300,
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          about: resolve(__dirname, 'about.html'),
          privacy: resolve(__dirname, 'privacy.html'),
          terms: resolve(__dirname, 'terms.html'),
          unsubscribe: resolve(__dirname, 'unsubscribe.html'),
          admin: resolve(__dirname, 'admin.html'),
          // Netlify serves dist/404.html, with status 404, for any path that doesn't exist.
          notFound: resolve(__dirname, '404.html'),
        },
      },
    },
  };
});
