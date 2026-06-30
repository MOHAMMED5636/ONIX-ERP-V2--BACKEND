export type PayrollCurrency = 'AED' | 'USD';

/** Syrian branch employees use employee numbers such as SY-26-07. */
export function isSyrianPayrollEmployeeNo(employeeNo: string | null | undefined): boolean {
  const id = employeeNo?.trim();
  if (!id) return false;
  return /^SY-/i.test(id);
}

export function payrollCurrencyForEmployeeNo(employeeNo: string | null | undefined): PayrollCurrency {
  return isSyrianPayrollEmployeeNo(employeeNo) ? 'USD' : 'AED';
}

export function formatPayrollAmount(
  amount: number,
  employeeNo: string | null | undefined,
): string {
  const currency = payrollCurrencyForEmployeeNo(employeeNo);
  const n = Number.isFinite(amount) ? amount : 0;
  const formatted = n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${formatted}` : `${formatted} AED`;
}
