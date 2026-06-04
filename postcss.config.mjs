// Tailwind v4 runs through PostCSS. Only files that `@import "tailwindcss"`
// receive utilities/preflight, so importing app/admin/admin.css in the admin
// layout keeps Tailwind scoped to /admin and off the Y2K public pages.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
