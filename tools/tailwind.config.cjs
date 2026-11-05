/** @type {import('tailwindcss').Config} */

// Brand colors are CSS variables defined in input.css, so the whole site can be
// recolored from one place. `<alpha-value>` keeps opacity classes like bg-volt/10 working.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["../page.tsx", "./render.tsx"],
  theme: {
    extend: {
      colors: {
        night: token("night"),
        ink: token("ink"),
        surface: token("surface"),
        raised: token("raised"),
        cloud: token("cloud"),
        mist: token("mist"),
        volt: token("volt"),
        aqua: token("aqua"),
        ultra: token("ultra"),
        flare: token("flare"),
      },
      fontFamily: {
        sans: ["Geist", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["Instrument Serif", "ui-serif", "Georgia", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};
