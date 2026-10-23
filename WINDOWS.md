# Local Wi-Fi Portal — Windows 10

This project runs the guest portal and operator console locally on a Windows 10
laptop. MyPublicWiFi provides the Wi-Fi hotspot, DHCP, DNS and the captive-portal
redirect, all without an internet connection.

## Why MyPublicWiFi is required

Windows 10 cannot do this on its own:

- The built-in Mobile Hotspot refuses to start without an internet connection
  ("your PC doesn't have an Ethernet, Wi-Fi, or cellular data connection").
- The legacy `netsh wlan set hostednetwork` method needs a driver that reports
  `Hosted network supported: Yes`; most modern adapters report `No`.
- Windows has no captive portal. The automatic pop-up only appears because the
  hotspot hijacks DNS and intercepts port 80 — which MyPublicWiFi does for you.

So MyPublicWiFi must be installed. It is free.

## Requirements

- Windows 10
- Node.js 22 or newer (provides `node:sqlite`) — Node 24 is fine
- pnpm (only needed on the machine that builds the bundle)
- MyPublicWiFi — https://mypublicwifi.com/publicwifi/en/index.html
- A Wi-Fi adapter that MyPublicWiFi can drive

## Build (once)

```powershell
corepack enable
pnpm install
pnpm run build:windows
```

This produces `artifacts\api-server\dist\`. Build it **on the Windows laptop
that will run it** — a bundle built on Linux embeds Linux worker paths and will
crash with `Cannot find module 'C:\home\runner\...'`.

After it builds you do not need pnpm again; just run the server.

## One-time MyPublicWiFi setup

1. Install MyPublicWiFi and launch it once.
2. Note the hotspot subnet. Its default is `192.168.5.0/24`, so the laptop is
   normally `192.168.5.1`. Adjust `HOTSPOT_HOST` if yours differs.
3. Install our branded captive page so guests land on this project's portal:

   ```powershell
   # Open PowerShell as administrator first
   cd deploy-mypublicwifi
   powershell -ExecutionPolicy Bypass -File .\Install-MyPublicWiFiPortal.ps1
   ```

   This backs up MyPublicWiFi's original `login.html`, replaces it with a page
   that forwards guests to `http://192.168.5.1:8080/`, and opens TCP 8080 in the
   Windows Firewall. See `deploy-mypublicwifi/README.md`.

   In MyPublicWiFi, make sure local network access is allowed so guests can
   reach the portal, and leave internet sharing OFF.

## Start (every time)

1. Start MyPublicWiFi and start the hotspot (internet sharing disabled).
2. Double-click **`1-Run-Portal.cmd`** in the project folder.

It prints:

- Guest portal: `http://192.168.5.1:8080/`
- Operator console: `http://127.0.0.1:8081/admin`

The operator console binds to `127.0.0.1` only and is never exposed to guests.
The guest portal must be started after the hotspot, because it binds to the
hotspot address; if the address is missing you get a clear message telling you
to start the hotspot first.

### Manual start (equivalent)

```powershell
$env:HOTSPOT_HOST="192.168.5.1"
$env:GUEST_PORT="8080"
$env:ADMIN_PORT="8081"
$env:CAPTIVE_REDIRECT_PORT="disabled"
node artifacts\api-server\dist\index.mjs
```

`CAPTIVE_REDIRECT_PORT` stays disabled because MyPublicWiFi owns port 80 and
already performs the redirect.

## SQLite

Created automatically at:

```text
%LOCALAPPDATA%\LocalWifiPortal\data\portal.sqlite
```

Override with `SQLITE_PATH`. No database server or internet connection is needed.

## Wi-Fi band (2.4 GHz vs 5 GHz)

A single Wi-Fi card can only broadcast **one** band at a time, and Windows mirrors
the band of whichever network the laptop is connected to. If the laptop is on a
5 GHz network, the hotspot is 5 GHz and 2.4 GHz-only phones cannot see the SSID
at all.

To be visible to both old phones and laptops, broadcast on **2.4 GHz**
(everything supports it):

1. Check MyPublicWiFi's settings for a band option and choose 2.4 GHz.
2. Otherwise force the adapter (elevated PowerShell), then restart the hotspot:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\deploy-mypublicwifi\Set-WifiBand.ps1 -Band 2.4
   ```

   If the SSID still does not appear on the phone, try `-Strong`, or set the
   laptop's own Wi-Fi to a 2.4 GHz network before starting the hotspot.
   Undo any time with `-Band Any`.

Forcing 2.4 GHz also affects the laptop's normal Wi-Fi (slower). Restore with
`-Band Any` when you are done.

## Test checklist

1. Start the hotspot, then start the portal.
2. Confirm the phone gets a `192.168.5.x` address and the laptop as gateway.
3. Connect a phone and confirm it is redirected to our portal automatically.
4. If it does not open, browse to `http://192.168.5.1:8080/` manually.
5. Submit a request and confirm the success screen appears with a request id.
6. Open `http://127.0.0.1:8081/admin` on the laptop; the request is listed.
7. Approve, deny and erase a test request.
8. Restart the portal and confirm data persists.
9. Confirm the phone cannot reach `:8081/admin`.
10. Confirm there is no internet access and no browsing URLs are logged by us.

## Troubleshooting: the portal page does not open

Windows laptops usually open `http://www.msftconnecttest.com/redirect` first. That
is normal — our page is served at that path and forwards to the portal. If the
browser ends on "This site can't be reached", the guest could not reach the
portal port.

1. Check the firewall rule (elevated PowerShell):

   ```powershell
   Get-NetFirewallRule -DisplayName 'Local Wi-Fi Portal (TCP 8080)'
   ```

   If it is missing or disabled, re-run `2-Install-Captive-Page.cmd`. Windows
   blocks inbound `192.168.5.1:8080` by default without that rule, so the
   redirect page loads and then fails to reach the portal.

2. Confirm the portal is running: `http://192.168.5.1:8080/` should load on the
   host laptop itself.

3. On the guest device, opening `http://192.168.5.1:8080/` directly skips the
   redirect and should always work.

## Undo the captive page

```powershell
# elevated PowerShell
powershell -ExecutionPolicy Bypass -File .\deploy-mypublicwifi\Uninstall-MyPublicWiFiPortal.ps1
```

## Safety boundary

The application permanently reports internet forwarding as disabled and rejects
attempts to enable it through the admin API. It does not inspect page contents,
record browsing URLs, create firewall rules by itself, change adapter settings or
run privileged MyPublicWiFi commands.
