import { ShiftPeriod, InterpretedShift, CustomShiftCode } from '../types';

export function interpretShift(date: string, code: string, customCodes: Record<string, CustomShiftCode> = {}, manualShifts?: ShiftPeriod[]): InterpretedShift {
  const normalizedCode = code ? code.trim().toUpperCase() : '';
  
  if (!normalizedCode || normalizedCode === 'GR') {
    return { date, code: 'GR', status: 'Day off', shifts: [] };
  }

  let shifts: ShiftPeriod[] = [];
  let status: 'Work' | 'Day off' | 'Vacation' | 'Confirmed' | 'Unrecognized Icon' | 'Unknown' = 'Work';

  if (manualShifts && manualShifts.length > 0) {
    shifts = manualShifts;
    status = 'Work';
    return { date, code, status, shifts };
  }

  // Check if it's a direct time range like "08:00-17:00"
  const directTimeMatch = normalizedCode.match(/^(\d{1,2}:\d{2})\s*[:\-.–—]\s*(\d{1,2}:\d{2})$/);
  if (directTimeMatch) {
    return {
      date,
      code,
      status: 'Work',
      shifts: [{ start: directTimeMatch[1], end: directTimeMatch[2] }]
    };
  }

  // Handle multiple shifts like "08:00-12:00 / 13:00-19:00" or "08:00-12:00 13:00-19:00"
  const timeRangeRegex = /(\d{1,2}:\d{2})\s*[:\-.–—]\s*(\d{1,2}:\d{2})/g;
  const matches = Array.from(normalizedCode.matchAll(timeRangeRegex));
  
  if (matches.length > 0) {
    const extractedShifts: ShiftPeriod[] = matches.map(m => ({ start: m[1], end: m[2] }));
    return { date, code, status: 'Work', shifts: extractedShifts };
  }

  if (normalizedCode.includes('🌴') || normalizedCode.includes('PALM')) {
    status = 'Vacation';
  } else if (normalizedCode.includes('✅') || normalizedCode.includes('CHECK')) {
    status = 'Confirmed';
  } else if (normalizedCode.startsWith('UNKNOWN_ICON:')) {
    status = 'Unrecognized Icon';
  } else if (customCodes[normalizedCode] && !customCodes[normalizedCode].deleted) {
    status = customCodes[normalizedCode].status;
    shifts = customCodes[normalizedCode].shifts;
  } else {
    status = 'Unknown';
  }

  return { date, code, status, shifts };
}

export const getHours = (timeStr: string) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h + (m / 60);
};

export const calculateShiftHours = (start: string, end: string) => {
  let diff = getHours(end) - getHours(start);
  if (diff < 0) diff += 24;
  
  return diff; // No rounding, exact decimal hours
};

export const formatHoursDisplay = (decimalHours: number): string => {
  if (decimalHours === 0) return '-';
  return decimalHours.toFixed(2);
};

export const calculateBreakHours = (shifts: ShiftPeriod[]) => {
  if (shifts.length <= 1) return 0;
  let totalBreak = 0;
  for (let i = 0; i < shifts.length - 1; i++) {
    const endH = getHours(shifts[i].end);
    const nextStartH = getHours(shifts[i+1].start);
    let breakDuration = nextStartH - endH;
    if (breakDuration < 0) breakDuration += 24;
    totalBreak += breakDuration;
  }
  return totalBreak;
};

export interface ShiftBreakdown {
  totalHours: number;
  sundayHours: number;
  nightHours: number;
}

export interface SalaryBreakdown extends ShiftBreakdown {
  baseSalary: number;
  thirteenthAllowance: number;
  vacationAllowance: number;
  holidayAllowance: number;
  sundaySupplement: number;
  nightSupplement: number;
  clothingAllocation: number;
  grossSalaryAVS: number;
  grossSalary: number;
  
  avsDeduction: number;
  unemploymentDeduction: number;
  dailySicknessDeduction: number;
  accidentDeduction: number;
  secondPillarDeduction: number;
  sourceTaxDeduction: number;
  totalDeductions: number;
  
  netSalary: number;
}

export function roundTo05(value: number): number {
  return Math.round(value * 20) / 20;
}

export function roundTo2Decimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateShiftBreakdown(dateStr: string, startH: number, endH: number, currentDecimalHours?: number): ShiftBreakdown {
  const [y, m, d] = dateStr.split('-').map(Number);
  const startDate = new Date(y, m - 1, d);
  const startDayOfWeek = startDate.getDay(); // 0 = Sunday

  let actualEndH = endH;
  let crossesMidnight = false;

  if (startH > endH) {
    actualEndH = endH + 24;
    crossesMidnight = true;
  }

  if (currentDecimalHours !== undefined) {
    actualEndH = Math.min(actualEndH, currentDecimalHours);
  }

  if (actualEndH <= startH) {
    return { totalHours: 0, sundayHours: 0, nightHours: 0 };
  }

  // No rounding, exact decimal hours
  let roundedDurationHours = actualEndH - startH;

  // Aggiustiamo actualEndH per riflettere la durata esatta
  actualEndH = startH + roundedDurationHours;

  if (actualEndH <= startH) {
    return { totalHours: 0, sundayHours: 0, nightHours: 0 };
  }

  let totalHours = 0;
  let sundayHours = 0;
  let nightHours = 0;

  const day1End = Math.min(actualEndH, 24);
  const day1Duration = day1End - startH;
  totalHours += day1Duration;
  
  if (startDayOfWeek === 0) {
    sundayHours += day1Duration;
  }
  
  nightHours += calculateOverlap(startH, day1End, 0, 6);
  nightHours += calculateOverlap(startH, day1End, 23, 24);

  if (actualEndH > 24) {
    const day2Start = 0;
    const day2End = actualEndH - 24;
    const day2Duration = day2End - day2Start;
    totalHours += day2Duration;

    const day2OfWeek = (startDayOfWeek + 1) % 7;
    if (day2OfWeek === 0) {
      sundayHours += day2Duration;
    }

    nightHours += calculateOverlap(day2Start, day2End, 0, 6);
    nightHours += calculateOverlap(day2Start, day2End, 23, 24);
  }

  return { totalHours, sundayHours, nightHours };
}

function calculateOverlap(start1: number, end1: number, start2: number, end2: number): number {
  const overlapStart = Math.max(start1, start2);
  const overlapEnd = Math.min(end1, end2);
  return Math.max(0, overlapEnd - overlapStart);
}

export function roundTo5Rappen(value: number): number {
  return Math.round(value * 20) / 20;
}

export function calculateSalaryBreakdown(
  hours: ShiftBreakdown,
  hourlyWage: number,
  thirteenthPct: number,
  vacationPct: number,
  holidayPct: number,
  sundayPct: number,
  nightPct: number,
  clothingAllocationPerHour: number,
  avsDeductionPct: number,
  unemploymentDeductionPct: number,
  dailySicknessDeductionPct: number,
  accidentDeductionPct: number,
  secondPillarDeductionPct: number,
  sourceTaxDeductionPct: number,
  coordinationDeduction: number = 2205,
  maxClothingAllocation: number = 154.5
): SalaryBreakdown {
  // Arrotondamento a 5 centesimi (svizzero)
  const baseSalary = roundTo5Rappen(hours.totalHours * hourlyWage);
  
  const vacationAllowance = roundTo5Rappen(baseSalary * (vacationPct / 100));
  const holidayAllowance = roundTo5Rappen(baseSalary * (holidayPct / 100));
  
  // Il 13esimo salario è calcolato sul salario base + ferie + festivi
  const thirteenthAllowance = roundTo5Rappen((baseSalary + vacationAllowance + holidayAllowance) * (thirteenthPct / 100));
  
  const sundaySupplement = roundTo5Rappen(hours.sundayHours * hourlyWage * (sundayPct / 100));
  const nightSupplement = roundTo5Rappen(hours.nightHours * hourlyWage * (nightPct / 100));
  
  const grossSalaryAVS = roundTo5Rappen(baseSalary + vacationAllowance + holidayAllowance + thirteenthAllowance + sundaySupplement + nightSupplement);
  
  // Allocazione vestiario basata sulle ore, con un massimo di ore ammissibili
  // Il limite può essere configurato, ma usiamo la variabile maxClothingAllocation (che ora rappresenta la quantità di ore massime)
  const calculatedClothing = Math.min(hours.totalHours, maxClothingAllocation) * clothingAllocationPerHour;
  const clothingAllocation = roundTo5Rappen(calculatedClothing);
  const grossSalary = roundTo5Rappen(grossSalaryAVS + clothingAllocation);

  const avsDeduction = roundTo5Rappen(grossSalaryAVS * (avsDeductionPct / 100));
  const unemploymentDeduction = roundTo5Rappen(grossSalaryAVS * (unemploymentDeductionPct / 100));
  const dailySicknessDeduction = roundTo5Rappen(grossSalaryAVS * (dailySicknessDeductionPct / 100));
  const accidentDeduction = roundTo5Rappen(grossSalaryAVS * (accidentDeductionPct / 100));
  
  // La previdenza professionale (LPP) prende in considerazione SOLAMENT LA METÀ DEL SALARIO BRUTTO (ore x costo orario = baseSalary)
  const actualSecondPillarBase = baseSalary / 2;
  const secondPillarDeduction = roundTo5Rappen(actualSecondPillarBase * (secondPillarDeductionPct / 100));
  
  const sourceTaxBase = roundTo5Rappen(grossSalaryAVS + clothingAllocation);
  const sourceTaxDeduction = roundTo5Rappen(sourceTaxBase * (sourceTaxDeductionPct / 100));

  const totalDeductions = roundTo5Rappen(avsDeduction + unemploymentDeduction + dailySicknessDeduction + accidentDeduction + secondPillarDeduction + sourceTaxDeduction);
  
  const netSalary = roundTo5Rappen(grossSalary - totalDeductions);

  return {
    ...hours,
    baseSalary,
    thirteenthAllowance,
    vacationAllowance,
    holidayAllowance,
    sundaySupplement,
    nightSupplement,
    clothingAllocation,
    grossSalaryAVS,
    grossSalary,
    avsDeduction,
    unemploymentDeduction,
    dailySicknessDeduction,
    accidentDeduction,
    secondPillarDeduction,
    sourceTaxDeduction,
    totalDeductions,
    netSalary
  };
}

export function addBreakdowns(a: ShiftBreakdown, b: ShiftBreakdown): ShiftBreakdown {
  return {
    totalHours: a.totalHours + b.totalHours,
    sundayHours: a.sundayHours + b.sundayHours,
    nightHours: a.nightHours + b.nightHours
  };
}
