import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import * as roleAbilitiesController from '../controllers/roleAbilities.controller';

const router = Router();

router.use(authenticate);

// Any authenticated user can read their own effective abilities
router.get('/me', roleAbilitiesController.getMyAbilities);

// Only SUPER_ADMIN can manage role abilities (Role Builder feature)
router.get('/', requireRole('SUPER_ADMIN'), roleAbilitiesController.getRoleAbilities);
router.put('/', requireRole('SUPER_ADMIN'), roleAbilitiesController.setRoleAbility);
router.put('/builder-cell', requireRole('SUPER_ADMIN'), roleAbilitiesController.setRoleBuilderCell);

export default router;

