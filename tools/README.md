# Site build tools

`../public/` is the static site that Cloudflare deploys (`npx wrangler deploy`,
configured by `../wrangler.jsonc`). It is generated from `../page.tsx`.

After editing `page.tsx`, regenerate and commit `public/`:

```sh
cd tools
npm ci
npm run build
```

This renders `page.tsx` to `public/index.html` and compiles the Tailwind
classes it uses into `public/styles.css`. Cloudflare needs no build step.
