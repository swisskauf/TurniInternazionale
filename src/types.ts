export interface ScheduleEntry {
  date: string;
  code: string;
  isAdded?: boolean;
  isManuallyModified?: boolean;
  isUpdated?: boolean;
  note?: string;
  manualShifts?: ShiftPeriod[];
}

export interface ShiftPeriod {
  start: string;
  end: string;
}

export interface InterpretedShift {
  date: string;
  code: string;
  status: 'Work' | 'Day off' | 'Vacation' | 'Confirmed' | 'Unrecognized Icon' | 'Unknown';
  shifts: ShiftPeriod[];
}

export interface CustomShiftCode {
  code: string;
  shifts: ShiftPeriod[];
  status: 'Work' | 'Day off' | 'Vacation';
  deleted?: boolean;
}

export interface EditingShift {
  employeeName: string;
  date: string;
  code: string;
  isManuallyModified?: boolean;
  isAdded?: boolean;
  isUpdated?: boolean;
  note?: string;
  manualShifts?: ShiftPeriod[];
}

export interface Employee {
  name: string;
  schedule: ScheduleEntry[];
}

export interface Deductions {
  avs: number;
  ad: number;
  aig: number;
  ainf: number;
  pp: number;
  sourceTax: number;
}

export interface ScheduleData {
  employees: Employee[];
}
