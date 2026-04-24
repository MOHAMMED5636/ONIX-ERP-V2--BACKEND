import type { Decimal } from '@prisma/client/runtime/library';

/** Salary fields exposed to the employee on their own profile (read-only). */
export type SelfServicePayroll = {
  currency: string;
  basicSalary: string | null;
  contractTotalSalary: string | null;
  allowance1: string | null;
  allowance2: string | null;
};

type LabourSalaryPick = {
  basicSalary: Decimal | null;
  contractTotalSalary: Decimal | null;
  allowance1: Decimal | null;
  allowance2: Decimal | null;
};

function amountString(v: Decimal | null | undefined): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toFixed(2);
}

/** Build payroll payload for self-service; null if no labour salary rows are set. */
export function labourDetailsToSelfServicePayroll(
  labour: LabourSalaryPick | null | undefined,
  currency = 'AED'
): SelfServicePayroll | null {
  if (!labour) return null;
  const basicSalary = amountString(labour.basicSalary);
  const contractTotalSalary = amountString(labour.contractTotalSalary);
  const allowance1 = amountString(labour.allowance1);
  const allowance2 = amountString(labour.allowance2);
  if (!basicSalary && !contractTotalSalary && !allowance1 && !allowance2) return null;
  return {
    currency,
    basicSalary,
    contractTotalSalary,
    allowance1,
    allowance2,
  };
}
