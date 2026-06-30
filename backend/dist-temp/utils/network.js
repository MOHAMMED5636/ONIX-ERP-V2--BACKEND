"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalIPv4 = getLocalIPv4;
exports.isLocalhostUrl = isLocalhostUrl;
exports.resolveApiPublicBaseUrl = resolveApiPublicBaseUrl;
exports.resolveCertificateVerifyBaseUrl = resolveCertificateVerifyBaseUrl;
const os_1 = __importDefault(require("os"));
/** First non-internal IPv4 on this machine (office LAN). */
function getLocalIPv4() {
    const interfaces = os_1.default.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const nets = interfaces[name];
        if (!nets)
            continue;
        for (const net of nets) {
            if (net.family === 'IPv4' && !net.internal)
                return net.address;
        }
    }
    return '127.0.0.1';
}
function isLocalhostUrl(url) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    }
    catch {
        return true;
    }
}
/**
 * Base URL for links that must open on a phone (QR codes, emails).
 * Never returns localhost — falls back to this machine's LAN IP.
 */
function resolveApiPublicBaseUrl() {
    const explicit = String(process.env.API_PUBLIC_URL || '').trim();
    if (explicit && !isLocalhostUrl(explicit)) {
        return explicit.replace(/\/+$/, '');
    }
    const certBase = String(process.env.CERTIFICATE_VERIFY_BASE_URL || '').trim();
    if (certBase && !isLocalhostUrl(certBase)) {
        return certBase.replace(/\/+$/, '');
    }
    const port = process.env.PORT || '3001';
    return `http://${getLocalIPv4()}:${port}`;
}
/** Frontend base for verify page (optional); skips localhost. */
function resolveCertificateVerifyBaseUrl() {
    const explicit = String(process.env.CERTIFICATE_VERIFY_BASE_URL || '').trim();
    if (explicit && !isLocalhostUrl(explicit)) {
        return explicit.replace(/\/+$/, '');
    }
    const frontend = String(process.env.FRONTEND_URL || '').trim();
    if (frontend && !isLocalhostUrl(frontend)) {
        return frontend.replace(/\/+$/, '');
    }
    const lanIp = getLocalIPv4();
    let port = '3000';
    try {
        if (frontend) {
            const u = new URL(frontend);
            port = u.port || '3000';
        }
    }
    catch {
        // keep default
    }
    return `http://${lanIp}:${port}`;
}
//# sourceMappingURL=network.js.map