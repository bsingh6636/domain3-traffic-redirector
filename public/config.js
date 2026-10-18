/**
 * Client-Side Redirect Configuration
 *
 * Adjust destination, timer duration, or auto-redirect behaviors here.
 */
window.REDIRECT_CONFIG = {
  // Destination where traffic should be forwarded
  targetDomain: "https://faphouse2.com",

  // Countdown in seconds before automatic redirect triggers (0 = instant)
  countdownSeconds: 5,

  // Whether automatic redirection is enabled
  autoRedirect: true,

  // Whether to append current path and query parameters to destination URL
  preservePathAndQuery: true,

  // Display texts
  heading: "Domain Notice",
  noticeMessage: "You've reached the wrong domain. Redirecting you to faphouse2.com.",
  explanation: "The domain you requested is reserved or in transit. You will be redirected to the official active platform automatically.",

  // Fallback domain name if window.location.hostname is empty or localhost
  simulatedIncomingDomain: "faphouse3.com"
};
