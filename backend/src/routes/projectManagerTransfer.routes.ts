import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as controller from '../controllers/projectManagerTransfer.controller';

const router = Router();

router.use(authenticate);

router.get('/managers', controller.listManagers);
router.get('/manager/:managerId/projects', controller.listManagerProjects);
router.get('/', controller.listTransfers);
router.post('/', controller.createTransfers);
router.post('/:id/complete', controller.completeTransfer);

export default router;
