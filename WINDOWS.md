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
   reach the portal, and leave internet sharing OFF — see *Internet access
   (optional)* below if you would rather guests had internet.

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

This is the most common reason a guest device "can't see the network", so it is
worth understanding properly.

**The constraint.** One Wi-Fi card broadcasts **one band at a time**. 2.4 GHz and
5 GHz are separate radios; the card cannot run both, and neither can Windows'
hosted-AP API.

**The catch.** Windows (and therefore MyPublicWiFi) mirrors the band of the
network the laptop is currently connected to. Join a 5 GHz network and the hotspot
comes up on 5 GHz. With no Wi-Fi connection at all, the hotspot usually falls back
to 2.4 GHz.

**Why it breaks for guests.** 2.4 GHz-only devices — older phones, most IoT gear,
cheap tablets — cannot see a 5 GHz SSID *at all*. It is not weak signal: to those
devices the network does not exist.

**The trade-off.**

| Band | Visible to | Speed | Range / walls | Interference |
| --- | --- | --- | --- | --- |
| 2.4 GHz | everything | slower (narrow channels) | better | more crowded — neighbours, Bluetooth, microwaves |
| 5 GHz | dual-band devices only | much faster | shorter | less crowded |

If **any** guest device might be 2.4 GHz-only, broadcast **2.4 GHz**: it is the
lowest common denominator and everything supports it.

### Check which band you are on

```powershell
netsh wlan show interfaces
```

Look at `Channel` on the `Wi-Fi` interface: **1–14** is 2.4 GHz, **36 and above**
is 5 GHz. The hotspot mirrors that connection, so this is normally the band your
hotspot is using. You can also just try to connect a 2.4 GHz-only phone — if the
SSID is missing from its list, the hotspot is on 5 GHz.

### Enable 2.4 GHz (in order of least disruption)

1. **MyPublicWiFi itself** — look for a band / "Prefer Mobile Hotspot" option in
   its settings and choose 2.4 GHz. If it exists, use it; nothing else changes.
2. **`3-Set-Wifi-2.4GHz.cmd`** — run it (it asks for admin). It sets the adapter's
   *Preferred Band* to 2.4 GHz **and** pins *802.11a/b/g Wireless Mode* to
   "2.4 GHz b/g" only, then restarts the adapter. Restart the hotspot afterwards.
3. **Device Manager** — Network adapters → your Wi-Fi adapter → Properties →
   **Advanced** → *Preferred Band* = "2. Prefer 2.4GHz band". If that alone is not
   enough, also set *802.11a/b/g Wireless Mode* to a 2.4 GHz-only entry.

Equivalent command form (what the script runs):

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-mypublicwifi\Set-WifiBand.ps1 -Band 2.4 -Strong
```

`-Band 5` does the opposite (prefer 5 GHz) if you want the speed and do not care
about older devices.

### Disable it / return to normal

```powershell
# elevated
4-Restore-Wifi-Band.cmd
```

or, equivalently:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-mypublicwifi\Set-WifiBand.ps1 -Band Any
```

That sets *Preferred Band* back to "No Preference" and *Wireless Mode* back to
"Dual Band a/b/g", then restarts the adapter.

**Remember it is global.** While 2.4 GHz is forced, the laptop's own Wi-Fi is
restricted to 2.4 GHz too, so its normal internet is slower and more prone to
interference. Restore it when you have finished hosting.

## Internet access (optional)

This project is set up for an **isolated** network with no internet, because that
is what makes the captive portal reliable and the data collection honest. But that
is a **choice, not a limitation** — internet is possible if you toggle it in
MyPublicWiFi.

- In MyPublicWiFi, enable internet sharing and pick the connection to share
  (Ethernet, Wi-Fi, 4G/USB). Guests then get internet through the laptop.
- The portal, the operator console and every piece of data capture behave exactly
  the same with or without internet. Nothing in this project needs to change.

Two things to know before you enable it:

- **This app never forwards traffic.** It does not proxy, NAT or inspect anything.
  `INTERNET_FORWARDING` is permanently false and the admin API rejects attempts to
  turn it on — sharing is entirely MyPublicWiFi's job.
- **The portal and internet access pull against each other.** The portal appears
  because MyPublicWiFi gates unauthenticated guests. This project replaces
  MyPublicWiFi's login page with one that forwards to our portal, so guests never
  complete MyPublicWiFi's own login step. If you enable internet sharing, decide
  which behaviour you want: **gated** (keep User Authentication on, and accept that
  guests stay in our portal) or **open** (turn the portal/auth off and simply share
  the connection).

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
10. Confirm there is no internet access while internet sharing is off.

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
