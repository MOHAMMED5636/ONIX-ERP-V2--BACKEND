import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getVapidPublicKey,
  upsertPushSubscription,
  removePushSubscription,
  removeAllPushSubscriptionsForUser,
  sendBrowserPushToUsers,
} from '../services/browserPush.service';

export const getPushPublicKey = async (_req: AuthRequest, res: Response): Promise<void> => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    res.status(503).json({
      success: false,
      message:
        'Browser push is not configured on the server. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env (run: npx web-push generate-vapid-keys).',
      enabled: false,
    });
    return;
  }
  res.json({ success: true, enabled: true, publicKey });
};

export const subscribePush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!getVapidPublicKey()) {
      res.status(503).json({ success: false, message: 'Browser push not configured' });
      return;
    }

    const { subscription } = req.body as {
      subscription?: {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
    };

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      res.status(400).json({ success: false, message: 'Invalid push subscription' });
      return;
    }

    await upsertPushSubscription(
      userId,
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      req.headers['user-agent'] as string | undefined,
    );

    res.json({ success: true, message: 'Push notifications enabled for this browser' });
  } catch (error: any) {
    console.error('subscribePush error:', error);
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to save subscription',
    });
  }
};

export const unsubscribePush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const endpoint = String(req.body?.endpoint || '').trim();
    if (endpoint) {
      await removePushSubscription(userId, endpoint);
    } else {
      await removeAllPushSubscriptionsForUser(userId);
    }

    res.json({ success: true, message: 'Push subscription removed' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to unsubscribe',
    });
  }
};

/** Send a test push to the current user (verify setup). */
export const testPush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    if (!getVapidPublicKey()) {
      res.status(503).json({ success: false, message: 'Browser push not configured' });
      return;
    }

    await sendBrowserPushToUsers([userId], {
      title: 'ONIX ERP notifications',
      body: 'Desktop notifications are working on this browser.',
      url: '/dashboard',
      tag: 'onix-push-test',
    });

    res.json({ success: true, message: 'Test notification sent (if this browser is subscribed)' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Test push failed',
    });
  }
};
