import { Router, type IRouter } from "express";
import {
  CreateAccessRequestBody,
  CreateAccessRequestResponse,
  GetPortalConfigResponse,
} from "@workspace/api-zod";
import {
  cleanupStoredRequests,
  createAccessRequest,
  getOrCreateSettings,
} from "../lib/local-db";
import { lookupDeviceByIp } from "../lib/mypublicwifi";
import { vendorForMac } from "../lib/oui";
import { parseUserAgent } from "../lib/user-agent";

const router: IRouter = Router();

router.get("/portal/config", (_req, res): void => {
  const settings = getOrCreateSettings();
  cleanupStoredRequests(settings);

  res.json(
    GetPortalConfigResponse.parse({
      networkName: settings.networkName,
      portalTitle: settings.portalTitle,
      portalMessage: settings.portalMessage,
      privacyNotice: settings.privacyNotice,
      policyVersion: settings.policyVersion,
      requiredFields: ["displayName", "purposeAccepted", "privacyAccepted"],
    }),
  );
});

router.post("/access/requests", (req, res): void => {
  const parsed = CreateAccessRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = getOrCreateSettings();
  cleanupStoredRequests(settings);

  if (!parsed.data.purposeAccepted || !parsed.data.privacyAccepted) {
    res.status(400).json({
      error: "Both the access purpose and local privacy notice must be accepted.",
    });
    return;
  }

  if (parsed.data.policyVersion !== settings.policyVersion) {
    res.status(400).json({
      error: "This portal policy has changed. Refresh the page and review it again.",
    });
    return;
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + settings.retentionDays * 24 * 60 * 60 * 1000,
  );
  const requestId = crypto.randomUUID();
  const rawIp = req.ip || req.socket.remoteAddress || "unknown";
  const ipAddress = rawIp.replace(/^::ffff:/i, "");
  const userAgent = req.get("user-agent") || "unknown";

  // Everything below is gathered automatically; the guest never types it.
  const identity = lookupDeviceByIp(ipAddress);
  const agent = parseUserAgent(userAgent);
  const device = parsed.data.device ?? null;

  const screen =
    device?.screenWidth && device?.screenHeight
      ? `${device.screenWidth}x${device.screenHeight}${device.pixelRatio ? ` @${device.pixelRatio}x` : ""}`
      : null;
  const viewport =
    device?.viewportWidth && device?.viewportHeight
      ? `${device.viewportWidth}x${device.viewportHeight}`
      : null;

  const hardwareParts: string[] = [];
  if (device?.hardwareConcurrency) hardwareParts.push(`${device.hardwareConcurrency} cores`);
  if (device?.deviceMemoryGb) hardwareParts.push(`${device.deviceMemoryGb} GB RAM`);

  createAccessRequest({
    requestId,
    displayName: parsed.data.displayName.trim(),
    contact: parsed.data.contact?.trim() || null,
    policyVersion: parsed.data.policyVersion,
    purposeAccepted: parsed.data.purposeAccepted,
    privacyAccepted: parsed.data.privacyAccepted,
    submittedAt: now,
    expiresAt,
    ipAddress,
    userAgent,
    macAddress: identity.mac,
    deviceHostname: identity.hostName,
    deviceVendor: vendorForMac(identity.mac),
    deviceType: agent.deviceType,
    browser: agent.browser,
    os: agent.os,
    screen,
    viewport,
    language: device?.language ?? null,
    timezone: device?.timezone ?? null,
    platform: device?.platform ?? null,
    hardware: hardwareParts.length ? hardwareParts.join(", ") : null,
    touchPoints: device?.maxTouchPoints ?? null,
    connectionType: device?.connectionType ?? null,
    acceptLanguage: req.get("accept-language") ?? null,
    referer: req.get("referer") ?? null,
    portalOpenedAt: device?.openedAt ?? null,
    timeOnFormMs:
      device?.openedAt && !Number.isNaN(device.openedAt.getTime())
        ? Math.max(0, now.getTime() - device.openedAt.getTime())
        : null,
  });

  res.status(201).json(
    CreateAccessRequestResponse.parse({
      requestId,
      status: "pending",
      message: "Your request was sent to the local network operator.",
      submittedAt: now,
    }),
  );
});

export default router;
