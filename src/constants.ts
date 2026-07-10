import { ShiftPeriod } from './types';

export const SYSTEM_CODES: Record<string, { status: 'Work' | 'Day off' | 'Vacation', shifts?: ShiftPeriod[] }> = {
  'P3': { status: 'Work', shifts: [{ start: '09:00', end: '12:00' }, { start: '12:36', end: '17:18' }] },
  'P2': { status: 'Work', shifts: [{ start: '09:00', end: '12:00' }, { start: '12:36', end: '18:18' }] },
  'P1': { status: 'Work', shifts: [{ start: '08:00', end: '12:00' }, { start: '12:36', end: '17:18' }] },
  'MP2': { status: 'Work', shifts: [{ start: '09:00', end: '12:00' }] },
  'MP1': { status: 'Work', shifts: [{ start: '08:00', end: '12:00' }] },
  'R+MP2': { status: 'Work', shifts: [{ start: '05:00', end: '07:30' }, { start: '09:00', end: '12:00' }] },
  'R+MP1': { status: 'Work', shifts: [{ start: '05:00', end: '07:30' }, { start: '08:00', end: '12:00' }] },
  'R+P2': { status: 'Work', shifts: [{ start: '05:00', end: '07:30' }, { start: '09:00', end: '12:00' }, { start: '12:36', end: '15:12' }] },
  'R+P1': { status: 'Work', shifts: [{ start: '05:00', end: '07:30' }, { start: '08:00', end: '12:00' }, { start: '12:36', end: '15:12' }] },
  'AN': { status: 'Work', shifts: [{ start: '05:00', end: '07:30' }] },
  'GR': { status: 'Day off' },
  'GV': { status: 'Vacation' }
};
