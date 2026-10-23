import { Router, type IRouter } from "express";
import {
  DecideAccessRequestBody,
  DecideAccessRequestParams,
  DecideAccessRequestResponse,
  EraseAccessRequestParams,
  GetAdminSettingsResponse,
  GetAdminSummaryResponse,
  GetHotspotStatusResponse,
  ListAccessRequestsQueryParams,
  ListAccessRequestsResponse,
  ListAccessRequestsResponseItem,
  UpdateAdminSettingsBody,
  UpdateAdminSettingsResponse,
} from "@workspace/api-zod";
import {
  cleanupStoredRequests,
  decideAccessRequest,
  eraseAccessRequest,
  getOrCreateSettings,
  hideDevice,
  listAccessRequests,
  listHiddenDevices,
  unhideDevice,
  updateSettings,
} from "../lib/local-db";
import { readMyPublicWifiDevices, readUrlLog } from "../lib/mypublicwifi";

const router: IRouter = Router();

router.use((req, res, next): void => {
  const address = (req.ip || req.socket.remoteAddress || "")
    .replace(/^::ffff:/, "")
    .toLowerCase();
  if (address !== "127.0.0.1" && address !== "::1") {
    res.status(403).json({ error: "The operator console is localhost-only." });
    return;
  }
  next();
});

function hotspotStatus(settings: ReturnType<typeof getOrCreateSettings>) {
  const isWindows = process.platform === "win32";
  const providerReady = isWindows && process.env.MY_PUBLIC_WIFI_READY === "true";
  const state = providerReady ? "ready" : "needs_setup";

  return GetHotspotStatusResponse.parse({
    platform: isWindows ? "Windows" : `${process.platform} preview`,
    state,
    provider: "MyPublicWiFi",
    networkName: settings.networkName,
    hotspotAddress: settings.hotspotAddress,
    internetForwarding: false,
    checklist: [
      {
        label: "Windows 10 host",
        state: isWindows ? "ready" : "action_required",
        detail: isWindows
          ? "The local service is running on Windows."
          : "The preview is not running on the target Windows host.",
      },
      {
        label: "MyPublicWiFi",
        state: providerReady ? "ready" : "action_required",
        detail: providerReady
          ? "MyPublicWiFi is marked ready by the local installation."
          : "Start MyPublicWiFi and configure it to use this portal address.",
      },
      {
        label: "Internet forwarding",
        state: "ready",
        detail: "Internet forwarding is permanently disabled by this application.",
      },
      {
        label: "Browsing log",
        state: "ready",
        detail:
          "Read from MyPublicWiFi and shown to the operator; disclosed in the portal privacy notice.",
      },
    ],
  });
}

router.get("/admin/summary", (_req, res): void => {
  const settings = getOrCreateSettings();
  cleanupStoredRequests(settings);
  const requests = listAccessRequests();
  const today = new Date().toISOString().slice(0, 10);
  const approvedToday = requests.filter(
    (request) =>
      request.status === "approved" &&
      request.decidedAt?.toISOString().slice(0, 10) === today,
  ).length;

  res.json(
    GetAdminSummaryResponse.parse({
      pendingCount: requests.filter((request) => request.status === "pending").length,
      approvedToday,
      totalStored: requests.length,
      expiredCount: requests.filter((request) => request.status === "expired").length,
      retentionDays: settings.retentionDays,
      networkName: settings.networkName,
      hotspotState: hotspotStatus(settings).state,
      lastRequestAt: requests[0]?.submittedAt ?? null,
    }),
  );
});

router.get("/admin/requests", (req, res): void => {
  const parsed = ListAccessRequestsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = getOrCreateSettings();
  cleanupStoredRequests(settings);
  const status = parsed.data.status && parsed.data.status !== "all" ? parsed.data.status : undefined;
  const requests = listAccessRequests(status);

  res.json(ListAccessRequestsResponse.parse(requests.map((request) => ListAccessRequestsResponseItem.parse(request))));
});

router.patch("/admin/requests/:requestId", (req, res): void => {
  const params = DecideAccessRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = DecideAccessRequestBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updated = decideAccessRequest(params.data.requestId, body.data.decision);
  if (!updated) {
    res.status(404).json({ error: "Access request not found." });
    return;
  }

  res.json(DecideAccessRequestResponse.parse(updated));
});

router.post("/admin/requests/:requestId/erase", (req, res): void => {
  const params = EraseAccessRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!eraseAccessRequest(params.data.requestId)) {
    res.status(404).json({ error: "Access request not found." });
    return;
  }

  res.sendStatus(204);
});

router.get("/admin/settings", (_req, res): void => {
  res.json(GetAdminSettingsResponse.parse(getOrCreateSettings()));
});

router.patch("/admin/settings", (req, res): void => {
  const body = UpdateAdminSettingsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  if (body.data.internetForwarding === true) {
    res.status(400).json({ error: "Internet forwarding is permanently disabled." });
    return;
  }

  const { internetForwarding: _ignored, ...allowedUpdates } = body.data;
  const updated = updateSettings(allowedUpdates);
  res.json(UpdateAdminSettingsResponse.parse(updated));
});

function normalizeIp(value: string | null | undefined): string {
  return (value ?? "").replace(/^::ffff:/i, "").trim().toLowerCase();
}

router.get("/admin/devices", (req, res): void => {
  const settings = getOrCreateSettings();
  cleanupStoredRequests(settings);
  const requests = listAccessRequests();
  const report = readMyPublicWifiDevices();
  const includeHidden = String(req.query.includeHidden ?? "") === "true";
  const hidden = new Set(listHiddenDevices());

  const requestsByIp = new Map<string, typeof requests>();
  for (const request of requests) {
    const ip = normalizeIp(request.ipAddress);
    if (!ip) continue;
    const list = requestsByIp.get(ip) ?? [];
    list.push(request);
    requestsByIp.set(ip, list);
  }

  // A stored MAC is a stable link; IP addresses are only a fallback because DHCP
  // leases get reused by other devices over time.
  const requestsByMac = new Map<string, typeof requests>();
  for (const request of requests) {
    const mac = request.macAddress ? request.macAddress.toUpperCase() : null;
    if (!mac) continue;
    const list = requestsByMac.get(mac) ?? [];
    list.push(request);
    requestsByMac.set(mac, list);
  }

  const devices = report.devices.map((device) => {
    const seen = new Set<string>();
    const submissions: typeof requests = [];
    for (const request of requestsByMac.get(device.mac.toUpperCase()) ?? []) {
      if (seen.has(request.requestId)) continue;
      seen.add(request.requestId);
      submissions.push(request);
    }
    for (const ip of device.ipAddresses) {
      for (const request of requestsByIp.get(normalizeIp(ip)) ?? []) {
        if (seen.has(request.requestId)) continue;
        seen.add(request.requestId);
        submissions.push(request);
      }
    }
    submissions.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());

    return {
      mac: device.mac,
      hostNames: device.hostNames,
      ipAddresses: device.ipAddresses,
      firstSeen: device.firstSeen,
      lastSeen: device.lastSeen,
      sessionCount: device.sessions.length,
      totalMinutes: device.totalMinutes,
      totalBytesDownload: device.totalBytesDownload,
      totalBytesUpload: device.totalBytesUpload,
      sessions: device.sessions,
      submissions,
      hidden: hidden.has(device.mac.toUpperCase()),
    };
  });

  const visible = includeHidden ? devices : devices.filter((device) => !device.hidden);

  res.json({
    available: report.available,
    root: report.root,
    connectedDeviceCount: visible.length,
    identifiedDeviceCount: visible.filter((device) => device.submissions.length > 0).length,
    hiddenCount: devices.filter((device) => device.hidden).length,
    devices: visible,
  });
});

const MAC_PATTERN = /^[0-9A-F]{2}(-[0-9A-F]{2}){5}$/;

router.post("/admin/devices/:mac/hide", (req, res): void => {
  const mac = String(req.params.mac ?? "").toUpperCase();
  if (!MAC_PATTERN.test(mac)) {
    res.status(400).json({ error: "Invalid MAC address." });
    return;
  }
  hideDevice(mac);
  res.json({ mac, hidden: true });
});

router.post("/admin/devices/:mac/unhide", (req, res): void => {
  const mac = String(req.params.mac ?? "").toUpperCase();
  const restored = unhideDevice(mac);
  res.json({ mac, hidden: false, restored });
});

router.get("/admin/devices/:mac/urls", (req, res): void => {
  const mac = String(req.params.mac ?? "").toUpperCase();
  const requested = Number(req.query.limit ?? 200);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 200, 1), 1000);
  res.json({ mac, entries: readUrlLog(mac, limit) });
});

router.get("/admin/hotspot-status", (_req, res): void => {
  res.json(hotspotStatus(getOrCreateSettings()));
});

export default router;
