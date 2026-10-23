# MyPublicWiFi captive-portal integration

MyPublicWiFi is the piece that provides the Wi-Fi hotspot, DHCP, DNS and the
captive-portal redirect on Windows 10. Windows itself can do none of these
without an internet connection.

By default MyPublicWiFi shows its own login page. These files replace that page
with a small branded page that immediately forwards guests to the full portal
served by this project (`http://192.168.5.1:8080/`).

## One-time setup

1. Install MyPublicWiFi (free): https://mypublicwifi.com/publicwifi/en/index.html
   Launch it once so it creates its folders.
2. Open **PowerShell as administrator** (Start menu -> "PowerShell" ->
   right-click -> *Run as administrator*).
3. Run the installer:

   ```powershell
   cd "<this project folder>\deploy-mypublicwifi"
   powershell -ExecutionPolicy Bypass -File .\Install-MyPublicWiFiPortal.ps1
   ```

   It backs up the original `login.html`, installs ours, and opens TCP 8080 in
   Windows Firewall.

## Every time you want to run the hotpot

1. Start MyPublicWiFi and start the hotspot. Keep internet sharing **off**.
2. Double-click `1-Run-Portal.cmd` in the project folder.
3. Guests connect to the SSID and are redirected to our portal.

## Undo

```powershell
powershell -ExecutionPolicy Bypass -File .\Uninstall-MyPublicWiFiPortal.ps1
```

## Notes

- If your hotspot uses a different address than `192.168.5.1`, pass
  `-PortalUrl` to the installer and set `HOTSPOT_HOST` for the app.
- Everything here works with no internet connection.
