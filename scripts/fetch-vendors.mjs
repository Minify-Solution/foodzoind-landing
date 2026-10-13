#!/usr/bin/env node
/**
 * Build-time snapshot generator for Foodzoid vendors.
 *
 * Calls the private Foodzoid API, keeps only the public display fields, and
 * writes assets/data/vendors.json. The live API is NEVER called from the
 * browser — the committed JSON is what the website reads.
 *
 * Env vars (optional):
 *   FOODZOID_API_BASE      base URL (default http://api.foodzoid.in:8080)
 *   FOODZOID_SITE_ORIGIN   public origin for canonical URLs (default https://foodzoid.in)
 *   FOODZOID_ADMIN_ID      sent as the adminId header when set (future-proofing;
 *                          store as a GitHub secret, never commit it)
 *
 * Usage: node scripts/fetch-vendors.mjs
 */

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = process.env.FOODZOID_API_BASE || 'http://api.foodzoid.in:8080';
// Optional: the endpoints currently work without it, but the backend may
// enforce an adminId header later (other APIs already do). Supplied via env /
// GitHub secret, never hard-coded in the repo.
const ADMIN_ID = process.env.FOODZOID_ADMIN_ID || '';

// Public site origin, used for canonical URLs and the sitemap.
const SITE_ORIGIN = (process.env.FOODZOID_SITE_ORIGIN || 'https://foodzoid.in').replace(/\/$/, '');

// Cities we're expanding to but don't serve yet (shown as "Coming soon").
const COMING_SOON_CITIES = ['Orai', 'Kalpi'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_PATH = resolve(ROOT, 'assets', 'data', 'vendors.json');
const RESTAURANT_DIR = resolve(ROOT, 'restaurant');
const DEEPLINK_DIR = resolve(ROOT, 'v');
const SITEMAP_PATH = resolve(ROOT, 'sitemap.xml');

const TIMEOUT_MS = 20000;

async function apiFetch(path, { method = 'GET', headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { ...(ADMIN_ID ? { adminId: ADMIN_ID } : {}), ...headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`${method} ${path} -> HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getActiveCities() {
  const cities = await apiFetch('/api/v1/city/get-all');
  return (Array.isArray(cities) ? cities : [])
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));
}

async function getVendors(cityId) {
  // pageSize=60 returns the full vendor list (incl. supermarkets) in one call.
  const data = await apiFetch(`/api/v1/vendors/city/${cityId}?pageSize=60`);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items;
}

async function getVendorLink(vendorId) {
  try {
    const r = await apiFetch('/api/v1/vendor-slug/create', {
      method: 'POST',
      headers: { vendorId },
    });
    return { slug: r.slug ?? null, url: r.url ?? null };
  } catch (err) {
    console.warn(`  ! slug failed for ${vendorId}: ${err.message}`);
    return { slug: null, url: null };
  }
}

/** Keep ONLY public, display-safe fields. Everything else is dropped. */
function toPublicVendor(v, link, cityName) {
  return {
    name: v.name ?? '',
    cityName: cityName ?? null,
    logoUrl: v.logoUrl ?? null,
    avgRating: typeof v.avgRating === 'number' ? v.avgRating : null,
    totalRatings: typeof v.totalRatings === 'number' ? v.totalRatings : 0,
    timeToDeliver: v.timeToDeliver ?? null,
    openTime: v.openTime ?? null,
    closeTime: v.closeTime ?? null,
    open: Boolean(v.open) && !v.closed,
    superMarket: Boolean(v.superMarket),
    slug: link.slug,
    url: link.url,
  };
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/** "13:30" -> "01:30 PM" for human-readable hours. */
function formatHours(open, close) {
  const to12 = (t) => {
    if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
    let [h, m] = t.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
  };
  const o = to12(open), c = to12(close);
  return (o && c) ? `${o} – ${c}` : null;
}

/** schema.org opening hours like "Mo-Su 13:30-23:00" (same hours daily). */
function schemaHours(open, close) {
  if (!open || !close) return null;
  return `Mo-Su ${open}-${close}`;
}

/** Builds one crawlable SEO page per vendor. */
function renderVendorPage(v) {
  const type = v.superMarket ? 'Grocery Store' : 'Restaurant';
  const schemaType = v.superMarket ? 'GroceryStore' : 'Restaurant';
  const city = v.cityName || '';
  const title = `${v.name}${city ? `, ${city}` : ''} — Order Online on Foodzoid`;
  const desc = `Order from ${v.name}${city ? ` in ${city}` : ''} on Foodzoid.`
    + (v.timeToDeliver ? ` Delivery in ${v.timeToDeliver}.` : '')
    + (v.avgRating ? ` Rated ${v.avgRating}/5.` : '')
    + ' Fast food & grocery delivery in Rath and Mahoba.';
  const canonical = `${SITE_ORIGIN}/restaurant/${v.slug}/`;
  const orderUrl = v.url || `${SITE_ORIGIN}/`;
  const hoursHuman = formatHours(v.openTime, v.closeTime);

  const ratingSchema = (v.avgRating && v.totalRatings)
    ? `,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "${v.avgRating}",
      "reviewCount": "${v.totalRatings}"
    }`
    : '';
  const hoursSchema = schemaHours(v.openTime, v.closeTime)
    ? `,
    "openingHours": "${schemaHours(v.openTime, v.closeTime)}"`
    : '';

  const jsonLd = `{
    "@context": "https://schema.org",
    "@type": "${schemaType}",
    "name": "${escapeHtml(v.name)}",
    "url": "${canonical}",
    "servesCuisine": "${v.superMarket ? 'Groceries' : 'Indian, Fast Food'}",
    "priceRange": "₹₹",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "${escapeHtml(city)}",
      "addressRegion": "Uttar Pradesh",
      "addressCountry": "IN"
    }${ratingSchema}${hoursSchema}
  }`;

  const logo = v.logoUrl
    ? `<img src="${escapeHtml(v.logoUrl)}" alt="${escapeHtml(v.name)}" class="rest-logo" loading="lazy">`
    : '';
  const ratingLine = v.avgRating
    ? `<span class="rest-stat"><i class="fas fa-star"></i> ${v.avgRating}${v.totalRatings ? ` (${v.totalRatings} ratings)` : ''}</span>`
    : '';
  const deliverLine = v.timeToDeliver
    ? `<span class="rest-stat"><i class="fas fa-clock"></i> ${escapeHtml(v.timeToDeliver)}</span>`
    : '';
  const hoursLine = hoursHuman
    ? `<span class="rest-stat"><i class="fas fa-door-open"></i> ${escapeHtml(hoursHuman)}</span>`
    : '';
  const statusLine = v.open
    ? '<span class="rest-stat open">Open now</span>'
    : '<span class="rest-stat closed">Currently closed</span>';

  return `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(desc)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${canonical}">

    <meta property="og:type" content="website">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(desc)}">
    ${v.logoUrl ? `<meta property="og:image" content="${escapeHtml(v.logoUrl)}">` : ''}
    <meta property="og:url" content="${canonical}">

    <link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">
    <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">

    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="/assets/css/styles.css">
    <link rel="stylesheet" href="/assets/css/legal.css">

    <script type="application/ld+json">
    ${jsonLd}
    </script>
</head>

<body>
    <header class="navbar">
        <div class="container nav-container">
            <a href="/index.html" class="logo">
                <img src="/assets/img/foodzoid-logo.jpg" alt="Foodzoid - Don't starve, just order">
            </a>
            <div class="nav-links">
                <a href="/restaurants.html" class="nav-link"><i class="fas fa-arrow-left"></i> All Restaurants</a>
                <a href="/index.html#download" class="btn btn-primary track-download">Get the App</a>
            </div>
        </div>
    </header>

    <section class="legal-hero">
        <div class="container">
            <h1>${escapeHtml(v.name)}</h1>
            <p>${escapeHtml(type)}${city ? ` in ${escapeHtml(city)}` : ''} · Order online on Foodzoid</p>
        </div>
    </section>

    <section class="legal-section">
        <div class="container">
            <div class="rest-card">
                ${logo}
                <div class="rest-stats">
                    ${ratingLine}
                    ${deliverLine}
                    ${hoursLine}
                    ${statusLine}
                </div>
                <p class="rest-copy">
                    Craving ${escapeHtml(v.name)}? Order ${v.superMarket ? 'groceries and daily essentials' : 'your favourite dishes'}
                    from ${escapeHtml(v.name)}${city ? ` in ${escapeHtml(city)}` : ''} and get them delivered to your door with Foodzoid.
                </p>
                <a href="${escapeHtml(orderUrl)}" class="btn btn-primary rest-order track-outbound">
                    Order on the Foodzoid app <i class="fas fa-arrow-right"></i>
                </a>
                <p class="rest-hint"><i class="fas fa-circle-info"></i> Don't have the Foodzoid app yet? Download it first using the buttons below.</p>
                <div class="store-buttons rest-store-buttons">
                    <a href="https://apps.apple.com/in/app/foodzoid/id6757634594" class="store-btn track-download">
                        <i class="fab fa-apple"></i>
                        <div class="store-text"><span>Download on the</span><strong>App Store</strong></div>
                    </a>
                    <a href="https://play.google.com/store/apps/details?id=com.foodzoid.customerapp&hl=en_IN" class="store-btn track-download">
                        <i class="fab fa-google-play"></i>
                        <div class="store-text"><span>GET IT ON</span><strong>Google Play</strong></div>
                    </a>
                </div>
                <p class="rest-back"><a href="/restaurants.html">&larr; Browse all restaurants &amp; stores</a></p>
            </div>
        </div>
    </section>

    <footer>
        <div class="container footer-grid">
            <div class="footer-brand">
                <h2>Foodzoid</h2>
                <p>Your official food and grocery delivery partner in Rath and Mahoba.</p>
            </div>
            <div class="footer-contact">
                <h3>Contact Us</h3>
                <a href="tel:+918429974173" class="contact-link"><i class="fas fa-phone-alt"></i> +91 8429974173</a>
                <a href="mailto:support@foodzoid.in" class="contact-link"><i class="fas fa-envelope"></i> support@foodzoid.in</a>
            </div>
            <div class="footer-social">
                <h3>Company</h3>
                <div class="footer-legal">
                    <a href="/restaurants.html">Restaurants &amp; Stores</a>
                    <a href="/partners.html">Partner with us</a>
                    <a href="/privacy-policy.html">Privacy Policy</a>
                    <a href="/refund-policy.html">Refund Policy</a>
                    <a href="/cancellation-policy.html">Cancellation Policy</a>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 Foodzoid. All rights reserved.</p>
        </div>
    </footer>
</body>

</html>
`;
}

/**
 * Fallback page served at /v/{slug}/ by GitHub Pages for users WITHOUT the app.
 *
 * How this interacts with the mobile apps:
 * - App installed: Android App Links / iOS Universal Links intercept the
 *   /v/{slug} URL at the OS level BEFORE the browser loads anything, opening
 *   the app directly. This file is never seen by those users.
 * - App NOT installed (and all desktop): the browser loads this page, which
 *   redirects to the restaurant's SEO page (store buttons + menu info) instead
 *   of GitHub Pages' default 404.
 * noindex: the canonical content lives at /restaurant/{slug}/, so we don't
 * want /v/{slug} competing in search.
 */
function renderDeepLinkFallback(v) {
  const restUrl = `${SITE_ORIGIN}/restaurant/${v.slug}/`;
  const appStore = 'https://apps.apple.com/in/app/foodzoid/id6757634594';
  const playStore = 'https://play.google.com/store/apps/details?id=com.foodzoid.customerapp&hl=en_IN';
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, follow">
    <title>Download the Foodzoid app to order ${escapeHtml(v.name)}</title>
    <link rel="canonical" href="${restUrl}">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="/assets/css/styles.css">
    <link rel="stylesheet" href="/assets/css/legal.css">
</head>
<body>
    <section class="legal-section" style="min-height:100vh;display:flex;align-items:center">
        <div class="container">
            <div class="rest-card">
                <img src="/assets/img/favicon.png" alt="Foodzoid" class="rest-logo">
                <h1 style="font-size:1.5rem">Download the Foodzoid app to order</h1>
                <p class="rest-copy">
                    <strong>${escapeHtml(v.name)}</strong> is available on the Foodzoid app.
                    Install the app to place your order, or view the details below.
                </p>
                <div class="store-buttons rest-store-buttons">
                    <a href="${appStore}" class="store-btn track-download">
                        <i class="fab fa-apple"></i>
                        <div class="store-text"><span>Download on the</span><strong>App Store</strong></div>
                    </a>
                    <a href="${playStore}" class="store-btn track-download">
                        <i class="fab fa-google-play"></i>
                        <div class="store-text"><span>GET IT ON</span><strong>Google Play</strong></div>
                    </a>
                </div>
                <p class="rest-back"><a href="${restUrl}">View ${escapeHtml(v.name)} details &rarr;</a></p>
            </div>
        </div>
    </section>
</body>
</html>
`;
}

/** Writes a crawlable page + a /v/ deep-link fallback per vendor. */
async function generateSeoPages(result) {
  // Clean previous generation so delisted vendors don't linger.
  await rm(RESTAURANT_DIR, { recursive: true, force: true });
  await rm(DEEPLINK_DIR, { recursive: true, force: true });
  await mkdir(RESTAURANT_DIR, { recursive: true });
  await mkdir(DEEPLINK_DIR, { recursive: true });

  const urls = [];
  let fallbacks = 0;
  for (const city of result.cities) {
    for (const v of city.vendors) {
      if (!v.slug) continue; // need a slug to form a stable URL

      // Crawlable SEO page: /restaurant/{slug}/
      const restDir = resolve(RESTAURANT_DIR, v.slug);
      await mkdir(restDir, { recursive: true });
      await writeFile(resolve(restDir, 'index.html'), renderVendorPage(v), 'utf8');
      urls.push(`${SITE_ORIGIN}/restaurant/${v.slug}/`);

      // Deep-link fallback at /v/{slug}/ (directory form so GitHub Pages serves
      // it as text/html; a flat extensionless file is served as
      // application/octet-stream and downloads in the browser instead).
      const vDir = resolve(DEEPLINK_DIR, v.slug);
      await mkdir(vDir, { recursive: true });
      await writeFile(resolve(vDir, 'index.html'), renderDeepLinkFallback(v), 'utf8');
      fallbacks++;
    }
  }
  console.log(`Generated ${urls.length} restaurant SEO pages and ${fallbacks} /v/ fallbacks.`);
  return urls;
}

/** Rebuilds sitemap.xml: static pages + every restaurant page. */
async function writeSitemap(restaurantUrls) {
  const today = new Date().toISOString().slice(0, 10);
  const staticPages = [
    { loc: `${SITE_ORIGIN}/`, changefreq: 'weekly', priority: '1.0' },
    { loc: `${SITE_ORIGIN}/restaurants.html`, changefreq: 'daily', priority: '0.8' },
    { loc: `${SITE_ORIGIN}/partners.html`, changefreq: 'monthly', priority: '0.6' },
    { loc: `${SITE_ORIGIN}/vendor-delete-account.html`, changefreq: 'yearly', priority: '0.3' },
    { loc: `${SITE_ORIGIN}/privacy-policy.html`, changefreq: 'yearly', priority: '0.5' },
    { loc: `${SITE_ORIGIN}/refund-policy.html`, changefreq: 'yearly', priority: '0.5' },
    { loc: `${SITE_ORIGIN}/cancellation-policy.html`, changefreq: 'yearly', priority: '0.5' },
  ];
  const entry = (loc, changefreq, priority) =>
    `   <url>\n      <loc>${loc}</loc>\n      <lastmod>${today}</lastmod>\n`
    + `      <changefreq>${changefreq}</changefreq>\n      <priority>${priority}</priority>\n   </url>`;

  const body = [
    ...staticPages.map((p) => entry(p.loc, p.changefreq, p.priority)),
    ...restaurantUrls.map((u) => entry(u, 'daily', '0.7')),
  ].join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  await writeFile(SITEMAP_PATH, xml, 'utf8');
  console.log(`Wrote sitemap with ${staticPages.length + restaurantUrls.length} URLs.`);
}

async function main() {
  console.log(`Fetching from ${API_BASE} ...`);
  const cities = await getActiveCities();
  console.log(`Active cities: ${cities.map((c) => c.name).join(', ')}`);

  const result = {
    generatedAt: new Date().toISOString(),
    cities: [],
    comingSoon: COMING_SOON_CITIES,
  };

  for (const city of cities) {
    console.log(`\nCity: ${city.name} (${city.id})`);
    const vendors = await getVendors(city.id);
    console.log(`  vendors: ${vendors.length}`);

    const publicVendors = [];
    for (const v of vendors) {
      // Only publish active vendors; closed ones still shown but flagged.
      if (v.active === false) continue;
      const link = await getVendorLink(v.id);
      publicVendors.push(toPublicVendor(v, link, city.name));
    }

    // Sort: open first, then by rating desc.
    publicVendors.sort((a, b) => {
      if (a.open !== b.open) return a.open ? -1 : 1;
      return (b.avgRating ?? 0) - (a.avgRating ?? 0);
    });

    result.cities.push({
      id: city.id,
      name: city.name,
      vendorCount: publicVendors.length,
      vendors: publicVendors,
    });
  }

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(result, null, 2) + '\n', 'utf8');
  const total = result.cities.reduce((n, c) => n + c.vendorCount, 0);
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(`Total vendors across ${result.cities.length} cities: ${total}`);

  // Generate crawlable per-restaurant SEO pages + sitemap.
  const restaurantUrls = await generateSeoPages(result);
  await writeSitemap(restaurantUrls);
}

main().catch((err) => {
  console.error('Snapshot failed:', err.message);
  process.exit(1);
});
