"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === 'true'
        ? ['query', 'error', 'warn']
        : process.env.NODE_ENV === 'development'
            ? ['error', 'warn']
            : ['error'],
});
exports.default = prisma;
//# sourceMappingURL=database.js.map