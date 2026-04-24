import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { uploadPolicyFile } from '../middleware/upload.middleware';
import {
  listCompanyPolicies,
  createCompanyPolicy,
  updateCompanyPolicy,
  deleteCompanyPolicy,
  acknowledgeCompanyPolicy,
  downloadCompanyPolicyFile,
} from '../controllers/companyPolicy.controller';

const router = Router();

router.use(authenticate);

router.get('/', listCompanyPolicies);
router.get('/:id/download', downloadCompanyPolicyFile);
router.post(
  '/',
  requireRole('ADMIN', 'HR'),
  (req, res, next) => {
    uploadPolicyFile(req, res, (err) => {
      if (err) {
        res.status(400).json({ success: false, message: (err as Error).message || 'File upload failed' });
        return;
      }
      next();
    });
  },
  createCompanyPolicy
);
router.put('/:id', updateCompanyPolicy);
router.delete('/:id', deleteCompanyPolicy);
router.post('/:id/acknowledge', acknowledgeCompanyPolicy);

export default router;
