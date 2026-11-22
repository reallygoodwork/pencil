# Tailscale setup

Your phone or iPad needs to reach two things on your Mac: your app's dev server and Pencil Agent. Tailscale makes that private and gives you HTTPS. HTTPS matters because Safari only allows the microphone, and some other features, on secure pages.

**Why not just use your Wi-Fi IP?**
- **It works anywhere.** Tailscale works on any network, including cellular, with no router setup.
- **It's private.** Only devices signed in to your Tailscale account can connect. Nobody else on the café Wi-Fi can.
- **The certificates are real.** HTTPS uses a valid certificate, so there are no browser warnings.
- **Your dev server stays local.** It keeps listening on `localhost` only, and Tailscale forwards traffic to it.

Tailscale's free personal plan covers this.

---

## 1. Install Tailscale

**Mac:** install from the Mac App Store, or get the standalone app from [tailscale.com/download](https://tailscale.com/download). Open it and sign in.

**iPhone / iPad:** install **Tailscale** from the App Store and sign in with **the same account**. Allow the VPN configuration when asked.

Both devices should now appear in the Tailscale app's device list.

## 2. Get the `tailscale` command on your Mac

- **Standalone app:** Tailscale menu → **Settings** → **CLI integration** → **Install Now**. This installs `/usr/local/bin/tailscale`.
- **App Store app:** the CLI is inside the app. Add this to `~/.zshrc`, then open a new terminal:
  ```bash
  alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
  ```

Check it works:
```bash
tailscale status
```
You should see your Mac and your phone or iPad listed.

## 3. Turn on HTTPS

The first time you run `tailscale serve`, it prints a link if Serve or HTTPS isn't enabled yet for your account. Open the link and approve it. You can also do it ahead of time in the [admin console](https://login.tailscale.com/admin/dns): under **DNS**, make sure **MagicDNS** is on, then enable **HTTPS Certificates**.

> **Note:** with HTTPS enabled, your machine's Tailscale name (e.g. `your-mac.tail1234.ts.net`) is published in public certificate-transparency logs. Nothing on it is reachable from the internet, but if the name bothers you, rename the machine in the admin console first.

## 4. Serve your app and Pencil Agent

Start your app's dev server as usual (say it runs on port `5173`), then:

```bash
# your app → https://your-mac.your-tailnet.ts.net
tailscale serve --bg --https=443 http://localhost:5173

# pencil agent → https://your-mac.your-tailnet.ts.net:8443
tailscale serve --bg --https=8443 http://127.0.0.1:4545
```

Replace `5173` with your dev server's port (Next.js is usually `3000`). The output shows your full address, for example:
```
Available within your tailnet:
https://your-mac.your-tailnet.ts.net/
|-- proxy http://localhost:5173
```

- **What `--bg` does:** it keeps serving after you close the terminal, and after restarts, until you turn it off.
- **Why the full URLs:** they avoid a common `502` error (see Troubleshooting below).

Put those two addresses in `pencil.env`:
```bash
APP_ORIGIN=https://your-mac.your-tailnet.ts.net
PUBLIC_URL=https://your-mac.your-tailnet.ts.net:8443
```

## 5. Check it

On your phone or iPad, with Tailscale connected:
- `https://your-mac.your-tailnet.ts.net` should show your app. Your framework may need one config line first; see [frameworks.md](frameworks.md).
- `https://your-mac.your-tailnet.ts.net:8443/health` should show `{"ok":true}` once `npm start` is running.

To confirm it's private, turn Tailscale off on the phone and reload. The page should fail to load.

## Everyday commands

```bash
tailscale serve status                 # what's being served
tailscale serve --https=8443 off       # stop serving pencil agent
tailscale serve --https=443 off        # stop serving your app
tailscale serve reset                  # stop everything
```

Switching projects? If the new project's dev server uses the same port, nothing changes. Otherwise, re-run the `--https=443` command with the new port.

## Keep it private

- **Use `tailscale serve`, never `tailscale funnel`.** Funnel publishes the port to the whole internet.
- **On a shared tailnet** (a company one, or one shared with family), everyone on it could reach these ports. They'd still need the Pencil Agent token, but you can limit access to your own devices with [access controls](https://tailscale.com/kb/1018/acls).
- **Pencil Agent itself stays on `127.0.0.1`.** Don't set `HOST=0.0.0.0` when you're using Tailscale.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `502 Bad Gateway` | The dev server isn't running, or the proxy target is wrong. Use the full `http://localhost:PORT` form (some dev servers only listen on IPv6 `::1`, and a bare port number proxies to `127.0.0.1`). |
| Port `443` already in use | Another local tool (Caddy, a local HTTPS proxy) is on 443. Serve your app on another port, e.g. `--https=10443`, and set `APP_ORIGIN=https://your-mac.your-tailnet.ts.net:10443`. |
| Page loads on the Mac but not the phone | Is Tailscale connected on the phone? Check that `tailscale status` lists both devices. |
| `Serve is not enabled on your tailnet` | Open the link it prints and approve Serve and HTTPS. |
| Vite or Next.js refuses the host | One config line is needed; see [frameworks.md](frameworks.md). |
| Hot reload doesn't update the page on the phone | See your framework's section in [frameworks.md](frameworks.md). |

## Without Tailscale (same Wi-Fi only)

This works for a quick test, with limits:
1. Run your dev server on the network (Vite: `vite --host`, Next.js: `next dev -H 0.0.0.0`).
2. In `pencil.env`:
   ```bash
   HOST=0.0.0.0
   APP_ORIGIN=http://192.168.1.20:5173,http://your-mac.local:5173   # Wi-Fi IP and/or Bonjour name, dev port
   PUBLIC_URL=http://192.168.1.20:4545
   ```
3. Open `http://192.168.1.20:5173` on the device, or `http://your-mac.local:5173`. The `.local` name is in System Settings → General → Sharing → Local hostname, and it doesn't change when your IP does.

`npm run demo -- --lan` does all of this for the demo app and prints a QR code to scan.

The limits: it's plain HTTP, there's no hold-to-talk button (keyboard dictation still works), and anyone on the same Wi-Fi can reach the port, though they still need the token. Don't use this on networks you don't trust.
