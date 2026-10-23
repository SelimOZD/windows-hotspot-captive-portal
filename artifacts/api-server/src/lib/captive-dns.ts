import dgram from "node:dgram";
import { logger } from "./logger";

/**
 * A tiny DNS "hijack" server for the captive portal.
 *
 * Some hotspot providers (e.g. MyPublicWiFi in no-internet mode) hand clients a
 * DNS server that cannot answer, so phones never resolve the connectivity-probe
 * hostname and never offer "Sign in to network". This server answers every A
 * query with the hotspot address, so any name a guest looks up points at the
 * portal. It binds to the specific hotspot IP:port, which Windows allows
 * alongside a wildcard 0.0.0.0:53 binding held by the hotspot provider.
 */
function buildResponse(query: Buffer, portalIp: string): Buffer | null {
  if (query.length < 12) return null;
  const questionCount = query.readUInt16BE(4);
  if (questionCount < 1) return null;

  // Walk the first question name to find where the question section ends.
  let offset = 12;
  let guard = 0;
  while (offset < query.length && guard++ < 128) {
    const length = query[offset];
    if (length === 0) {
      offset += 1;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      offset += 2;
      break;
    }
    offset += 1 + length;
  }
  if (offset + 4 > query.length) return null;

  const qtype = query.readUInt16BE(offset);
  const questionEnd = offset + 4;

  const octets = portalIp.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }

  const isAddressQuery = qtype === 1; // A record

  const header = Buffer.alloc(12);
  query.copy(header, 0, 0, 2); // same transaction id
  header.writeUInt16BE(0x8180, 2); // response, recursion desired+available, no error
  header.writeUInt16BE(1, 4); // one question
  header.writeUInt16BE(isAddressQuery ? 1 : 0, 6); // one answer only for A queries
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);

  const question = query.subarray(12, questionEnd);
  if (!isAddressQuery) {
    return Buffer.concat([header, question]);
  }

  const answer = Buffer.alloc(16);
  answer.writeUInt16BE(0xc00c, 0); // pointer to the question name
  answer.writeUInt16BE(1, 2); // TYPE A
  answer.writeUInt16BE(1, 4); // CLASS IN
  answer.writeUInt32BE(30, 6); // TTL
  answer.writeUInt16BE(4, 10); // RDLENGTH
  answer[12] = octets[0];
  answer[13] = octets[1];
  answer[14] = octets[2];
  answer[15] = octets[3];

  return Buffer.concat([header, question, answer]);
}

export type CaptiveDns = { close: () => void };

export function startCaptiveDns(host: string, portalIp: string, port = 53): CaptiveDns | null {
  if (!host || host === "0.0.0.0") return null;

  const socket = dgram.createSocket({ type: "udp4" });

  socket.on("message", (message, remote) => {
    const response = buildResponse(message, portalIp);
    if (!response) return;
    socket.send(response, remote.port, remote.address, (error) => {
      if (error) logger.debug({ err: error }, "Captive DNS reply failed");
    });
  });

  socket.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      logger.warn(
        { host, port },
        "Captive DNS could not bind (another DNS server owns this address); guests may not be redirected automatically.",
      );
    } else {
      logger.warn({ err: error, host, port }, "Captive DNS error");
    }
  });

  socket.bind(port, host, () => {
    logger.info({ host, port, answer: portalIp }, "Captive DNS hijack listening");
  });

  return { close: () => socket.close() };
}
