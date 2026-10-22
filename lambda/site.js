import { readFileSync } from "node:fs";
import { GUIDES, guideCards } from "./content.js";

export const TOOL_PAGES = {
  "/tools/url-cleaner": { title: "URL Cleaner", description: "Remove UTM tags and common tracking parameters from a URL, while preserving useful query parameters. Runs in your browser.", icon: "↗", note: "Share the destination. Leave the tracking behind." },
  "/tools/password-generator": { title: "Random Password Generator", description: "Generate a random 12–64 character password with your browser’s cryptographic random source. No account or upload required.", icon: "✳", note: "A fresh password, generated on your device." },
  "/tools/text-counter": { title: "Word & Character Counter", description: "Count words, characters, lines, and estimated reading time without uploading your text. Free, browser-based text counter.", icon: "Aa", note: "Know your words. Keep your text to yourself." }
};
const INFO = {
  "/about": { title: "About QuietTab", description: "What QuietTab does, how our browser tools work, and how advertising supports our original privacy guides." },
  "/privacy": { title: "Privacy & Advertising", description: "How QuietTab handles browser-tool input, server analytics, visitor cookies, and third-party advertisements." },
  "/advertise": { title: "Advertise on QuietTab", description: "Information about QuietTab’s audience, display advertising placements, and sponsorship standards." }
};
export const INDEXABLE_PATHS = ["/", "/tools", ...Object.keys(TOOL_PAGES), "/guides", ...Object.keys(GUIDES), ...Object.keys(INFO)];
const template = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const e = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

export function siteConfig() {
  let url;
  try {
    url = new URL(process.env.SITE_URL || `https://${process.env.INGRESS_DOMAIN || "faphouse3.com"}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid SITE_URL");
  } catch { throw new Error("SITE_URL must be a public http(s) origin, without credentials."); }
  return { name: "QuietTab", origin: url.origin, domain: url.hostname, analytics: process.env.ANALYTICS_ENABLED !== "false", ads: Boolean(adTag()) };
}

export function adTag() {
  if (process.env.AD_TAG_HTML?.trim()) return process.env.AD_TAG_HTML.trim();
  try { return readFileSync(new URL("../public/ad-tag.html", import.meta.url), "utf8").trim(); } catch { return ""; }
}

function advertisement() {
  if (!siteConfig().ads) return "";
  // The provider tag runs inline, as Adsterra's integration expects. Wrapping it in an
  // opaque-origin (sandboxed srcdoc) frame breaks rendering: the loader writes the creative
  // into a nested about:blank frame via contentWindow.document, which the browser blocks
  // across opaque origins ("Blocked a frame with origin null"). The slot keeps a fixed
  // 300x250 box so an empty or slow response does not shift page content.
  return `<section class="ad-banner" aria-label="Advertisement"><div class="ad-slot"><span class="ad-label">Advertisement &middot; Adsterra</span><div class="ad-frame">${adTag()}</div></div></section>`;
}

function cleaner() {
  return `<div class="tool-shell" id="link-cleaner"><div class="tool-top"><span class="tool-icon" aria-hidden="true">↗</span><span class="pill">START HERE · FREE TOOL</span></div><h2>Clean up a link.</h2><p class="tool-intro">Remove common tracking tags before you share.</p><form id="cleaner-form"><label for="url-input">Paste your URL</label><div class="input-row"><input id="url-input" name="url" type="url" autocomplete="off" spellcheck="false" placeholder="https://example.com/?utm_source=…" required><button class="button" type="submit">Clean link <span aria-hidden="true">↗</span></button></div><div class="form-actions"><button class="text-button" id="try-example" type="button">Try an example</button><button class="text-button" id="clear-url" type="button">Clear</button></div></form><p class="status" id="cleaner-status" role="status" aria-live="polite"></p><div id="cleaner-result" class="result" hidden><label for="url-output">Your cleaned link</label><input id="url-output" type="text" readonly><button id="copy-url" class="button small secondary" type="button" disabled>Copy clean link</button></div><div class="tool-note">✓ Processed in your browser. Your pasted link is not uploaded.</div><noscript><p>Enable JavaScript to clean a link. You can still read all our guides without it.</p></noscript></div>`;
}

function passwordTool() {
  return `<div class="tool-shell" id="password-generator"><div class="tool-top"><span class="tool-icon" aria-hidden="true">✳</span><span class="pill">ON-DEVICE GENERATION</span></div><h2>Make your next password different.</h2><p class="tool-intro">Random characters from your browser’s cryptographic random source.</p><form id="password-form"><label for="password-length">Password length: <span id="length-value">20</span> characters</label><input id="password-length" type="range" min="12" max="64" value="20"><button type="submit" class="button">Generate password <span aria-hidden="true">↻</span></button></form><div class="password-result"><input id="password-output" type="text" readonly aria-label="Generated password" autocomplete="off" spellcheck="false" placeholder="Your new password will appear here"><button id="copy-password" class="button secondary" type="button" disabled>Copy</button></div><button type="button" class="text-button" id="clear-password">Clear password</button><p id="password-status" class="status" role="status" aria-live="polite"></p><div class="tool-note">Never enter an existing password here. Generated values stay on this page; copying also puts them on your device’s clipboard.</div><noscript><p>Enable JavaScript to generate a password.</p></noscript></div>`;
}

function counterTool() {
  return `<div class="tool-shell"><div class="tool-top"><span class="tool-icon" aria-hidden="true">Aa</span><span class="pill">NO UPLOAD</span></div><h2>A little clarity for your copy.</h2><p class="tool-intro">A whitespace-based word count and Unicode code-point character count.</p><label for="text-input">Your text</label><textarea id="text-input" placeholder="Start typing or paste your text…" spellcheck="false"></textarea><div class="stat-grid" aria-live="polite"><div><strong data-stat="words">0</strong>words</div><div><strong data-stat="characters">0</strong>characters</div><div><strong data-stat="lines">0</strong>lines</div><div><strong data-stat="readingSeconds">0</strong>seconds to read</div></div><button type="button" class="text-button" id="clear-text">Clear text</button><div class="tool-note">Your text stays in this browser tab. Reading time is an estimate at 200 words per minute.</div><noscript><p>Enable JavaScript for live counts.</p></noscript></div>`;
}

function toolCards() {
  return `<div class="card-grid">${Object.entries(TOOL_PAGES).map(([href, tool]) => `<a class="card" href="${href}"><span class="icon" aria-hidden="true">${tool.icon}</span><h3>${tool.title}</h3><p>${tool.note}</p><span class="card-link">Open tool <span aria-hidden="true">↗</span></span></a>`).join("")}</div>`;
}
function guides() {
  return `<div class="card-grid">${guideCards.map((guide, i) => `<a class="card guide-card" href="${guide.href}"><div class="guide-art" aria-hidden="true"><span>${["◒", "↗", "✳"][i]}</span></div><div class="card-body"><div class="meta">${e(guide.category)} · ${e(guide.readTime)}</div><h3>${e(guide.title)}</h3><p>${e(guide.description)}</p><span class="card-link">Read the guide <span aria-hidden="true">↗</span></span></div></a>`).join("")}</div>`;
}
function sectionHeading(kicker, title, description) {
  return `<div class="section-heading"><div><div class="eyebrow">${kicker}</div><h2>${title}</h2></div><p>${description}</p></div>`;
}
function home() {
  return `<section class="hero"><div><div class="eyebrow">SMALL TOOLS. BETTER BROWSING.</div><h1>A little less tracking.<br><em>A little more peace.</em></h1><p>Clean a link. Make a stronger password. Understand what private browsing actually does. Practical tools for your everyday internet.</p><a class="button" href="#tools">Find your next useful tool <span aria-hidden="true">↗</span></a><div class="hero-points"><span>Free to use</span><span>No account needed</span><span>Inputs stay on your device</span></div></div>${cleaner()}</section><section class="section" id="tools">${sectionHeading("YOUR EVERYDAY TOOLKIT", "Less fuss. More useful.", "Three simple tools. Open one, get what you need, and carry on.")}${toolCards()}</section><section class="section" id="guides">${sectionHeading("GOOD TO KNOW", "A calmer corner of the internet.", "Straightforward reading for the things browser settings don’t always explain.")}${guides()}</section><section class="promise"><div><h2>Useful by design. Quiet by choice.</h2><p>No account to create and no countdown to sit through. Our tools process your input on your device. Our privacy page explains the server analytics separately.</p></div><a href="/privacy">Read our privacy approach ↗</a></section>`;
}

function infoBody(path) {
  if (path === "/about") return `<h2>Small tools for everyday browsing</h2><p>QuietTab is a small collection of browser tools and practical explanations. We focus on tasks you can finish in a minute: removing familiar campaign tags before sharing a link, generating a fresh random password, or checking the length of a piece of text.</p><p>The tools run in your browser. Their input is not submitted to our server, saved in local storage, or added to analytics. Our guides explain the limits as well as the benefits: a clean link does not make browsing anonymous, and a private window does not hide activity from every observer.</p><h2>How the site is supported</h2><p>One clearly marked banner appears near the top of our homepage, tools, guides, and information pages. The advertising provider’s script runs on the page; our privacy page explains what that means. We do not sell a ranking position in the guides, or require an ad click to use a tool.</p><h2>Our approach to guides</h2><p>Our guides link to browser documentation and technical standards so you can check the underlying advice. Browser interfaces change; the linked official documentation is the best place to verify a setting for your version. We make no promise of anonymity or account security.</p><h2>A new purpose for this domain</h2><p>This domain previously served a redirect notice. QuietTab is now a standalone tools and guides site, with its own purpose and branding. It does not automatically send visitors to the former destination.</p><p><a href="/tools">Explore the tools</a> or <a href="/guides">start with a guide</a>.</p>`;
  if (path === "/privacy") return `<p class="notice">Last updated: 22 October 2026. This page describes this site’s implemented behavior.</p><h2>What stays in your browser</h2><p>Pasted links, generated passwords, and text-counter input are processed in your browser. The tools do not upload those values, store them in local storage, or send them as analytics events. Advertising code from our provider runs on the same page as the tools, so keep sensitive values out of the address bar or URL query string, and clear a tool’s field after you have copied its result.</p><h2>Server analytics and cookies</h2><p>When analytics is enabled, our server records page requests in MongoDB. Records may include the source IP address, the requested page path, browser user agent, the referring site’s origin, timestamp, IP-derived location (country, city, region, timezone, postal code, and approximate coordinates) when supplied by our hosting proxy, and an estimated bot/device classification. Query-string values are not saved. Bot detection is a heuristic, not proof that a request came from a person.</p><p>We use first-party <code>fh3_vid</code> and <code>fh3_vc</code> cookies to recognize a returning browser and carry its pageview count for up to one year. A cookie is not a verified person or a cross-device identity. Clearing site cookies resets that identity. Your browser may send additional information to the hosting infrastructure, which can maintain its own operational logs.</p><h2>Advertising</h2><p>Our homepage, tools, guides, and information pages load an Adsterra banner using the provider’s script, which runs on the page itself. The provider may receive your IP address, the page address, and browser information, and may use its own cookies or identifiers. Our own code never sends your pasted links, text, or generated passwords to the provider, but a third-party script on the same page is not technically prevented from reading the page, so we do not describe the ads as isolated from the tools. Advertising does not change your access to any guide or tool.</p><p>Where Adsterra is the configured provider, read its <a href="https://adsterra.com/privacy-policy/" rel="noopener noreferrer">privacy information</a> and <a href="https://adsterra.com/" rel="noopener noreferrer">website</a>. Other providers must be identified here before being activated. Consent choices, where required by the provider or for your location, must be available before the corresponding ad technology is enabled.</p><h2>Storage and control</h2><p>You can clear the site’s cookie using your browser settings. Browser clipboard contents are managed by your device, so copying a result can make it available to other apps with clipboard access. Use your browser or device controls to clear the clipboard when needed.</p><p>Server analytics has no automated expiry unless the site operator configures MongoDB’s retention policy. A published retention promise must match that database configuration. We do not promise that external hosting logs are removed when a browser cookie is cleared.</p><h2>Contact</h2>${contactParagraph()}<p><a href="/about">About this site</a></p>`;
  return `<h2>A focused tools and reading site</h2><p>QuietTab offers browser-based utilities and original guides on cleaner links, private browsing, and stronger account habits. Our audience figures are still being established; we do not describe raw requests, crawler hits, or distinct IPs as verified people.</p><h2>Display placements</h2><p>We show one clearly labelled 300 × 250 display placement near the top of every published page, including the homepage. Ads do not cover content or navigation, trigger automatic redirects, or prevent people from using the site.</p><h2>Editorial independence</h2><p>Advertisements and any future sponsored links will be labelled. Buying a placement does not buy a recommendation or a favorable review. We do not publish fabricated reviews, audience claims, or performance guarantees.</p><h2>Inquiries</h2>${contactParagraph()}<p>Network placements must be approved for this exact domain and content. Available formats, pricing, and eligibility depend on the provider’s review.</p>`;
}
function contactParagraph() {
  const email = process.env.CONTACT_EMAIL || "";
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email)
    ? `<p>Contact the site operator at <a href="mailto:${e(email)}">${e(email)}</a>.</p>`
    : `<p>Direct advertising inquiries are not open yet. A site-operator contact address will be published here when available.</p>`;
}

function aside() {
  return `<aside class="aside"><div class="aside-box"><div class="eyebrow">PUT IT INTO PRACTICE</div><h2>A small step starts here.</h2><a href="/tools/url-cleaner">Clean a link &nearr;</a><a href="/tools/password-generator">Make a random password &nearr;</a><a href="/tools/text-counter">Count your words &nearr;</a></div></aside>`;
}

export function renderSite(path) {
  const config = siteConfig();
  let title, description, content, type = "WebPage", statusCode = 200;
  if (path === "/") {
    title = "Free Browser Privacy Tools & Practical Guides";
    description = "Clean tracking links, generate random passwords, and count text in your browser. Free tools and practical guides to private browsing. No account needed.";
    content = home();
  } else if (path === "/tools" || path === "/guides") {
    const isTools = path === "/tools";
    title = isTools ? "Free Browser Tools" : "Practical Browser Privacy Guides";
    description = isTools ? "Useful browser-based tools: URL tracking cleaner, random password generator, and word counter. Your inputs stay in your browser." : "Read original guides to private browsing, tracking links, and strong passwords, with explanations of their limits and links to official sources.";
    content = `<div class="page-head"><div class="eyebrow">${isTools ? "YOUR EVERYDAY TOOLKIT" : "GOOD TO KNOW"}</div><h1>${title}</h1><p>${description}</p></div><section class="section">${isTools ? toolCards() : guides()}</section>`;
  } else if (TOOL_PAGES[path]) {
    const tool = TOOL_PAGES[path];
    title = tool.title;
    description = tool.description;
    type = "WebApplication";
    const body = path === "/tools/url-cleaner" ? cleaner() : path === "/tools/password-generator" ? passwordTool() : counterTool();
    const explanation = path === "/tools/url-cleaner" ? `<h2>What this URL cleaner removes</h2><p>The cleaner removes familiar campaign tags beginning with <code>utm_</code>, plus common click identifiers such as <code>fbclid</code>, <code>gclid</code>, and <code>msclkid</code>. Other parameters and URL fragments are preserved.</p><h2>When to keep the original link</h2><p>Signed download links, login links, and URLs containing access tokens may stop working if edited. We leave recognized signed or authentication links unchanged. Unknown tracking systems can remain. Check that the cleaned link still reaches the page you intended before sharing it.</p><p>A cleaner link does not conceal your IP address, delete cookies, or prevent a destination from observing your visit. <a href="/guides/clean-tracking-links">Read the complete tracking-link guide →</a></p>` : path === "/tools/password-generator" ? `<h2>How random passwords are generated</h2><p>This tool uses your browser’s <code>crypto.getRandomValues()</code> API and rejection sampling to select characters without modulo bias. It does not use <code>Math.random()</code> or a remote password service. Choose a length from 12 to 64 characters; the default is 20.</p><h2>Use a unique password for every account</h2><p>A random string only helps if it is not reused. Save it in a password manager and turn on a second authentication factor when offered. Each account may have its own password rules; check those requirements. A password manager’s built-in generator is a good choice for important accounts because it can save the result directly.</p><p>No strength rating or security guarantee is implied. Clear this page after saving the result and manage your clipboard separately. <a href="/guides/strong-passwords">Read our password guide →</a></p>` : `<h2>How the count works</h2><p>Words are whitespace-separated tokens. Characters are counted as Unicode code points, including spaces and punctuation. A visible emoji can contain several code points, so the count may differ from an editor’s count of visible symbols. Line breaks support Windows, macOS, and Unix-style text.</p><h2>Reading time is an estimate</h2><p>The estimate assumes 200 words per minute. Technical terms, formatting, language, and reading style can change the actual time. This tool does not identify the language or send text to an analysis service.</p><p>Use it for a draft, a short bio, or social copy. Check any platform’s own limit before publishing because platforms can count links and emoji differently.</p>`;
    content = `<div class="page-head"><div class="breadcrumbs"><a href="/">Home</a> / <a href="/tools">Tools</a> / ${title}</div><h1>${title}</h1><p>${description}</p></div><section class="tool-page">${body}</section><section class="explanation">${explanation}</section><section class="section">${sectionHeading("KEEP EXPLORING", "One more useful thing.", "More tools that work right in your browser.")}${toolCards()}</section>`;
  } else if (GUIDES[path]) {
    const guide = GUIDES[path];
    title = guide.title;
    description = guide.description;
    type = "Article";
    content = `<div class="page-head"><div class="breadcrumbs"><a href="/">Home</a> / <a href="/guides">Guides</a></div><div class="eyebrow" style="margin-top:25px">${e(guide.category)} · ${e(guide.readTime)}</div><h1>${e(title)}</h1><p>${e(description)}</p></div><div class="content-layout"><article class="article">${guide.body}<p class="meta">Published 22 October 2026 · QuietTab</p></article>${aside()}</div>`;
  } else if (INFO[path]) {
    ({ title, description } = INFO[path]);
    content = `<div class="page-head"><div class="eyebrow">QUIETTAB</div><h1>${e(title)}</h1><p>${e(description)}</p></div><div class="content-layout"><article class="article">${infoBody(path)}</article>${aside()}</div>`;
  } else {
    title = "Page not found";
    description = "This page is not part of QuietTab. Explore our free browser tools and privacy guides.";
    statusCode = 404;
    content = `<section class="error-page"><div class="eyebrow">404 · A QUIETER DEAD END</div><h1>This tab took a wrong turn.</h1><p>That page is not here. Start with our tools or find a useful guide.</p><a class="button" href="/">Back to QuietTab ↗</a></section>`;
  }
  const canonical = `${config.origin}${path}`;
  const structured = { "@context": "https://schema.org", "@type": type, name: `${title} | QuietTab`, description, url: canonical, inLanguage: "en", ...(type === "WebApplication" ? { applicationCategory: "UtilitiesApplication", operatingSystem: "Any", isAccessibleForFree: true } : {}), ...(type === "Article" ? { headline: title, datePublished: "2026-10-22", author: { "@type": "Organization", name: "QuietTab", url: `${config.origin}/about` } } : {}) };
  const replacements = {
    TITLE: e(`${title} | QuietTab`), DESCRIPTION: e(description), CANONICAL: e(canonical),
    ROBOTS: statusCode === 200 ? "index,follow" : "noindex,follow",
    STRUCTURED: json(structured), CONTENT: (statusCode === 200 ? advertisement() : "") + content,
    CONFIG: json({ siteName: config.name, serverTracking: true }),
    YEAR: "2026"
  };
  const html = template.replace(/\{\{([A-Z]+)\}\}/g, (_, key) => replacements[key] ?? "");
  return { html, statusCode, title, path, isTool: Boolean(TOOL_PAGES[path]) || path === "/" };
}

export function sitemap() {
  const { origin } = siteConfig();
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${INDEXABLE_PATHS.map((path) => `<url><loc>${e(origin + path)}</loc><lastmod>2026-10-22</lastmod></url>`).join("")}</urlset>`;
}

export function robots() {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${siteConfig().origin}/sitemap.xml\n`;
}
