"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuthenticate = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
/** Stateless: extract user from JWT only; no global/cached user. */
function extractBearerToken(req) {
    const headerToken = req.headers.authorization?.split(' ')[1];
    if (headerToken)
        return headerToken;
    const queryToken = req.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim())
        return queryToken.trim();
    return undefined;
}
const authenticate = (req, res, next) => {
    try {
        const token = extractBearerToken(req);
        if (!token) {
            res.status(401).json({
                success: false,
                message: 'No token provided',
                code: 'NO_TOKEN'
            });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwt.secret);
        req.user = {
            id: decoded.id,
            email: decoded.email,
            role: decoded.role,
        };
        next();
    }
    catch (error) {
        // Provide more specific error information
        let errorMessage = 'Invalid or expired token';
        let errorCode = 'INVALID_TOKEN';
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            errorMessage = 'Token has expired';
            errorCode = 'TOKEN_EXPIRED';
        }
        else if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            errorMessage = 'Invalid token';
            errorCode = 'INVALID_TOKEN';
        }
        res.status(401).json({
            success: false,
            message: errorMessage,
            code: errorCode
        });
        return;
    }
};
exports.authenticate = authenticate;
// Optional authentication middleware - allows request to continue even if token is invalid
// Useful for endpoints that can work with or without authentication
const optionalAuthenticate = (req, res, next) => {
    try {
        const token = extractBearerToken(req);
        if (token) {
            try {
                const decoded = jsonwebtoken_1.default.verify(token, env_1.config.jwt.secret);
                req.user = {
                    id: decoded.id,
                    email: decoded.email,
                    role: decoded.role,
                };
            }
            catch (error) {
                // Token invalid or expired, but continue without user
                req.user = undefined;
            }
        }
        next();
    }
    catch (error) {
        // If there's any other error, continue without authentication
        req.user = undefined;
        next();
    }
};
exports.optionalAuthenticate = optionalAuthenticate;
//# sourceMappingURL=auth.middleware.js.map