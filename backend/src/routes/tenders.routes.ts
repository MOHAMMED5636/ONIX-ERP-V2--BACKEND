import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import * as tendersController from '../controllers/tenders.controller';

const router = Router();

// Assign tender to engineer (Admin only)
router.post('/assign', authenticate, requireRole('ADMIN'), tendersController.assignTenderToEngineer);

// Get invitation by token (public, but requires auth to accept)
router.get('/invitation/:token', tendersController.getInvitationByToken);

// Accept invitation (Engineer)
router.post('/invitation/:token/accept', authenticate, requireRole('TENDER_ENGINEER'), tendersController.acceptInvitation);

export default router;

