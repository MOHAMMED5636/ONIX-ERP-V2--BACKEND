import { Decimal } from '@prisma/client/runtime/library';

export type DepreciationSnapshot = {
  purchaseCost: number;
  salvageValue: number;
  currentBookValue: number;
  accumulatedDepreciation: number;
  depreciationPercent: number;
  assetAgeYears: number;
  lifespanYears: number;
};

export function computeStraightLineDepreciation(input: {
  purchaseCost: number | Decimal;
  purchaseDate: Date;
  lifespanYears: number | Decimal;
  salvagePercent: number | Decimal;
  asOf?: Date;
}): DepreciationSnapshot {
  const purchaseCost = Number(input.purchaseCost);
  const lifespanYears = Math.max(0.01, Number(input.lifespanYears));
  const salvagePercent = Math.min(100, Math.max(0, Number(input.salvagePercent)));
  const salvageValue = purchaseCost * (salvagePercent / 100);
  const depreciableBase = Math.max(0, purchaseCost - salvageValue);

  const asOf = input.asOf || new Date();
  const purchase = new Date(input.purchaseDate);
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const assetAgeYears = Math.max(0, (asOf.getTime() - purchase.getTime()) / msPerYear);

  const annualDepreciation = depreciableBase / lifespanYears;
  let accumulatedDepreciation = Math.min(depreciableBase, annualDepreciation * assetAgeYears);
  let currentBookValue = purchaseCost - accumulatedDepreciation;
  if (currentBookValue < salvageValue) {
    currentBookValue = salvageValue;
    accumulatedDepreciation = purchaseCost - salvageValue;
  }

  const depreciationPercent =
    purchaseCost > 0 ? Math.round((accumulatedDepreciation / purchaseCost) * 10000) / 100 : 0;

  return {
    purchaseCost,
    salvageValue: Math.round(salvageValue * 100) / 100,
    currentBookValue: Math.round(currentBookValue * 100) / 100,
    accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
    depreciationPercent,
    assetAgeYears: Math.round(assetAgeYears * 100) / 100,
    lifespanYears,
  };
}
