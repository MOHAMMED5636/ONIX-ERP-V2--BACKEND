"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labourDetailsToSelfServicePayroll = labourDetailsToSelfServicePayroll;
function amountString(v) {
    if (v == null)
        return null;
    const n = Number(v);
    if (Number.isNaN(n))
        return String(v);
    return n.toFixed(2);
}
/** Build payroll payload for self-service; null if no labour salary rows are set. */
function labourDetailsToSelfServicePayroll(labour, currency = 'AED') {
    if (!labour)
        return null;
    const basicSalary = amountString(labour.basicSalary);
    const contractTotalSalary = amountString(labour.contractTotalSalary);
    const allowance1 = amountString(labour.allowance1);
    const allowance2 = amountString(labour.allowance2);
    if (!basicSalary && !contractTotalSalary && !allowance1 && !allowance2)
        return null;
    return {
        currency,
        basicSalary,
        contractTotalSalary,
        allowance1,
        allowance2,
    };
}
//# sourceMappingURL=payroll.utils.js.map