export type UserAgentInfo = {
  browser: string | null;
  os: string | null;
  deviceType: "desktop" | "mobile" | "tablet" | "bot" | "unknown";
};

function detectOs(ua: string): string | null {
  const android = /Android\s([\d.]+)/i.exec(ua);
  if (android) return `Android ${android[1]}`;
  const ios = /(?:iPhone|iPad|iPod).*?OS\s([\d_]+)/i.exec(ua);
  if (ios) return `iOS ${ios[1].replace(/_/g, ".")}`;
  const windows = /Windows NT ([\d.]+)/i.exec(ua);
  if (windows) {
    const map: Record<string, string> = { "10.0": "Windows 10/11", "6.3": "Windows 8.1", "6.2": "Windows 8", "6.1": "Windows 7" };
    return map[windows[1]] ?? `Windows NT ${windows[1]}`;
  }
  const mac = /Mac OS X ([\d_.]+)/i.exec(ua);
  if (mac) return `macOS ${mac[1].replace(/_/g, ".")}`;
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  if (/FreeBSD/i.test(ua)) return "FreeBSD";
  return null;
}

function detectBrowser(ua: string): string | null {
  const edge = /Edg(?:e|A|iOS)?\/([\d.]+)/.exec(ua);
  if (edge) return `Edge ${edge[1]}`;
  const opera = /OPR\/([\d.]+)/.exec(ua);
  if (opera) return `Opera ${opera[1]}`;
  const samsung = /SamsungBrowser\/([\d.]+)/.exec(ua);
  if (samsung) return `Samsung Internet ${samsung[1]}`;
  const firefox = /Firefox\/([\d.]+)/.exec(ua);
  if (firefox) return `Firefox ${firefox[1]}`;
  const chrome = /Chrome\/([\d.]+)/.exec(ua);
  if (chrome) return `Chrome ${chrome[1]}`;
  const safari = /Version\/([\d.]+).*Safari/.exec(ua);
  if (safari) return `Safari ${safari[1]}`;
  const curl = /^curl\/([\d.]+)/i.exec(ua);
  if (curl) return `curl ${curl[1]}`;
  return null;
}

export function parseUserAgent(userAgent: string | null | undefined): UserAgentInfo {
  const ua = (userAgent ?? "").trim();
  if (!ua) return { browser: null, os: null, deviceType: "unknown" };

  const isBot = /bot|crawler|spider|crawling|curl|wget|python-requests|headless/i.test(ua);
  const isTablet = /iPad|Tablet|Nexus 7|Nexus 9|SM-T/i.test(ua);
  const isMobile = /Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua);

  const deviceType: UserAgentInfo["deviceType"] = isBot
    ? "bot"
    : isTablet
      ? "tablet"
      : isMobile
        ? "mobile"
        : "desktop";

  return { browser: detectBrowser(ua), os: detectOs(ua), deviceType };
}
