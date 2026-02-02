/**
 * Centralized conversion service for all modules (Contracts, BOQ, Buildings, Reports, etc.).
 * - Store all values in base units internally: height → meter, area → sqm, volume → m³, currency → AED.
 * - Convert to Admin-selected units/currency at display and calculation layers only.
 * - Use getConversionFactors(prefs) for display formatting; convertFromBase/convertToBase for values.
 * - Reports and exports should fetch OrganizationPreferences and use this service for output in display units.
 */

// Base units used for internal storage (do not change without migration)
export const BASE_UNITS = {
  CURRENCY: 'AED',
  LENGTH: 'meter',
  AREA: 'sqm',
  VOLUME: 'm3',
  HEIGHT: 'meter',
  WEIGHT: 'kg',
} as const;

// Supported display options (extensible)
export const SUPPORTED_CURRENCIES = ['AED', 'USD', 'EUR', 'INR', 'SAR'] as const;
export const SUPPORTED_LENGTH_UNITS = ['meter', 'feet'] as const;
export const SUPPORTED_AREA_UNITS = ['sqm', 'sqft'] as const;
export const SUPPORTED_VOLUME_UNITS = ['m3', 'ft3'] as const;
export const SUPPORTED_HEIGHT_UNITS = ['meter', 'feet'] as const;
export const SUPPORTED_WEIGHT_UNITS = ['kg', 'ton'] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];
export type LengthUnit = (typeof SUPPORTED_LENGTH_UNITS)[number];
export type AreaUnit = (typeof SUPPORTED_AREA_UNITS)[number];
export type VolumeUnit = (typeof SUPPORTED_VOLUME_UNITS)[number];
export type HeightUnit = (typeof SUPPORTED_HEIGHT_UNITS)[number];
export type WeightUnit = (typeof SUPPORTED_WEIGHT_UNITS)[number];

/** Company preferences for display (from Company model) */
export interface CompanyPreferences {
  defaultCurrency?: string | null;
  lengthUnit?: string | null;
  areaUnit?: string | null;
  volumeUnit?: string | null;
  heightUnit?: string | null;
  weightUnit?: string | null;
}

/**
 * Conversion factors: multiply base value by factor to get display value.
 * Used by frontend/display layer to convert stored (base) values to user-selected units.
 */
export interface ConversionFactors {
  currency: { code: string; fromBase: number }; // 1 AED = fromBase display units
  length: number;   // base meter -> display (e.g. 3.28084 for feet)
  area: number;     // base sqm -> display (e.g. 10.7639 for sqft)
  volume: number;  // base m³ -> display (e.g. 35.3147 for ft³)
  height: number;  // same as length
  weight: number;  // base kg -> display (e.g. 0.001 for ton)
}

// Approximate AED to other currencies (1 AED = X in display currency). Extensible via config/DB later.
const CURRENCY_FROM_AED: Record<string, number> = {
  AED: 1,
  USD: 0.2725,
  EUR: 0.25,
  INR: 22.5,
  SAR: 1.02,
};

// Base -> display: multiply base value by this to get display value
const LENGTH_TO_FEET = 3.28084;
const AREA_TO_SQFT = 10.7639;
const VOLUME_TO_FT3 = 35.3147;
const WEIGHT_TO_TON = 0.001;

/**
 * Returns conversion factors for the given company preferences.
 * Frontend uses these to convert stored (base) values to display values.
 */
export function getConversionFactors(prefs: CompanyPreferences): ConversionFactors {
  const currency = (prefs.defaultCurrency || BASE_UNITS.CURRENCY).toUpperCase();
  const length = prefs.lengthUnit || BASE_UNITS.LENGTH;
  const area = prefs.areaUnit || BASE_UNITS.AREA;
  const volume = prefs.volumeUnit || BASE_UNITS.VOLUME;
  const height = prefs.heightUnit || BASE_UNITS.HEIGHT;
  const weight = prefs.weightUnit || BASE_UNITS.WEIGHT;

  return {
    currency: {
      code: currency,
      fromBase: CURRENCY_FROM_AED[currency] ?? CURRENCY_FROM_AED[BASE_UNITS.CURRENCY],
    },
    length: length === 'feet' ? LENGTH_TO_FEET : 1,
    area: area === 'sqft' ? AREA_TO_SQFT : 1,
    volume: volume === 'ft3' ? VOLUME_TO_FT3 : 1,
    height: height === 'feet' ? LENGTH_TO_FEET : 1,
    weight: weight === 'ton' ? WEIGHT_TO_TON : 1,
  };
}

/**
 * Convert a value from base unit to display unit (for API responses if needed).
 * Most conversion can be done on frontend using getConversionFactors.
 */
export function convertFromBase(
  value: number,
  type: 'length' | 'area' | 'volume' | 'height' | 'weight' | 'currency',
  factors: ConversionFactors
): number {
  switch (type) {
    case 'length':
      return value * factors.length;
    case 'area':
      return value * factors.area;
    case 'volume':
      return value * factors.volume;
    case 'height':
      return value * factors.height;
    case 'weight':
      return value * factors.weight;
    case 'currency':
      return value * factors.currency.fromBase;
    default:
      return value;
  }
}

/**
 * Convert a value from display unit to base unit (for storing user input).
 * Frontend should send base values; this is for server-side use if display values are ever sent.
 */
export function convertToBase(
  displayValue: number,
  type: 'length' | 'area' | 'volume' | 'height' | 'weight' | 'currency',
  factors: ConversionFactors
): number {
  switch (type) {
    case 'length': {
      const f = factors.length;
      return f !== 0 ? displayValue / f : displayValue;
    }
    case 'area': {
      const f = factors.area;
      return f !== 0 ? displayValue / f : displayValue;
    }
    case 'volume': {
      const f = factors.volume;
      return f !== 0 ? displayValue / f : displayValue;
    }
    case 'height': {
      const f = factors.height;
      return f !== 0 ? displayValue / f : displayValue;
    }
    case 'weight': {
      const f = factors.weight;
      return f !== 0 ? displayValue / f : displayValue;
    }
    case 'currency': {
      const f = factors.currency.fromBase;
      return f !== 0 ? displayValue / f : displayValue;
    }
    default:
      return displayValue;
  }
}

/**
 * Valid preference values for validation
 */
export const PREFERENCE_OPTIONS = {
  currencies: [...SUPPORTED_CURRENCIES],
  lengthUnits: [...SUPPORTED_LENGTH_UNITS],
  areaUnits: [...SUPPORTED_AREA_UNITS],
  volumeUnits: [...SUPPORTED_VOLUME_UNITS],
  heightUnits: [...SUPPORTED_HEIGHT_UNITS],
  weightUnits: [...SUPPORTED_WEIGHT_UNITS],
} as const;
