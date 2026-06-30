import { Response, NextFunction } from 'express';
import prisma from '../config/database';
import { AuthRequest } from './auth.middleware';
import { AbilityKey, roleCanDefault } from '../utils/roleAbilities';

export const requireAbility = (ability: AbilityKey) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const role = req.user.role;

    // SUPER_ADMIN bypass is enforced in requireRole too, but keep here as well.
    if (role === 'SUPER_ADMIN' || role === 'ADMIN') {
      next();
      return;
    }

    try {
      const row = await prisma.roleAbility.findUnique({
        where: { role_ability: { role: role as any, ability } },
        select: { enabled: true },
      });
      const allowed = row?.enabled ?? roleCanDefault(role, ability);
      if (!allowed) {
        res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
        return;
      }
      next();
    } catch (e) {
      // Fail closed if DB errors, but keep defaults for safety
      const allowed = roleCanDefault(role, ability);
      if (!allowed) {
        res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
        return;
      }
      next();
    }
  };
};

