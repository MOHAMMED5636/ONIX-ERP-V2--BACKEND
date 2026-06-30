import webpush from 'web-push';
import prisma from '../config/database';
import { config } from '../config/env';

export type BrowserPushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function isConfigured(): boolean {
  return Boolean(config.webPush.publicKey && config.webPush.privateKey);
}

let vapidReady = false;

function ensureVapid(): boolean {
  if (!isConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      config.webPush.subject,
      config.webPush.publicKey,
      config.webPush.privateKey,
    );
    vapidReady = true;
  }
  return true;
}

export function getVapidPublicKey(): string | null {
  const key = config.webPush.publicKey?.trim();
  return key || null;
}

export async function upsertPushSubscription(
  userId: string,
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  userAgent?: string | null,
): Promise<void> {
  const endpoint = String(subscription.endpoint || '').trim();
  const p256dh = String(subscription.keys?.p256dh || '').trim();
  const auth = String(subscription.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error('INVALID_SUBSCRIPTION');
  }

  await prisma.browserPushSubscription.upsert({
    where: { endpoint },
    create: {
      userId,
      endpoint,
      p256dh,
      auth,
      userAgent: userAgent || null,
    },
    update: {
      userId,
      p256dh,
      auth,
      userAgent: userAgent || null,
    },
  });
}

export async function removePushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  const ep = String(endpoint || '').trim();
  if (!ep) return;
  await prisma.browserPushSubscription.deleteMany({
    where: { userId, endpoint: ep },
  });
}

export async function removeAllPushSubscriptionsForUser(userId: string): Promise<number> {
  const result = await prisma.browserPushSubscription.deleteMany({
    where: { userId },
  });
  return result.count;
}

/**
 * Send browser push to users (all devices). Skips excludeUserId. Fails silently per device.
 */
export async function sendBrowserPushToUsers(
  userIds: string[],
  payload: BrowserPushPayload,
  excludeUserId?: string | null,
): Promise<void> {
  if (!ensureVapid()) return;

  const unique = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))].filter(
    (id) => !excludeUserId || id !== excludeUserId,
  );
  if (unique.length === 0) return;

  let subs: Awaited<ReturnType<typeof prisma.browserPushSubscription.findMany>>;
  try {
    subs = await prisma.browserPushSubscription.findMany({
      where: { userId: { in: unique } },
    });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2021') {
      console.warn('browserPush: subscriptions table missing — run migrations or scripts/fix-browser-push-table.js');
      return;
    }
    throw err;
  }
  if (subs.length === 0) return;

  const frontendBase = config.frontendUrl.replace(/\/$/, '');
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url?.startsWith('http')
      ? payload.url
      : `${frontendBase}${payload.url?.startsWith('/') ? payload.url : `/${payload.url || ''}`}`,
    tag: payload.tag || 'onix-erp',
  });

  const staleEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (err: any) {
        const status = err?.statusCode ?? err?.status;
        if (status === 404 || status === 410) {
          staleEndpoints.push(sub.endpoint);
        }
      }
    }),
  );

  if (staleEndpoints.length > 0) {
    await prisma.browserPushSubscription.deleteMany({
      where: { endpoint: { in: staleEndpoints } },
    });
  }
}

export function buildTasksDeepLink(
  projectId?: string | null,
  taskId?: string | null,
): string {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (taskId) params.set('taskId', taskId);
  const qs = params.toString();
  return qs ? `/tasks?${qs}` : '/tasks';
}

export function buildChatDeepLink(projectId?: string | null): string {
  if (projectId) return `/project-chat?projectId=${encodeURIComponent(projectId)}`;
  return '/project-chat';
}
