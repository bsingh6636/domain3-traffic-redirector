import { cleanUrl, generatePassword, textStats } from "/tools.js";

function announce(element, text) { if (element) element.textContent = text; }
async function copyText(value, status) {
  try {
    await navigator.clipboard.writeText(value);
    announce(status, "Copied to clipboard.");
  } catch { announce(status, "Copy is unavailable here. Select the result and copy it manually."); }
}

const cleaner = document.querySelector("#cleaner-form");
if (cleaner) {
  const input = document.querySelector("#url-input");
  const output = document.querySelector("#url-output");
  const status = document.querySelector("#cleaner-status");
  const result = document.querySelector("#cleaner-result");
  const copy = document.querySelector("#copy-url");
  cleaner.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const cleaned = cleanUrl(input.value);
      output.value = cleaned.url;
      result.hidden = false;
      copy.disabled = false;
      announce(status, cleaned.warning || (cleaned.removed.length ? `Removed ${cleaned.removed.length} tracking parameter${cleaned.removed.length === 1 ? "" : "s"}: ${cleaned.removed.join(", ")}.` : "No recognized tracking parameters found. Your link is unchanged."));
    } catch (error) {
      result.hidden = true;
      copy.disabled = true;
      announce(status, error.message);
    }
  });
  document.querySelector("#try-example").addEventListener("click", () => {
    input.value = "https://example.com/article?utm_source=newsletter&utm_medium=email&topic=privacy#tips";
    input.focus();
  });
  copy.addEventListener("click", () => copyText(output.value, status));
  document.querySelector("#clear-url").addEventListener("click", () => {
    input.value = "";
    output.value = "";
    result.hidden = true;
    copy.disabled = true;
    announce(status, "Cleared.");
    input.focus();
  });
}

const passwordForm = document.querySelector("#password-form");
if (passwordForm) {
  const input = document.querySelector("#password-length");
  const output = document.querySelector("#password-output");
  const status = document.querySelector("#password-status");
  const copy = document.querySelector("#copy-password");
  input.addEventListener("input", () => announce(document.querySelector("#length-value"), input.value));
  passwordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      output.value = generatePassword(Number(input.value));
      copy.disabled = false;
      announce(status, "Generated on your device. Save it in your password manager before clearing this page.");
    } catch (error) { announce(status, error.message); }
  });
  copy.addEventListener("click", () => copyText(output.value, status));
  document.querySelector("#clear-password").addEventListener("click", () => { output.value = ""; copy.disabled = true; announce(status, "Password cleared from this page. Your clipboard is not cleared."); });
  window.addEventListener("pagehide", () => { output.value = ""; });
}

const textInput = document.querySelector("#text-input");
if (textInput) {
  const update = () => {
    const stats = textStats(textInput.value);
    for (const [key, value] of Object.entries(stats)) announce(document.querySelector(`[data-stat="${key}"]`), String(value));
  };
  textInput.addEventListener("input", update);
  document.querySelector("#clear-text").addEventListener("click", () => { textInput.value = ""; update(); textInput.focus(); });
  update();
}

