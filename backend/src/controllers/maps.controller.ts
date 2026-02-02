import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Validate Makani number
 * Makani is a 10-digit UAE addressing system
 */
export const validateMakani = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { makaniNumber } = req.query;

    if (!makaniNumber) {
      res.status(400).json({
        success: false,
        message: 'Makani number is required',
      });
      return;
    }

    const makani = String(makaniNumber).trim();

    // Makani numbers are 10 digits
    if (!/^\d{10}$/.test(makani)) {
      res.status(400).json({
        success: false,
        message: 'Invalid Makani number format. Must be exactly 10 digits.',
        data: {
          makaniNumber: makani,
          isValid: false,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        makaniNumber: makani,
        isValid: true,
        message: 'Makani number is valid',
      },
    });
  } catch (error) {
    console.error('Error validating Makani number:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate Makani number',
    });
  }
};

/**
 * Get location information from Makani number
 * This endpoint can be extended to call Makani API if available
 */
export const getLocationFromMakani = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { makaniNumber } = req.query;

    if (!makaniNumber) {
      res.status(400).json({
        success: false,
        message: 'Makani number is required',
      });
      return;
    }

    const makani = String(makaniNumber).trim();

    // Validate Makani format
    if (!/^\d{10}$/.test(makani)) {
      res.status(400).json({
        success: false,
        message: 'Invalid Makani number format. Must be exactly 10 digits.',
      });
      return;
    }

    // In a full implementation, you would call the Makani API here
    // For now, return the validated Makani number
    // You can integrate with UAE government Makani API if available
    
    res.json({
      success: true,
      data: {
        makaniNumber: makani,
        // These fields would be populated from Makani API response
        // address: '...',
        // region: '...',
        // community: '...',
        // coordinates: { latitude: ..., longitude: ... }
      },
      message: 'Makani number validated. Location details can be fetched from Makani API.',
      note: 'To get full address details, integrate with UAE Makani API service',
    });
  } catch (error) {
    console.error('Error getting location from Makani:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve location from Makani number',
    });
  }
};

/**
 * Get location info from coordinates (for backward compatibility)
 */
export const getLocationInfo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
      return;
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude format',
      });
      return;
    }

    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({
        success: false,
        message: 'Latitude must be between -90 and 90, longitude must be between -180 and 180',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        latitude: lat,
        longitude: lng,
      },
      message: 'Location information retrieved',
    });
  } catch (error) {
    console.error('Error getting location info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve location information',
    });
  }
};
