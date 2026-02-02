import { Router } from 'express';
import * as mapsController from '../controllers/maps.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

/**
 * @route   GET /api/maps/validate-makani
 * @desc    Validate Makani number (10-digit UAE addressing system)
 * @access  Private (requires authentication)
 */
router.get('/validate-makani', authenticate, mapsController.validateMakani);

/**
 * @route   GET /api/maps/makani
 * @desc    Get location information from Makani number
 * @access  Private (requires authentication)
 */
router.get('/makani', authenticate, mapsController.getLocationFromMakani);

/**
 * @route   GET /api/maps/location
 * @desc    Get location information from coordinates
 * @access  Private (requires authentication)
 */
router.get('/location', authenticate, mapsController.getLocationInfo);

export default router;
