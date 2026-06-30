import app from './app';
import { config } from './config/env';
import prisma from './config/database';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { setSocketIo } from './utils/socketIo';
import { canUserAccessProjectChat } from './services/projectChatParticipants.service';
import {
  shapeTeamChatMessageForClient,
  teamMessagesVisibleToUser,
} from './utils/teamChatMessage.util';
import {
  startTaskReminderScheduler,
  stopTaskReminderScheduler,
} from './services/taskReminderScheduler.service';
import {
  startDocumentExpiryScheduler,
  stopDocumentExpiryScheduler,
} from './services/documentExpiryScheduler.service';
import {
  startProjectManagerTransferScheduler,
  stopProjectManagerTransferScheduler,
} from './services/projectManagerTransferScheduler.service';
import {
  startEamThresholdScheduler,
  stopEamThresholdScheduler,
} from './services/eam/thresholdScheduler.service';
import { sendBrowserPushToUsers } from './services/browserPush.service';
import { emitErpNotification } from './services/erpNotification.service';

const PORT = typeof config.port === 'string' ? parseInt(config.port, 10) : config.port;
const HOST = '0.0.0.0'; // Listen on all network interfaces

// Get local network IP address
import os from 'os';
function getLocalIPAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (nets) {
      for (const net of nets) {
        // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIPAddress();

type SocketAuthedUser = {
  id: string;
  email?: string;
  role?: string;
};

// Test database connection on startup
async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.error('   Please check your DATABASE_URL in .env file');
    console.error('   Error details:', error instanceof Error ? error.message : String(error));
  }
}

const httpServer = http.createServer(app);

// Socket.IO server for embedded ERP chat (SSO via ERP JWT)
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: true, // We already restrict in Express; allow socket across same origins
    credentials: true,
  },
});
setSocketIo(io);

function extractHandshakeToken(socket: any): string | undefined {
  const authToken = socket?.handshake?.auth?.token;
  if (typeof authToken === 'string' && authToken.trim()) return authToken;

  const queryToken = socket?.handshake?.query?.token;
  if (typeof queryToken === 'string' && queryToken.trim()) return queryToken;

  const headerAuth = socket?.handshake?.headers?.authorization;
  if (typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')) {
    const token = headerAuth.split(' ')[1];
    if (token?.trim()) return token;
  }
  return undefined;
}

io.use((socket, next) => {
  try {
    const token = extractHandshakeToken(socket);
    if (!token) return next(new Error('NO_TOKEN'));

    const decoded = jwt.verify(token, config.jwt.secret) as any;
    const user: SocketAuthedUser = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
    socket.data.user = user;
    return next();
  } catch (e) {
    return next(new Error('INVALID_TOKEN'));
  }
});

const server = httpServer.listen(PORT, HOST, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api`);
  console.log(`🌐 Network API: http://${LOCAL_IP}:${PORT}/api`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network Health: http://${LOCAL_IP}:${PORT}/health`);
  console.log(`\n💡 Access from other computers on your network:`);
  console.log(`   Backend: http://${LOCAL_IP}:${PORT}`);
  console.log(`   API: http://${LOCAL_IP}:${PORT}/api`);
  console.log(`📱 Leave certificate QR base: ${config.apiPublicUrl}`);
  console.log(`   (Set API_PUBLIC_URL in .env for internet/mobile verification)\n`);
  
  // Test database connection
  await testDatabaseConnection();
  startTaskReminderScheduler();
  startDocumentExpiryScheduler();
  startProjectManagerTransferScheduler();
  startEamThresholdScheduler();
});

// Handle server errors
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please use a different port.`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  stopTaskReminderScheduler();
  stopDocumentExpiryScheduler();
  stopProjectManagerTransferScheduler();
  stopEamThresholdScheduler();
  await prisma.$disconnect();
  io.close();
  server.close(() => {
    console.log('Process terminated');
  });
});

// --- Chat events (general + DM) ---
function getDmRoomKey(a: string, b: string) {
  const [x, y] = [a, b].sort();
  return `dm:${x}:${y}`;
}

function normalizeRoomKey(scope: string, userId: string, peerId?: string) {
  if (scope === 'general') return 'general';
  if (scope === 'dm' && peerId) return getDmRoomKey(userId, peerId);
  return undefined;
}

function parseDmRoomKey(roomKey: string): { a: string; b: string } | null {
  if (!roomKey?.startsWith('dm:')) return null;
  const parts = roomKey.split(':');
  if (parts.length !== 3) return null;
  const [, a, b] = parts;
  if (!a || !b) return null;
  return { a, b };
}

async function ensureRoom(roomKey: string, type: 'DM' | 'GENERAL') {
  const existing = await prisma.teamChatRoom.findUnique({ where: { roomKey } });
  if (existing) return existing;
  return prisma.teamChatRoom.create({
    data: { roomKey, type: type as any },
  });
}

async function ensureParticipants(roomId: string, userId: string, peerId?: string) {
  await prisma.teamChatParticipant.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: { roomId, userId },
    update: {},
  });
  if (peerId) {
    await prisma.teamChatParticipant.upsert({
      where: { roomId_userId: { roomId, userId: peerId } },
      create: { roomId, userId: peerId },
      update: {},
    });
  }
}

async function loadRecentMessages(roomKey: string, userId: string, limit = 50) {
  const room = await prisma.teamChatRoom.findUnique({
    where: { roomKey },
    select: { id: true },
  });
  if (!room) return [];
  const visibility = teamMessagesVisibleToUser(userId);
  const msgs = await prisma.teamChatMessage.findMany({
    where: visibility ? { roomId: room.id, ...visibility } : { roomId: room.id },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      sender: {
        select: { id: true, email: true, firstName: true, lastName: true, photo: true },
      },
    },
  });
  return msgs.map((m) =>
    shapeTeamChatMessageForClient(
      undefined,
      {
        id: m.id,
        content: m.content,
        createdAt: m.createdAt,
        senderId: m.senderId,
        deletedAt: m.deletedAt,
        sender: m.sender,
      },
      roomKey,
    ),
  );
}

io.on('connection', (socket) => {
  const user = socket.data.user as SocketAuthedUser | undefined;
  if (!user?.id) {
    socket.disconnect(true);
    return;
  }

  // Always join per-user room so we can deliver DM notifications
  // even when the recipient hasn't opened that chat (not joined the DM roomKey yet).
  socket.join(`user:${user.id}`);
  // Also join general for global notifications.
  socket.join('general');

  const MANAGER_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'HR', 'MANAGER', 'PROJECT_MANAGER']);
  if (MANAGER_ROLES.has(String(user.role || ''))) {
    socket.join('workload:managers');
  }

  socket.on('workload:join', (payload: { departmentId?: string } | string, cb?: (resp: unknown) => void) => {
    const departmentId =
      typeof payload === 'string'
        ? payload.trim()
        : String(payload?.departmentId || '').trim();
    if (departmentId) {
      socket.join(`workload:department:${departmentId}`);
    }
    cb?.({ ok: true, departmentId: departmentId || null });
  });

  socket.on('workload:leave', (payload: { departmentId?: string } | string) => {
    const departmentId =
      typeof payload === 'string'
        ? payload.trim()
        : String(payload?.departmentId || '').trim();
    if (departmentId) {
      socket.leave(`workload:department:${departmentId}`);
    }
  });

  socket.on('project:join', async (payload: any, cb?: (resp: any) => void) => {
    try {
      const projectId = String(payload?.projectId || '').trim();
      if (!projectId) throw new Error('INVALID_PROJECT');
      const allowed = await canUserAccessProjectChat(projectId, user.id, String(user.role || ''));
      if (!allowed) throw new Error('FORBIDDEN');
      socket.join(`project:${projectId}`);
      cb?.({ ok: true, projectId });
    } catch (e: any) {
      cb?.({ ok: false, error: e?.message || 'JOIN_FAILED' });
    }
  });

  socket.on('project:leave', (payload: any) => {
    const projectId = String(payload?.projectId || '').trim();
    if (projectId) socket.leave(`project:${projectId}`);
  });

  socket.on('team:read', async (payload: any, cb?: (resp: any) => void) => {
    try {
      const roomKey = String(payload?.roomKey || '').trim();
      if (!roomKey) throw new Error('INVALID_ROOM');
      if (roomKey === 'general') {
        io.to('general').emit('team:read', { roomKey: 'general', userId: user.id, at: new Date().toISOString() });
        cb?.({ ok: true });
        return;
      }
      const dm = parseDmRoomKey(roomKey);
      if (!dm) throw new Error('INVALID_ROOM');
      if (dm.a !== user.id && dm.b !== user.id) throw new Error('FORBIDDEN');
      socket.join(roomKey);
      io.to(roomKey).emit('team:read', { roomKey, userId: user.id, at: new Date().toISOString() });
      cb?.({ ok: true });
    } catch (e: any) {
      cb?.({ ok: false, error: e?.message || 'READ_FAILED' });
    }
  });

  socket.on('team:threads', async (_payload: any, cb?: (resp: any) => void) => {
    try {
      const rooms = await prisma.teamChatRoom.findMany({
        where: {
          type: 'DM' as any,
          participants: { some: { userId: user.id } },
        },
        include: {
          messages: {
            where: teamMessagesVisibleToUser(user.id),
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: { sender: { select: { id: true, email: true, firstName: true, lastName: true } } },
          },
        },
        take: 50,
      });

      const peerIds = rooms
        .map((r) => parseDmRoomKey(r.roomKey))
        .filter(Boolean)
        .map((dm) => (dm!.a === user.id ? dm!.b : dm!.a));
      const peerRows = await prisma.user.findMany({
        where: { id: { in: peerIds } },
        select: { id: true, email: true, firstName: true, lastName: true, department: true },
      });
      const peerById = new Map(peerRows.map((p) => [p.id, p]));

      const data = rooms
        .map((r) => {
          const dm = parseDmRoomKey(r.roomKey);
          if (!dm) return null;
          const peerId = dm.a === user.id ? dm.b : dm.a;
          const peer = peerById.get(peerId);
          const last = r.messages?.[0];
          return {
            roomKey: r.roomKey,
            peer: {
              id: peerId,
              email: peer?.email || '',
              name:
                [peer?.firstName, peer?.lastName].filter(Boolean).join(' ').trim() ||
                peer?.email ||
                'User',
              department: peer?.department || '',
            },
            lastMessage: last
              ? {
                  text: last.content,
                  createdAt: last.createdAt.toISOString(),
                }
              : null,
          };
        })
        .filter(Boolean);

      data.sort((a, b) => {
        const ta = a?.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const tb = b?.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return tb - ta;
      });

      cb?.({ ok: true, threads: data });
    } catch (e: any) {
      cb?.({ ok: false, error: e?.message || 'THREADS_FAILED' });
    }
  });

  socket.on('team:join', async (payload: any, cb?: (resp: any) => void) => {
    try {
      const scope = payload?.scope;
      const peerId = payload?.peerId;
      const roomKey = normalizeRoomKey(scope, user.id, peerId);
      if (!roomKey) throw new Error('INVALID_ROOM');

      // Ensure a DB room exists for BOTH General and DM so history persists across refresh.
      const room = await ensureRoom(roomKey, roomKey === 'general' ? 'GENERAL' : 'DM');
      if (roomKey !== 'general') {
        await ensureParticipants(room.id, user.id, peerId);
      }

      socket.join(roomKey);
      cb?.({ ok: true, roomKey });

      // Send history to the joining client.
      const history = await loadRecentMessages(roomKey, user.id, 50);
      socket.emit('team:messages', { roomKey, messages: history });
    } catch (e: any) {
      cb?.({ ok: false, error: e?.message || 'JOIN_FAILED' });
    }
  });

  socket.on('team:message', async (payload: any, cb?: (resp: any) => void) => {
    try {
      const text = String(payload?.text || '').trim();
      if (!text) throw new Error('EMPTY_MESSAGE');

      const scope = payload?.scope;
      const peerId = payload?.peerId;
      const roomKey = payload?.roomKey || normalizeRoomKey(scope, user.id, peerId);
      if (!roomKey) throw new Error('INVALID_ROOM');

      // Persist BOTH General and DM messages so they reload after refresh.
      const room = await ensureRoom(roomKey, roomKey === 'general' ? 'GENERAL' : 'DM');
      if (roomKey !== 'general') {
        const dm = parseDmRoomKey(roomKey);
        const other = dm ? (dm.a === user.id ? dm.b : dm.a) : peerId;
        await ensureParticipants(room.id, user.id, other);
      }
      const msg = await prisma.teamChatMessage.create({
        data: {
          roomId: room.id,
          senderId: user.id,
          content: text,
        },
      });

      await prisma.teamChatRoom.update({
        where: { id: room.id },
        data: { updatedAt: msg.createdAt },
      });

      // Resolve sender display name for UI.
      const senderRow = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, firstName: true, lastName: true, email: true, photo: true },
      });

      const message = {
        ...shapeTeamChatMessageForClient(
          undefined,
          {
            id: msg.id,
            content: msg.content,
            createdAt: msg.createdAt,
            senderId: user.id,
            sender: senderRow,
          },
          roomKey,
        ),
        scope: roomKey === 'general' ? 'general' : 'dm',
      };

      io.to(roomKey).emit('team:message', message);

      const senderName =
        `${senderRow?.firstName || ''} ${senderRow?.lastName || ''}`.trim() ||
        senderRow?.email ||
        'Someone';

      if (roomKey === 'general') {
        const generalSockets = await io.in('general').fetchSockets();
        const pushTargets: string[] = [];
        for (const remoteSocket of generalSockets) {
          const uid = (remoteSocket.data as { user?: { id?: string } })?.user?.id;
          if (!uid || uid === user.id) continue;
          pushTargets.push(uid);
          emitErpNotification(uid, {
            id: `team-general-${msg.id}-${uid}`,
            type: 'team_chat_general',
            title: `General chat — ${senderName}`,
            message: text.slice(0, 220),
            read: false,
            createdAt: msg.createdAt.toISOString(),
          });
        }
        void sendBrowserPushToUsers(
          pushTargets,
          {
            title: `General chat — ${senderName}`,
            body: text.slice(0, 180),
            url: '/project-chat?tab=team',
            tag: `team-general-${msg.id}`,
          },
          user.id,
        );
      }

      // Ensure both DM participants receive the event for notifications
      // even if they are not currently joined to the DM room.
      if (roomKey !== 'general') {
        const dm = parseDmRoomKey(roomKey);
        if (dm) {
          io.to(`user:${dm.a}`).emit('team:message', message);
          io.to(`user:${dm.b}`).emit('team:message', message);
        } else if (peerId) {
          io.to(`user:${peerId}`).emit('team:message', message);
        }

        const peerUserId = dm
          ? dm.a === user.id
            ? dm.b
            : dm.a
          : peerId
            ? String(peerId)
            : null;
        if (peerUserId && peerUserId !== user.id) {
          emitErpNotification(peerUserId, {
            id: `team-dm-${msg.id}-${peerUserId}`,
            type: 'team_chat_dm',
            title: `Message from ${senderName}`,
            message: text.slice(0, 220),
            read: false,
            createdAt: msg.createdAt.toISOString(),
          });
        }

        const pushTargets = dm
          ? [dm.a, dm.b]
          : peerId
            ? [peerId, user.id]
            : [];
        void sendBrowserPushToUsers(
          pushTargets,
          {
            title: `Team chat — ${senderName}`,
            body: text.slice(0, 180),
            url: '/project-chat?tab=team',
            tag: `team-dm-${roomKey}`,
          },
          user.id,
        );
      }
      cb?.({ ok: true, message });
    } catch (e: any) {
      cb?.({ ok: false, error: e?.message || 'SEND_FAILED' });
    }
  });
});
