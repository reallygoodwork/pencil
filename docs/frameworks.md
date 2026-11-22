# Adding Pencil Agent to your app

The overlay is one script tag that loads from Pencil Agent and carries your token. It should only ever load in development. Pick your setup:

- [Vite](#vite) (React, Vue, Svelte, Solid, plain)
- [Next.js](#nextjs)
- [Anything else](#anything-else) (Astro, SvelteKit, Remix, Rails, static HTML…)
- [Bookmarklet](#bookmarklet-no-code-changes): no code changes at all

The Vite and Next.js setups read the token from `~/.pencil-agent/token` on your Mac, so it never goes into your repo.

---

## Vite

`vite.config.js` (or `.ts`):
```js
import { defineConfig } from 'vite'
import fs from 'node:fs'
import os from 'node:os'

// Pencil Agent: dev only, and only when PENCIL_URL is set
function pencilAgent() {
  const url = process.env.PENCIL_URL
  const tokenFile = `${os.homedir()}/.pencil-agent/token`
  return {
    name: 'pencil-agent',
    apply: 'serve',
    transformIndexHtml() {
      if (!url || !fs.existsSync(tokenFile)) return []
      const token = fs.readFileSync(tokenFile, 'utf8').trim()
      return [{ tag: 'script', attrs: { src: `${url}/overlay.js`, 'data-token': token, defer: true }, injectTo: 'body' }]
    },
  }
}

export default defineConfig({
  plugins: [/* your plugins */, pencilAgent()],
  server: {
    allowedHosts: ['.ts.net'],   // let your Tailscale name through
  },
})
```

Run your dev server with the URL set:
```bash
PENCIL_URL=https://your-mac.your-tailnet.ts.net:8443 npm run dev
```

**Hot reload over Tailscale:** if changes don't appear on the device until you refresh manually, add `hmr: { clientPort: 443 }` under `server` (use your `--https` port if it isn't 443).

---

## Next.js

`next.config.js`:
```js
module.exports = {
  allowedDevOrigins: ['*.ts.net'],   // allow your Tailscale name in dev
}
```

`app/layout.tsx` (App Router):
```tsx
import Script from 'next/script'
import fs from 'node:fs'
import os from 'node:os'

function pencilAgent() {
  const url = process.env.PENCIL_URL
  const tokenFile = `${os.homedir()}/.pencil-agent/token`
  if (process.env.NODE_ENV !== 'development' || !url || !fs.existsSync(tokenFile)) return null
  const token = fs.readFileSync(tokenFile, 'utf8').trim()
  return <Script src={`${url}/overlay.js`} data-token={token} strategy="afterInteractive" />
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {pencilAgent()}
      </body>
    </html>
  )
}
```

Add to `.env.local`, which is git-ignored by default:
```bash
PENCIL_URL=https://your-mac.your-tailnet.ts.net:8443
```

For the **Pages Router**, `_app.tsx` also runs in the browser, so it can't read files. Read the token in `next.config.js` instead (`env: { PENCIL_TOKEN: … }`, only when `process.env.NODE_ENV === 'development'`), then render the same `<Script>` in `pages/_app.tsx` using `process.env.PENCIL_TOKEN`.

Serve Next on Tailscale with its port: `tailscale serve --bg --https=443 http://localhost:3000`.

---

## Anything else

Run `npm run tag` and paste the result into your dev-only layout or `index.html`, just before `</body>`:
```html
<script src="https://your-mac.your-tailnet.ts.net:8443/overlay.js" data-token="…" defer></script>
```
Wrap it in your framework's "development only" check (for example `{#if dev}` in SvelteKit, `import.meta.env.DEV` in Astro, or `Rails.env.development?` in Rails). Don't commit the token: read it from `~/.pencil-agent/token` at dev time, or keep the tag in a git-ignored partial.

- **No hot reload?** Add `data-reload="true"` to the tag and the page reloads after each change.
- **Content Security Policy?** In dev, allow your `PUBLIC_URL` in `script-src` and `connect-src`.

---

## Bookmarklet (no code changes)

Good for trying Pencil Agent on a project before wiring it in:
1. Run `npm run bookmarklet` and copy the output, which starts with `javascript:`.
2. On your iPhone or iPad, bookmark any page in Safari, then edit the bookmark and replace its address with the copied text. Name it "Pencil".
3. Open your app and tap the bookmark. The ✎ button appears.

Limits:
- **Full reloads remove it.** After a full page reload, tap the bookmark again. Hot-module updates keep it.
- **A strict Content Security Policy blocks it.** Use the script tag instead.

---

## Getting the source file into the brief

Claude finds code faster when the brief includes a source location. The overlay picks it up automatically from:
- **React 18 and earlier, dev builds:** `fileName:line:column` for the circled component.
- **Any framework:** a `data-source`, `data-loc`, `data-component-file` or `data-inspector-relative-path` attribute on the element or a near ancestor. Many dev-only "click to component" build plugins add these.

Without a source location, Claude searches by text, classes and component names, which works fine but uses a few more tokens.
