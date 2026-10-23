# Local Wi-Fi Portal

A self-hosted guest Wi-Fi portal for Windows 10/11. Guests join a local hotspot,
are shown a captive-portal page, and their details are stored on the host laptop
in a local SQLite database. **No internet connection is required** and nothing is
sent to any third-party server.

The Wi-Fi radio, DHCP and the captive redirect are provided by
[MyPublicWiFi](https://mypublicwifi.com/publicwifi/en/index.html) (free). This
project provides the portal page, the operator console and the data store.

## What you get

- **Guest portal** — a consent notice and a short form, served from the host.
- **Operator console** — connected devices, submissions, browsing log, settings.
- **Local storage** — SQLite via Node's built-in `node:sqlite`. No database
  server, no cloud, no accounts.
- **Fully offline** — fonts, icons and styles are bundled locally, so the portal
  renders correctly on a network that has no internet.

## Requirements

- Windows 10 or 11
- **Node.js 22 or newer** (uses the built-in `node:sqlite`)
- **MyPublicWiFi** — https://mypublicwifi.com/publicwifi/en/index.html (free)
- A Wi-Fi adapter that MyPublicWiFi supports

## Quick start

1. Install Node.js and MyPublicWiFi.
2. Double-click **`2-Install-Captive-Page.cmd`** once. It installs the portal page
   into MyPublicWiFi and keeps a backup of the original file.
3. In MyPublicWiFi: enable **User Authentication**, set your SSID and password,
   then start the hotspot.
4. Double-click **`1-Run-Portal.cmd`**.

| Surface | Address |
| --- | --- |
| Guest portal | `http://192.168.5.1:8080/` |
| Operator console | `http://127.0.0.1:8081/admin` |

Step-by-step detail and troubleshooting live in **`WINDOWS.md`**.

## Project layout

| Path | Purpose |
| --- | --- |
| `artifacts/api-server/` | Express server: guest API, operator API, captive DNS, SQLite |
| `artifacts/local-wifi-portal/` | React + Vite guest page and operator console |
| `lib/api-zod/` | Request and response schemas |
| `lib/api-client-react/` | Typed client used by the console |
| `deploy-mypublicwifi/` | Scripts that install the portal page into MyPublicWiFi |
| `artifacts/api-server/dist/` | Prebuilt server bundle — included in the packaged zip, not in git |

## Building from source

Only needed if you change the code — the shipped bundle already runs.

```powershell
corepack enable
pnpm install
pnpm run build:windows
```

Build on the Windows machine that will run it. A bundle built on another
operating system embeds foreign paths and will not start.

## Packaging for someone else

Run **`5-Make-Zip.cmd`** to produce `Windows-Wi-Fi-Captive-Portal.zip` next to this
folder. It excludes `node_modules`, `.git` and local runtime data, so the result
is small and contains nothing personal.

## Limitations and notes

Worth being explicit about the boundaries of this project:

- **Windows only.** It relies on Windows' hosted network / tethering API.
- **MyPublicWiFi is required.** The radio, DHCP, NAT and the port-80 intercept
  come from that separate product; this project supplies the portal, the
  operator console and the data store. It is not a standalone hotspot.
- **WPA2 only.** Windows cannot broadcast an open network, so a password is
  mandatory (8+ characters). Windows clients may also offer a WPS PIN first;
  "Use password instead" is the correct path.
- **A firewall rule is required** for the portal port, otherwise guests load the
  redirect page and then cannot reach the portal.
- **One client band at a time.** A 2.4 GHz-only phone needs the hotspot pinned to
  2.4 GHz; see `WINDOWS.md`.
- **No internet by default.** It is built for an isolated network, but MyPublicWiFi
  can share the laptop's connection if you enable it there — the portal and data
  capture are unaffected. See `WINDOWS.md` → *Internet access (optional)*.
- **The browsing log is privacy-sensitive.** It is recorded by MyPublicWiFi and
  must be disclosed to guests in the portal privacy notice.

## Privacy

The portal records what a guest submits (name, contact, consent) plus
device/connection metadata, and can surface MyPublicWiFi's per-device browsing
log. Before using this with real people, publish an accurate privacy notice in
**Portal settings** and make sure guests can have their data erased.

## Third-party software

MyPublicWiFi is a separate product with its own licence and installer; it is not
bundled with this project.
