/** Original editorial content. Body HTML is trusted, repository-owned markup. */
export const GUIDES = {
  '/guides/private-browsing': {
    title: 'What private browsing actually protects',
    description: 'Use Incognito, InPrivate, and private windows with a clear understanding of local history, downloads, accounts, and network visibility.',
    category: 'Browser basics',
    readTime: '4 min read',
    body: `
      <p class="article-lead">A private window is useful when you want a temporary browser session. It is especially handy for checking a second account or looking up a gift on a shared device. The important question is who you want privacy from: someone using the same browser later, the website itself, or the organization running your network.</p>
      <h2>Start with a separate session</h2>
      <p>In Chrome, open the three-dot menu and choose <strong>New Incognito window</strong>. The desktop shortcut is Ctrl + Shift + N on Windows or Command + Shift + N on Mac. Look for the Incognito indicator before entering an address; opening another ordinary tab does not activate the mode. Chrome starts a separate session and removes its temporary site data when all Incognito windows close. See <a href="https://support.google.com/chrome/answer/95464?hl=en" target="_blank" rel="noopener noreferrer">Google's Incognito instructions</a>.</p>
      <p>Imagine you want to check how a public profile looks without your normal account's preferences. Open the private window first, then type the profile's public address. Signing into that account again changes the experiment: you have identified yourself to the service. A private window can separate browser sessions, but it cannot make an action performed inside your signed-in account anonymous.</p>
      <h2>Use the browser's own controls</h2>
      <p>In Firefox, open the menu and select <strong>New private window</strong>. The purple mask helps distinguish it from normal browsing. Private cookies are separate from ordinary cookies and are discarded at the end of the private session. Firefox also applies tracking protections, although these do not remove every possible way a site can recognize activity. <a href="https://support.mozilla.org/en-US/kb/private-browsing-use-firefox-without-history" target="_blank" rel="noopener noreferrer">Mozilla explains its private-window behavior</a>.</p>
      <p>In Edge, open <strong>Settings and more</strong> and choose <strong>New InPrivate window</strong>. Edge removes the session's browsing history and temporary site data when you close all InPrivate windows. Favorites and files you deliberately download remain. Extensions allowed to run InPrivate may also access information, so inspect those permissions rather than assuming extensions disappear. Read <a href="https://support.microsoft.com/en-us/edge/browse-inprivate-in-microsoft-edge" target="_blank" rel="noopener noreferrer">Microsoft's InPrivate documentation</a> for the distinctions.</p>
      <h2>Finish the session deliberately</h2>
      <ol>
        <li>Complete the task, then sign out if you used an account on someone else's computer.</li>
        <li>Close every private window, including any hiding behind the main window. A remaining window can keep the session open.</li>
        <li>Check the Downloads folder for files you saved. Closing the browser does not delete those files.</li>
        <li>Remove bookmarks you created if you did not intend to leave them behind.</li>
      </ol>
      <p>For a shared family computer, make this a repeatable habit rather than a last-minute cleanup. Start the task in the correct window, avoid saving files unnecessarily, and finish before handing over the device. If you need ongoing separation for work and personal browsing, consider separate browser profiles or separate operating-system accounts instead of depending on a temporary window every day.</p>
      <h2>Keep the limits in view</h2>
      <p>Private browsing does not hide your IP address from a destination website. Your internet provider, school, or employer may still observe network activity; the exact detail depends on encryption and their systems. It also does not protect an already compromised computer from spyware or someone watching the screen. A private-window badge is not a malware scan, an encrypted tunnel, or a guarantee of anonymity.</p>
      <p>Before a sensitive task, ask three practical questions: Is this a device I trust? Am I about to identify myself by logging in? Will I leave a file behind? Those answers are more useful than treating the word “private” as a universal promise. Choose the tool for the situation and keep normal security habits in place.</p>
    `,
  },
  '/guides/clean-tracking-links': {
    title: 'Clean tracking links without breaking them',
    description: 'Understand UTM tags, preserve useful query parameters, and recognize signed links that should never be edited casually.',
    category: 'Everyday privacy',
    readTime: '4 min read',
    body: `
      <p class="article-lead">A copied link can carry more than a page address. Some additions tell a publisher which newsletter or advertising campaign brought you there. Others select the actual product, search result, or document. A good cleanup removes known tracking fields selectively and gives you a chance to check the result before sharing it.</p>
      <h2>Read the address in pieces</h2>
      <p>Consider <code>https://example.com/article?utm_source=newsletter&amp;page=2#summary</code>. The domain is <code>example.com</code>, the path is <code>/article</code>, the query begins after the question mark, and the fragment starts with the hash. Here <code>page=2</code> might be essential, while <code>#summary</code> could jump to a useful section. Removing everything after the question mark would discard more than campaign tracking.</p>
      <p>Google Analytics uses parameters such as <code>utm_source</code>, <code>utm_medium</code>, and <code>utm_campaign</code> to describe the origin of traffic. Removing those fields from an ordinary article link can make your shared copy less revealing about the campaign that supplied it. It does not prevent the destination from recording your visit. <a href="https://support.google.com/analytics/answer/10917952?hl=en" target="_blank" rel="noopener noreferrer">Google documents how UTM campaign parameters work</a>.</p>
      <h2>Follow a conservative workflow</h2>
      <ol>
        <li>Copy the public page address, rather than a password-reset message, checkout link, or private invitation.</li>
        <li>Paste it into the <a href="/tools/url-cleaner">link cleaner</a>. Review which recognized tracking parameters are removed.</li>
        <li>Keep unknown parameters. A short name such as <code>id</code>, <code>q</code>, or <code>v</code> may identify the content you need.</li>
        <li>Compare the hostname and path with the original, then open the cleaned public link in a separate tab.</li>
        <li>Confirm the same article, product, language, and page number appear before sending the result.</li>
      </ol>
      <p>For example, turning <code>https://example.com/read?id=42&amp;utm_source=email</code> into <code>https://example.com/read?id=42</code> keeps the article identifier. Turning it into <code>https://example.com/read</code> might open a different page. If the site offers a “Copy link” or canonical sharing control, compare that output too; the publisher may provide a simpler address directly.</p>
      <h2>Leave signed and account links alone</h2>
      <p>Temporary download addresses sometimes use a cryptographic signature tied to their parameters. Amazon S3 presigned URLs are one example: they grant time-limited access using the permissions of whoever created them. Treat such an address as a credential. Editing it can invalidate access, and sharing it can give someone else access while it remains valid. <a href="https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html" target="_blank" rel="noopener noreferrer">AWS explains presigned URL permissions and expiry</a>.</p>
      <p>As a practical rule, stop when you see a password reset, login, payment, invitation, or download authorization URL. Names such as <code>signature</code>, <code>token</code>, or <code>X-Amz-Signature</code> are warning signs, but no list can identify every sensitive URL. Do not paste a secret link into a public message or an unfamiliar online service. If you need to share a document, use the document service's sharing controls.</p>
      <h2>Understand the result</h2>
      <p>Query parsing is more reliable than treating an address as an arbitrary string. The browser's <code>URLSearchParams</code> interface represents query fields individually. Its encoding rules also mean that rebuilding a URL can change how characters are written, which is another reason to avoid editing signed URLs. See <a href="https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams" target="_blank" rel="noopener noreferrer">MDN's URLSearchParams reference</a>.</p>
      <p>A cleaned link is still a link to the same organization. It does not remove cookies, conceal your IP address, inspect the destination for malware, or reveal the final page behind every short URL. Keep the scope modest: remove recognized campaign clutter, preserve functionality, and check before sharing. When a cleaner cannot confidently recognize a field, leaving it intact is the safer default. If the result fails, return to the original address rather than guessing which remaining fields can be deleted.</p>
    `,
  },
  '/guides/strong-passwords': {
    title: 'Make strong passwords you do not have to remember',
    description: 'A practical routine for generating unique passwords, saving them safely, and improving account recovery without invented strength scores.',
    category: 'Account security',
    readTime: '4 min read',
    body: `
      <p class="article-lead">The goal is to give each account its own hard-to-guess password without turning your memory into a database. A password manager can generate and save those passwords together. Start with a single important account, complete the change carefully, and repeat the process rather than trying to reorganize every login in one sitting.</p>
      <h2>Start with length and uniqueness</h2>
      <p>Choose a long generated password that the service accepts. A practical starting point is at least 16 random characters, with more length when supported. Do not reuse the result on another account or adapt it by adding a site name. If a reused password leaks, attackers can try it elsewhere. NIST recommends password managers and emphasizes length; it also explains why additional protections matter. Read <a href="https://www.nist.gov/cybersecurity-and-privacy/how-do-i-create-good-password" target="_blank" rel="noopener noreferrer">NIST's password guidance</a>.</p>
      <p>Work through email first, then accounts that control money, recovery details, or other logins. This is a suggested order, not a guarantee that lower-priority accounts are harmless. Write a checklist containing account names only. You can then mark each completed change without creating another document full of passwords that needs protection.</p>
      <h2>Generate, save, then verify</h2>
      <ol>
        <li>Open the service by typing its known address or using your saved bookmark. Avoid changing passwords through an unexpected message.</li>
        <li>In its account settings, find the password-change control and inspect the permitted length and characters.</li>
        <li>Use your password manager's generator. The <a href="/tools/password-generator">QuietTab generator</a> is also available for creating a new random string; never enter an existing password into a generator.</li>
        <li>Save the new password in the correct manager entry before completing the change. Keep the website address and username with that entry.</li>
        <li>After confirmation, check that the saved entry signs you in. Keep a working session open until you know the update succeeded.</li>
      </ol>
      <p>Browser password managers can create unique credentials, fill them on matching sites, and help flag compromised passwords. Their storage and synchronization settings vary, so inspect which account or device holds your data. Google's <a href="https://support.google.com/accounts/answer/6208650?hl=en" target="_blank" rel="noopener noreferrer">Password Manager documentation</a> describes its generation, autofill, recovery, and account-protection features. You can choose another manager; the useful habit is generating and retaining a different password for each service.</p>
      <h2>What browser generation means</h2>
      <p>QuietTab generates random values using the browser's <code>crypto.getRandomValues()</code> API. This API is intended for cryptographically strong randomness, unlike a typical game-oriented random-number function. The characters are produced on your device. <a href="https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues" target="_blank" rel="noopener noreferrer">MDN explains the Web Crypto method</a> and its browser behavior.</p>
      <p>Local generation has limits. A malicious extension, a compromised browser, someone viewing your screen, or another script with access to the page can undermine it. A random string also needs secure storage afterward. For your most important accounts, generating directly inside a trusted password manager reduces the number of copying steps. No online “strength” label can promise a precise cracking time for every attack scenario.</p>
      <h2>Protect the recovery path too</h2>
      <p>Enable multifactor authentication when available, and consider passkeys where the service supports them. Check that your recovery email and phone number are current. Save recovery codes somewhere you can access if your main device is lost; do not leave your only recovery method inside the account it is meant to recover. For a password manager, learn its recovery process before you need it.</p>
      <p>On a shared device, avoid leaving a generated password visible and remember that clipboard history may retain copied text. Once a password change works, close the generation tab and lock your manager. If a service reports a breach or you suspect exposure, replace that account's password promptly and review its active sessions. A manageable routine, with unique credentials and a recovery plan, is more useful than continually inventing clever variations of one familiar password.</p>
    `,
  },
};

export const guideCards = Object.entries(GUIDES).map(([href, { title, description, category, readTime }]) => ({
  href,
  title,
  description,
  category,
  readTime,
}));
