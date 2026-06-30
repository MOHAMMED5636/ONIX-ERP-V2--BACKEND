import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as workloadController from '../controllers/workload.controller';

const router = Router();

router.use(authenticate);

router.get('/matrix', workloadController.getMatrix);
router.get('/peer-managers', workloadController.getPeerProjectManagers);
router.get('/settings', workloadController.getSettings);
router.patch('/settings', workloadController.updateSettings);
router.get('/employees/:userId', workloadController.getEmployeeWorkload);
router.post('/reassign-preview', workloadController.previewReassignWorkload);

export default router;
