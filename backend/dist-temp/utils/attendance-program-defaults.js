"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ATTENDANCE_PROGRAM_NAME = void 0;
exports.defaultDubaiWeeklySchedule = defaultDubaiWeeklySchedule;
exports.ensureDefaultAttendanceProgram = ensureDefaultAttendanceProgram;
const database_1 = __importDefault(require("../config/database"));
exports.DEFAULT_ATTENDANCE_PROGRAM_NAME = 'DUBAI 08:00 to 18:30';
function defaultDubaiWeeklySchedule() {
    const workDay = (enabled) => ({
        enabled,
        clockIn: '08:00',
        clockOut: '18:30',
    });
    return {
        mon: workDay(true),
        tue: workDay(true),
        wed: workDay(true),
        thu: workDay(true),
        fri: workDay(true),
        sat: workDay(false),
        sun: workDay(false),
    };
}
function formatHoursSummary(schedule) {
    const labels = {
        mon: 'Mon',
        tue: 'Tue',
        wed: 'Wed',
        thu: 'Thu',
        fri: 'Fri',
        sat: 'Sat',
        sun: 'Sun',
    };
    return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        .map((key) => {
        const d = schedule[key];
        if (!d?.enabled)
            return `${labels[key]} off`;
        return `${labels[key]} ${d.clockIn}–${d.clockOut}`;
    })
        .join(' · ');
}
/** Create the standard Dubai office program when a company has none yet. */
async function ensureDefaultAttendanceProgram(companyId) {
    const count = await database_1.default.attendanceProgram.count({ where: { companyId } });
    if (count > 0)
        return;
    const weeklySchedule = defaultDubaiWeeklySchedule();
    await database_1.default.attendanceProgram.create({
        data: {
            companyId,
            name: exports.DEFAULT_ATTENDANCE_PROGRAM_NAME,
            description: 'Default UAE office hours (Monday–Friday 08:00–18:30)',
            weeklySchedule,
            hoursSummary: formatHoursSummary(weeklySchedule),
        },
    });
}
//# sourceMappingURL=attendance-program-defaults.js.map