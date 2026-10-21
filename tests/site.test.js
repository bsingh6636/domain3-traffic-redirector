import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { cleanUrl, generatePassword, textStats } from "../public/tools.js";
import { INDEXABLE_PATHS, renderSite, sitemap, robots } from "../lambda/site.js";

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

test("configured advertisements appear only in guide placements", () => {
  const previousEnabled = process.env.ADS_ENABLED;
  const previousTag = process.env.AD_TAG_HTML;
  process.env.ADS_ENABLED = "true";
  process.env.AD_TAG_HTML = '<div id="test-ad">Test ad</div>';
  try {
    assert.match(renderSite("/guides/private-browsing").html, /test-ad/);
    for (const path of ["/", "/tools/url-cleaner", "/tools/password-generator", "/tools/text-counter"]) {
      const page = renderSite(path);
      assert.doesNotMatch(page.html, /data-load-ad|test-ad/);
    }
    delete process.env.ADS_ENABLED;
    assert.doesNotMatch(renderSite("/guides/private-browsing").html, /test-ad/);
  } finally {
    if (previousEnabled === undefined) delete process.env.ADS_ENABLED; else process.env.ADS_ENABLED = previousEnabled;
    if (previousTag === undefined) delete process.env.AD_TAG_HTML; else process.env.AD_TAG_HTML = previousTag;
  }
});
