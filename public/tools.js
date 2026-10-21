// Pure browser-side utilities. Tool values are never sent to an endpoint.
const TRACKING_KEYS = /^(utm_.+|fbclid|gclid|dclid|msclkid|igshid|mc_cid|mc_eid|_ga|_gl)$/i;
const SENSITIVE_KEYS = /^(x-amz-.+|x-goog-.+|signature|sig|token|access_token|auth|authorization|code|key|api_key|expires|policy)$/i;

export function cleanUrl(input) {
  const raw = String(input).trim();
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("Enter a complete URL starting with https:// or http://."); }
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Only http:// and https:// links are supported.");
  if (parsed.username || parsed.password) throw new Error("Remove usernames and passwords from the link before using this tool.");
  if ([...parsed.searchParams.keys()].some((key) => SENSITIVE_KEYS.test(key))) {
    return { url: raw, removed: [], warning: "This link may contain a signature or access token. It was left unchanged to avoid breaking access. Do not share private links." };
  }
  // Preserve unknown query segments byte-for-byte: reserializing URLSearchParams
  // can change encoding used by application-specific links.
  const fragmentAt = raw.indexOf("#");
  const fragment = fragmentAt < 0 ? "" : raw.slice(fragmentAt);
  const beforeFragment = fragmentAt < 0 ? raw : raw.slice(0, fragmentAt);
  const questionAt = beforeFragment.indexOf("?");
  if (questionAt < 0) return { url: raw, removed: [], warning: "" };
  const removed = [];
  const kept = beforeFragment.slice(questionAt + 1).split("&").filter((part) => {
    let key = part.split("=", 1)[0];
    try { key = decodeURIComponent(key.replace(/\+/g, " ")); } catch { return true; }
    if (!TRACKING_KEYS.test(key)) return true;
    removed.push(key);
    return false;
  });
  return {
    url: beforeFragment.slice(0, questionAt) + (kept.length && kept.join("&") ? `?${kept.join("&")}` : "") + fragment,
    removed,
    warning: ""
  };
}

export function generatePassword(length = 20, cryptoApi = globalThis.crypto) {
  if (!Number.isInteger(length) || length < 12 || length > 64) throw new Error("Choose a length between 12 and 64 characters.");
  if (!cryptoApi?.getRandomValues) throw new Error("Secure randomness is unavailable. Use this tool over HTTPS in a supported browser.");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_=+?";
  const cutoff = 256 - (256 % alphabet.length);
  let password = "";
  while (password.length < length) {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(length * 2));
    for (const byte of bytes) {
      if (byte < cutoff) password += alphabet[byte % alphabet.length];
      if (password.length === length) break;
    }
  }
  return password;
}

export function textStats(value) {
  const text = String(value);
  const words = text.trim() ? text.trim().split(/\s+/u).length : 0;
  return { words, characters: Array.from(text).length, lines: text ? text.split(/\r\n|\r|\n/).length : 0, readingSeconds: Math.ceil(words / 200 * 60) };
}
