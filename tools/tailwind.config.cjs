/** @type {import('tailwindcss').Config} */

// Colours are CSS variables (see input.css) so light and dark themes share one set of class names.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["../page.tsx", "../src/**/*.{ts,tsx}", "./render.tsx"],
  // `dark:` follows the system setting unless the visitor picked a theme with the toggle.
  darkMode: [
    "variant",
    [
      '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) & }',
      ':root[data-theme="dark"] &',
    ],
  ],
  theme: {
    extend: {
      colors: {
        canvas: token("canvas"),
        surface: token("surface"),
        sunken: token("sunken"),
        "sunken-strong": token("sunken-strong"),
        line: token("line"),
        "line-strong": token("line-strong"),
        ink: token("ink"),
        "ink-2": token("ink-2"),
        muted: token("muted"),
        clay: token("clay"),
        "clay-ink": token("clay-ink"),
        "clay-btn": token("clay-btn"),
        "clay-btn-hover": token("clay-btn-hover"),
      },
      fontFamily: {
        sans: ['"DM Sans"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        serif: ["Newsreader", "ui-serif", "Georgia", "Cambria", '"Times New Roman"', "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.05), 0 18px 48px -18px rgb(var(--shadow) / 0.18)",
        pop: "0 1px 2px rgb(var(--shadow) / 0.06), 0 24px 60px -16px rgb(var(--shadow) / 0.28)",
        thumb: "0 1px 2px rgb(var(--shadow) / 0.08), 0 2px 8px -2px rgb(var(--shadow) / 0.10)",
        cta: "inset 0 1px 0 rgb(255 255 255 / 0.18), 0 10px 24px -10px rgb(184 85 50 / 0.65)",
        poster: "0 30px 60px -28px rgb(20 20 19 / 0.55)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "none" } },
        fade: { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: { from: { opacity: "0", transform: "translateY(-4px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
        sheet: { from: { opacity: "0", transform: "translateY(24px)" }, to: { opacity: "1", transform: "none" } },
        kenburns: { from: { transform: "scale(1)" }, to: { transform: "scale(1.09) translate(-1.5%, -1%)" } },
        progress: { from: { transform: "scaleX(0)" }, to: { transform: "scaleX(1)" } },
      },
      animation: {
        rise: "rise 0.8s cubic-bezier(.2,.7,.2,1) both",
        fade: "fade 0.6s ease both",
        pop: "pop 0.16s ease-out both",
        sheet: "sheet 0.32s cubic-bezier(.2,.8,.2,1) both",
        kenburns: "kenburns 12s ease-out both",
        progress: "progress 12s linear both",
      },
    },
  },
  plugins: [],
};
