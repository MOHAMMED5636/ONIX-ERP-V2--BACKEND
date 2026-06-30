import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  ABILITY_ENABLE_IMPLIES,
  ALL_ABILITIES,
  AbilityKey,
  BuilderActionKind,
  MANAGED_ROLES,
  findBuilderGroupAction,
  getBuilderMetadata,
  roleCanDefault,
} from '../utils/roleAbilities';

function normalizeRole(role: any): string | null {
  if (!role || typeof role !== 'string') return null;
  const r = role.toUpperCase();
  return r;
}

function normalizeAbility(ability: any): AbilityKey | null {
  if (!ability || typeof ability !== 'string') return null;
  const a = ability.toUpperCase();
  return (ALL_ABILITIES as string[]).includes(a) ? (a as AbilityKey) : null;
}

const BUILDER_ACTIONS: BuilderActionKind[] = ['view', 'add', 'delete', 'manage'];

function normalizeBuilderAction(action: any): BuilderActionKind | null {
  if (!action || typeof action !== 'string') return null;
  const a = action.toLowerCase() as BuilderActionKind;
  return BUILDER_ACTIONS.includes(a) ? a : null;
}

async function persistAbility(role: string, ability: AbilityKey, enabled: boolean): Promise<void> {
  await prisma.roleAbility.upsert({
    where: { role_ability: { role: role as any, ability } },
    update: { enabled },
    create: { role: role as any, ability, enabled },
  });
}

/** When enabling abilities, applies `ABILITY_ENABLE_IMPLIES` (and nested implies). */
async function applyEnableImplications(role: string, triggered: AbilityKey): Promise<void> {
  const implied = ABILITY_ENABLE_IMPLIES[triggered];
  if (!implied?.length) return;
  for (const a of implied) {
    await persistAbility(role, a, true);
    await applyEnableImplications(role, a);
  }
}

export async function getMyAbilities(req: AuthRequest, res: Response) {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const role = req.user.role;

  const rows = await prisma.roleAbility.findMany({
    where: { role: role as any },
    select: { ability: true, enabled: true },
  });

  const map: Record<string, boolean> = {};
  for (const ability of ALL_ABILITIES) {
    map[ability] = roleCanDefault(role, ability);
  }
  for (const r of rows) {
    map[r.ability] = r.enabled;
  }

  return res.json({ success: true, data: { role, abilities: map } });
}

export async function getRoleAbilities(req: AuthRequest, res: Response) {
  const role = normalizeRole(req.query.role);
  const builder = getBuilderMetadata();
  if (!role) {
    return res.json({
      success: true,
      data: {
        roles: MANAGED_ROLES,
        abilities: ALL_ABILITIES,
        builder,
      },
    });
  }

  const rows = await prisma.roleAbility.findMany({
    where: { role: role as any },
    select: { ability: true, enabled: true },
  });

  const map: Record<string, boolean> = {};
  for (const ability of ALL_ABILITIES) {
    map[ability] = roleCanDefault(role, ability);
  }
  for (const r of rows) {
    map[r.ability] = r.enabled;
  }

  return res.json({ success: true, data: { role, abilities: map, builder } });
}

export async function setRoleAbility(req: AuthRequest, res: Response) {
  const role = normalizeRole(req.body?.role);
  const ability = normalizeAbility(req.body?.ability);
  const enabled = req.body?.enabled;

  if (!role || !ability || typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }

  await persistAbility(role, ability, enabled);
  if (enabled) await applyEnableImplications(role, ability);

  return res.json({ success: true });
}

/** Toggle one Role Builder cell (all mapped ability keys share the same enabled value). */
export async function setRoleBuilderCell(req: AuthRequest, res: Response) {
  const role = normalizeRole(req.body?.role);
  const groupId = typeof req.body?.groupId === 'string' ? req.body.groupId : null;
  const action = normalizeBuilderAction(req.body?.action);
  const enabled = req.body?.enabled;

  if (!role || !groupId || !action || typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }

  const keys = findBuilderGroupAction(groupId, action);
  if (!keys?.length) {
    return res.status(400).json({ success: false, message: 'Unknown group/action' });
  }

  const uniq = [...new Set(keys)];
  for (const ability of uniq) {
    await persistAbility(role, ability, enabled);
    if (enabled) await applyEnableImplications(role, ability);
  }

  return res.json({ success: true });
}

