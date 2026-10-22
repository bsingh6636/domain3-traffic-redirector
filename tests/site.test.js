import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { readFileSync } from "node:fs";
import { cleanUrl, generatePassword, textStats } from "../public/tools.js";
import { INDEXABLE_PATHS, adTag, renderSite, sitemap, robots } from "../lambda/site.js";

test("cleaning removes tracking tags but preserves unknown query bytes and fragments", () => {
  const result = cleanUrl("https://example.com/path?utm_source=email&query=a%20b&fbclid=123&query=x+y#chapter");
  assert.equal(result.url, "https://example.com/path?query=a%20b&query=x+y#chapter");
  assert.deepEqual(result.removed, ["utm_source", "fbclid"]);
  assert.equal(cleanUrl("https://example.com/path?utm_source=one&utm_source=two").url, "https://example.com/path");
  assert.equal(cleanUrl("https://example.com/#utm_source=leave").url, "https://example.com/#utm_source=leave");
});

test("signed, authentication and credential URLs are protected", () => {
  for (const suffix of ["X-Amz-Signature=123", "token=secret", "code=login-code", "sig=signed"]) {
    const url = `https://example.com/?utm_source=email&${suffix}`;
    assert.equal(cleanUrl(url).url, url);
    assert.ok(cleanUrl(url).warning);
  }
  assert.throws(() => cleanUrl("https://user:password@example.com"), /usernames/);
  assert.throws(() => cleanUrl("javascript:alert(1)"), /http/);
  assert.throws(() => cleanUrl("not a link"), /complete URL/);
});

test("password generation requires crypto and respects the requested length", () => {
  for (const length of [12, 20, 64]) assert.equal(generatePassword(length, webcrypto).length, length);
  assert.notEqual(generatePassword(32, webcrypto), generatePassword(32, webcrypto));
  assert.throws(() => generatePassword(11, webcrypto), /12 and 64/);
  assert.throws(() => generatePassword(20, {}), /Secure randomness/);
});

test("text counting handles empty, Unicode, multiline and whitespace input", () => {
  assert.deepEqual(textStats(""), { words: 0, characters: 0, lines: 0, readingSeconds: 0 });
  assert.deepEqual(textStats("one two\nthree"), { words: 3, characters: 13, lines: 2, readingSeconds: 1 });
  assert.equal(textStats("😀").characters, 1);
  assert.equal(textStats("a\r\nb\rc\nd").lines, 4);
});

test("all indexed pages render distinct metadata and valid structured data", () => {
  const titles = new Set();
  const xml = sitemap();
  for (const path of INDEXABLE_PATHS) {
    const page = renderSite(path);
    assert.equal(page.statusCode, 200, path);
    assert.doesNotMatch(page.html, /\{\{[A-Z]+\}\}/, path);
    assert.match(page.html, /rel="canonical"/);
    assert.equal((page.html.match(/<h1[ >]/g) || []).length, 1, path);
    const data = JSON.parse(page.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.url, `https://faphouse3.com${path}`);
    assert.ok(xml.includes(data.url), path);
    assert.doesNotMatch(page.html, /window\.location|setInterval|faphouse2/);
    assert.ok(!titles.has(page.title), path);
    titles.add(page.title);
  }
  assert.ok(robots().includes("Sitemap: https://faphouse3.com/sitemap.xml"));
  assert.equal(renderSite("/xmlrpc.php").statusCode, 404);
});

test("internal content links resolve to published pages or shipped assets", () => {
  for (const path of INDEXABLE_PATHS) {
    for (const match of renderSite(path).html.matchAll(/href="(\/[^"#?]*)/g)) {
      const target = match[1];
      assert.ok(INDEXABLE_PATHS.includes(target) || ["/favicon.svg", "/site.css"].includes(target), `${path} -> ${target}`);
    }
  }
});

test("one inline banner appears on every published page by default", () => {
  const previousTag = process.env.AD_TAG_HTML;
  const issuedSource = "https://bauval.org/22/955abbcef9875699b2d2ebba8f8a109d";
  const slot = (html) => html.match(/<div class="ad-frame">([\s\S]*?)<\/div><\/div><\/section>/)[1];
  try {
    process.env.AD_TAG_HTML = '<script>document.write("test-ad")</script>';
    // The supplied tag is inserted verbatim (no HTML escaping, no wrapper frame).
    assert.equal(slot(renderSite("/").html), process.env.AD_TAG_HTML);
    delete process.env.AD_TAG_HTML;
    for (const path of INDEXABLE_PATHS) {
      const html = renderSite(path).html;
      assert.equal(html.split(issuedSource).length - 1, 1, path);
      assert.equal((html.match(/class="ad-frame"/g) || []).length, 1, path);
      assert.match(html, /Advertisement &middot; Adsterra/);
      // Adsterra's loader writes the creative through contentWindow.document of a nested
      // about:blank frame; an opaque-origin (sandboxed srcdoc) wrapper makes that throw.
      assert.ok(!/srcdoc=|sandbox=/.test(html), path);
      const tag = slot(html);
      assert.ok(tag.includes(issuedSource), path);
      assert.match(tag, /'height' : 250/);
      assert.match(tag, /'width' : 300/);
      assert.ok(html.indexOf('class="ad-banner"') < html.indexOf('<h1'), path);
    }
    assert.ok(!renderSite("/missing-page").html.includes(issuedSource));
    assert.match(renderSite("/privacy").html, /https:\/\/adsterra\.com\/privacy-policy\//);
    assert.ok(!/sandboxed frame/.test(renderSite("/privacy").html + renderSite("/about").html + renderSite("/advertise").html));
  } finally {
    if (previousTag === undefined) delete process.env.AD_TAG_HTML; else process.env.AD_TAG_HTML = previousTag;
  }
});

test("the /22/ provider response renders into the registered async container", () => {
  const previousTag = process.env.AD_TAG_HTML;
  delete process.env.AD_TAG_HTML;
  try {
    const tag = adTag();
    const providerResponse = readFileSync(new URL("./fixtures/adsterra-22.js", import.meta.url), "utf8");
    const containers = new Map([...tag.matchAll(/<div id="([^"]+)"/g)].map((match) => [match[1], {
      innerHTML: "", getElementsByTagName: () => []
    }]));
    const context = { document: { getElementById: (id) => containers.get(id) || null } };
    context.window = context;
    // The provider silently leaves the slot blank without the async registration.
    runInNewContext(providerResponse, context);
    assert.ok([...containers.values()].every((container) => !container.innerHTML));
    for (const match of tag.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      runInNewContext(match[1], context);
    }
    const containerId = context.atAsyncContainers?.[context.atOptions.key];
    assert.ok(containers.has(containerId), "Register an existing container before loading /22/");
    runInNewContext(providerResponse, context);
    assert.match(containers.get(containerId).innerHTML, /Ad loader verified/);
  } finally {
    if (previousTag === undefined) delete process.env.AD_TAG_HTML; else process.env.AD_TAG_HTML = previousTag;
  }
});
