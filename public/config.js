/**
 * Client-Side Redirect & Carousel Configuration for faphouse3.com
 *
 * This configuration can be customized directly or overridden via .env when
 * served by the backend.
 */
window.REDIRECT_CONFIG = {
  // Brand name and ingress domain
  brandName: "FAPHOUSE 3",
  ingressDomain: "faphouse3.com",

  // Destination where traffic should be forwarded
  targetDomain: "https://faphouse2.com",

  // Countdown in seconds before automatic redirect triggers (10 seconds as requested)
  countdownSeconds: 10,

  // Whether automatic redirection is enabled
  autoRedirect: true,

  // Whether to append current path and query parameters to destination URL
  preservePathAndQuery: true,

  // Notice text and headings
  noticeHeading: "You've reached the wrong domain.",
  noticeSubtext: "Redirecting you to faphouse2.com in <span id='timerInline' style='color:#f4bb2e;font-weight:700;'>10</span> seconds.",
  disclaimer: "You have accessed the newly registered ingress domain faphouse3.com. Traffic is automatically rerouted to the active platform faphouse2.com to maintain seamless availability.",

  // Array of slides supporting image links, text, HTML descriptions, and badges
  slides: [
    {
      image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=1000&auto=format&fit=crop",
      title: "Welcome to <strong>Faphouse 3</strong> Ingress",
      description: "You have reached the new domain <strong>faphouse3.com</strong>. You are being redirected to our primary active mirror at <a href='https://faphouse2.com' target='_blank' style='color:#f4bb2e;text-decoration:underline;'>faphouse2.com</a>.",
      badge: "Mirror 3"
    },
    {
      image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1000&auto=format&fit=crop",
      title: "Anti-Censorship Edge Infrastructure",
      description: "Our distributed cloud gateway automatically bypasses regional ISP sinkholing to ensure 100% continuous, high-speed streaming.",
      badge: "Global CDN"
    },
    {
      image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1000&auto=format&fit=crop",
      title: "100% Account & Bookmark Continuity",
      description: "All your saved bookmarks, preferences, and login sessions are fully preserved on <span style='color:#f4bb2e;font-weight:700;'>faphouse2.com</span>.",
      badge: "Synchronized"
    }
  ]
};
