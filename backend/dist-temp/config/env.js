"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const network_1 = require("../utils/network");
dotenv_1.default.config();
exports.config = {
    port: process.env.PORT || 3001, // Default to 3001 for local development, Render uses 10000
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    /** Public URL embedded in leave-certificate QR codes (never localhost). */
    certificateVerifyBaseUrl: (0, network_1.resolveCertificateVerifyBaseUrl)(),
    /** Base URL for API links on phones / external networks (never localhost). */
    apiPublicUrl: (0, network_1.resolveApiPublicBaseUrl)(),
    jwt: {
        secret: process.env.JWT_SECRET || 'default-secret-change-me',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    },
    database: {
        url: process.env.DATABASE_URL || '',
    },
    email: {
        host: process.env.EMAIL_HOST || '',
        port: parseInt(process.env.EMAIL_PORT || '587'),
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASS || '',
        from: process.env.EMAIL_FROM || 'noreply@onixgroup.ae',
    },
    upload: {
        dir: process.env.UPLOAD_DIR || './uploads',
        maxSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
        allowedTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [],
    },
    googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    },
    /** Web Push (browser notifications). Generate keys: npx web-push generate-vapid-keys */
    webPush: {
        publicKey: process.env.VAPID_PUBLIC_KEY || '',
        privateKey: process.env.VAPID_PRIVATE_KEY || '',
        subject: process.env.VAPID_SUBJECT || 'mailto:noreply@onixgroup.ae',
    },
};
//# sourceMappingURL=env.js.map