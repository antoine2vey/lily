/**
 * Shared CSS foundation for MCP widget templates.
 *
 * Dark mode detection uses window.openai.theme ("light" | "dark")
 * which is set asynchronously via the "openai:set_globals" custom event.
 * Falls back to prefers-color-scheme for non-ChatGPT MCP clients.
 *
 * Color tokens sourced from packages/app/tailwind.config.js.
 */

/**
 * Google Fonts link tag for Space Grotesk (the app's typeface).
 */
export const fontLink = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<meta name="color-scheme" content="light dark">`

/**
 * Inline script that detects dark mode and adds .dark to <html>.
 *
 * ChatGPT sets window.openai.theme asynchronously via a custom
 * "openai:set_globals" event. We listen for it and also poll,
 * since the event may fire before our listener is registered.
 */
export const themeScript = `<script>
(function() {
  function apply() {
    var isDark = false;
    if (window.openai && window.openai.theme) {
      isDark = window.openai.theme === 'dark';
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      isDark = true;
    }
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
  apply();
  window.addEventListener('openai:set_globals', apply);
  setTimeout(apply, 100);
  setTimeout(apply, 500);
  setTimeout(apply, 1500);
})();
</script>`

/**
 * Base CSS reset + custom properties for light/dark themes.
 * Dark mode activates via:
 * - `.dark` class on <html> (set by themeScript from window.openai.theme)
 * - `@media (prefers-color-scheme: dark)` (CSS fallback for non-ChatGPT)
 */
export const baseStyles = `
  :root {
    --bg: #F8FAF8;
    --surface: #FFFFFF;
    --surface-tinted: #F0F5F0;
    --text-primary: #1A1A1A;
    --text-secondary: #4A5568;
    --text-muted: #9CA3AF;
    --border: #E5E7EB;
    --primary: #80ac53;
    --primary-dark: #6a9145;
    --primary-light: #9bc76d;
    --primary-tint: #dceccb;
    --coral: #E8997E;
    --water: #60A5FA;
    --water-bg: #eff6ff;
    --warning: #F59E0B;
    --warning-bg: #fffbeb;
    --error: #EF4444;
    --error-bg: #fef2f2;
    --success-bg: #dceccb;
    --shadow: rgba(0, 0, 0, 0.06);
  }
  @media (prefers-color-scheme: dark) {
    :root:not(.light) {
      --bg: #1A1A1A;
      --surface: #252A1F;
      --surface-tinted: #2D3728;
      --text-primary: #FFFFFF;
      --text-secondary: #D1D5DB;
      --text-muted: #9CA3AF;
      --border: #374151;
      --primary: #9bc76d;
      --primary-dark: #80ac53;
      --primary-light: #9bc76d;
      --primary-tint: #2D3728;
      --coral: #F5B89A;
      --water: #93C5FD;
      --water-bg: #1e293b;
      --warning: #FBBF24;
      --warning-bg: #2D2006;
      --error: #F87171;
      --error-bg: #2D1515;
      --success-bg: #2D3728;
      --shadow: rgba(0, 0, 0, 0.2);
    }
  }
  html.dark {
    --bg: #1A1A1A;
    --surface: #252A1F;
    --surface-tinted: #2D3728;
    --text-primary: #FFFFFF;
    --text-secondary: #D1D5DB;
    --text-muted: #9CA3AF;
    --border: #374151;
    --primary: #9bc76d;
    --primary-dark: #80ac53;
    --primary-light: #9bc76d;
    --primary-tint: #2D3728;
    --coral: #F5B89A;
    --water: #93C5FD;
    --water-bg: #1e293b;
    --warning: #FBBF24;
    --warning-bg: #2D2006;
    --error: #F87171;
    --error-bg: #2D1515;
    --success-bg: #2D3728;
    --shadow: rgba(0, 0, 0, 0.2);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: transparent;
    color: var(--text-primary);
    padding: 16px;
    -webkit-font-smoothing: antialiased;
  }
  .empty {
    text-align: center;
    padding: 40px 16px;
    color: var(--text-muted);
    font-size: 15px;
  }
  .badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 9999px;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }
  .btn {
    font-family: 'Space Grotesk', -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 500;
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface-tinted);
    color: var(--primary);
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
  }
  .btn:hover { background: var(--primary-tint); }
  .btn:active { transform: scale(0.97); }
  .health-thriving { background: var(--success-bg); color: var(--primary-dark); }
  .health-healthy { background: var(--success-bg); color: var(--primary); }
  .health-warning { background: var(--warning-bg); color: var(--warning); }
  .health-sick { background: var(--error-bg); color: var(--error); }
  .health-recovering { background: var(--water-bg); color: var(--water); }
  .health-default { background: var(--surface-tinted); color: var(--text-muted); }
  .card.health-warning { background: var(--warning-bg); border-color: var(--warning); }
  .card.health-sick { background: var(--error-bg); border-color: var(--error); }
`
