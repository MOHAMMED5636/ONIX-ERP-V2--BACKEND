import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getConversionFactors,
  PREFERENCE_OPTIONS,
  type CompanyPreferences,
} from '../services/conversion.service';

const VALID_CURRENCIES = new Set(PREFERENCE_OPTIONS.currencies);
const VALID_LENGTH = new Set(PREFERENCE_OPTIONS.lengthUnits);
const VALID_AREA = new Set(PREFERENCE_OPTIONS.areaUnits);
const VALID_VOLUME = new Set(PREFERENCE_OPTIONS.volumeUnits);
const VALID_HEIGHT = new Set(PREFERENCE_OPTIONS.heightUnits);
const VALID_WEIGHT = new Set(PREFERENCE_OPTIONS.weightUnits);

/** Ensure singleton row exists; return it */
async function getOrCreatePreferences() {
  let row = await prisma.organizationPreferences.findFirst();
  if (!row) {
    row = await prisma.organizationPreferences.create({
      data: {
        defaultCurrency: 'AED',
        lengthUnit: 'meter',
        areaUnit: 'sqm',
        volumeUnit: 'm3',
        heightUnit: 'meter',
        weightUnit: 'kg',
      },
    });
  }
  return row;
}

/**
 * Get organization preferences (Admin Profile context)
 * GET /api/auth/preferences
 * Access: Any authenticated user (read-only). Used app-wide for display/calculation.
 */
export const getPreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const row = await getOrCreatePreferences();
    const prefs: CompanyPreferences = {
      defaultCurrency: row.defaultCurrency,
      lengthUnit: row.lengthUnit,
      areaUnit: row.areaUnit,
      volumeUnit: row.volumeUnit,
      heightUnit: row.heightUnit,
      weightUnit: row.weightUnit,
    };
    const conversionFactors = getConversionFactors(prefs);

    res.json({
      success: true,
      data: {
        preferences: {
          defaultCurrency: row.defaultCurrency,
          lengthUnit: row.lengthUnit,
          areaUnit: row.areaUnit,
          volumeUnit: row.volumeUnit,
          heightUnit: row.heightUnit,
          weightUnit: row.weightUnit,
        },
        conversionFactors,
        options: PREFERENCE_OPTIONS,
      },
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Update organization preferences (Admin Profile)
 * PATCH /api/auth/preferences
 * Access: Admin only. Other roles get 403.
 */
export const updatePreferences = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      defaultCurrency,
      lengthUnit,
      areaUnit,
      volumeUnit,
      heightUnit,
      weightUnit,
    } = req.body;

    const data: Record<string, string> = {};

    if (defaultCurrency !== undefined) {
      const v = String(defaultCurrency).toUpperCase();
      if (v && !VALID_CURRENCIES.has(v as any)) {
        res.status(400).json({
          success: false,
          message: `Invalid defaultCurrency. Allowed: ${PREFERENCE_OPTIONS.currencies.join(', ')}`,
        });
        return;
      }
      data.defaultCurrency = v || 'AED';
    }
    if (lengthUnit !== undefined) {
      const v = String(lengthUnit).toLowerCase();
      if (v && !VALID_LENGTH.has(v as any)) {
        res.status(400).json({
          success: false,
          message: `Invalid lengthUnit. Allowed: ${PREFERENCE_OPTIONS.lengthUnits.join(', ')}`,
        });
        return;
      }
      data.lengthUnit = v || 'meter';
    }
    if (areaUnit !== undefined) {
      const v = String(areaUnit).toLowerCase();
      if (v && !VALID_AREA.has(v as any)) {
        res.status(400).json({
          success: false,
          message: `Invalid areaUnit. Allowed: ${PREFERENCE_OPTIONS.areaUnits.join(', ')}`,
        });
        return;
      }
      data.areaUnit = v || 'sqm';
    }
    if (volumeUnit !== undefined) {
      const v = String(volumeUnit).toLowerCase();
      if (v && !VALID_VOLUME.has(v as any)) {
        res.status(400).json({
          success: false,
          message: `Invalid volumeUnit. Allowed: ${PREFERENCE_OPTIONS.volumeUnits.join(', ')}`,
        });
        return;
      }
      data.volumeUnit = v || 'm3';
    }
    if (heightUnit !== undefined) {
      const v = String(heightUnit).toLowerCase();
      if (v && !VALID_HEIGHT.has(v as any)) {
        res.status(400).json({
          success: false,
          message: `Invalid heightUnit. Allowed: ${PREFERENCE_OPTIONS.heightUnits.join(', ')}`,
        });
        return;
      }
      data.heightUnit = v || 'meter';
    }
    if (weightUnit !== undefined) {
      const v = String(weightUnit).toLowerCase();
      if (v && !VALID_WEIGHT.has(v as any)) {
        res.status(400).json({
          success: false,
          message: `Invalid weightUnit. Allowed: ${PREFERENCE_OPTIONS.weightUnits.join(', ')}`,
        });
        return;
      }
      data.weightUnit = v || 'kg';
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, message: 'No valid preference fields to update' });
      return;
    }

    const row = await getOrCreatePreferences();
    const updated = await prisma.organizationPreferences.update({
      where: { id: row.id },
      data: {
        ...data,
        updatedBy: req.user!.id,
      },
    });

    const prefs: CompanyPreferences = {
      defaultCurrency: updated.defaultCurrency,
      lengthUnit: updated.lengthUnit,
      areaUnit: updated.areaUnit,
      volumeUnit: updated.volumeUnit,
      heightUnit: updated.heightUnit,
      weightUnit: updated.weightUnit,
    };

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: {
          defaultCurrency: updated.defaultCurrency,
          lengthUnit: updated.lengthUnit,
          areaUnit: updated.areaUnit,
          volumeUnit: updated.volumeUnit,
          heightUnit: updated.heightUnit,
          weightUnit: updated.weightUnit,
        },
        conversionFactors: getConversionFactors(prefs),
      },
    });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
