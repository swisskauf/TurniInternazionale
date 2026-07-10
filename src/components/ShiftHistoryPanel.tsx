import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar as CalendarIcon, ChevronDown, RefreshCw, CalendarPlus, Info, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Employee, CustomShiftCode, ShiftPeriod } from '../types';
import { interpretShift, calculateShiftHours, calculateShiftBreakdown, calculateSalaryBreakdown, getHours, formatHoursDisplay } from '../utils/shiftUtils';
import { formatCardDate } from '../utils/dateUtils';

interface ShiftHistoryPanelProps {
  selectedEmployee: Employee;
  customCodes: Record<string, CustomShiftCode>;
  todayStr: string;
  enableHourTracking: boolean;
  hourlyWage: number;
  thirteenthAllowance: number;
  vacationAllowance: number;
  holidayAllowance: number;
  clothingAllocation: number;
  avsDeduction: number;
  unemploymentDeduction: number;
  dailySicknessDeduction: number;
  accidentDeduction: number;
  secondPillarDeduction: number;
  sourceTaxDeduction: number;
  coordinationDeduction: number;
  maxClothingAllocation: number;
  sundaySupplement: number;
  nightSupplement: number;
  openEditShiftModal: (date: string, code: string) => void;
  handleAddToCalendar: (dateStr: string, shifts: ShiftPeriod[], note?: string, code?: string) => void;
}

export const ShiftHistoryPanel = ({
  selectedEmployee,
  customCodes,
  todayStr,
  enableHourTracking,
  hourlyWage,
  thirteenthAllowance,
  vacationAllowance,
  holidayAllowance,
  clothingAllocation,
  avsDeduction,
  unemploymentDeduction,
  dailySicknessDeduction,
  accidentDeduction,
  secondPillarDeduction,
  sourceTaxDeduction,
  coordinationDeduction,
  maxClothingAllocation,
  sundaySupplement,
  nightSupplement,
  openEditShiftModal,
  handleAddToCalendar
}: ShiftHistoryPanelProps) => {
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const rawSchedule = [...selectedEmployee.schedule].sort((a, b) => a.date.localeCompare(b.date));
  
  if (rawSchedule.length === 0) {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <div className="flex items-center justify-between px-2">
          <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Cronologia Turni</h4>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
            0 Giorni
          </span>
        </div>
        <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400 font-medium">
          Nessun dato trovato.
        </div>
      </div>
    );
  }

  const groupedSchedule = rawSchedule.reduce((acc, entry) => {
    const monthYear = entry.date.substring(0, 7); // YYYY-MM
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(entry);
    return acc;
  }, {} as Record<string, typeof selectedEmployee.schedule>);

  const sortedMonths = Object.keys(groupedSchedule).sort((a, b) => b.localeCompare(a));

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex items-center justify-between px-2">
        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Cronologia Turni</h4>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
          {rawSchedule.length} Giorni
        </span>
      </div>
      
      {sortedMonths.map((month, monthIdx) => {
        const [year, m] = month.split('-');
        const monthName = new Date(parseInt(year), parseInt(m) - 1, 1).toLocaleString('it-IT', { month: 'long', year: 'numeric' });
        const isExpanded = expandedMonths[month] !== undefined ? expandedMonths[month] : monthIdx === 0;

        return (
          <div key={month} className="mb-4 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <button
              onClick={() => setExpandedMonths(prev => ({ ...prev, [month]: !isExpanded }))}
              className="w-full flex items-center justify-between p-5 bg-slate-50/50 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <CalendarIcon size={16} />
                </div>
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">{monthName}</h3>
                <span className="text-[10px] font-black text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200">
                  {groupedSchedule[month].length} turni
                </span>
              </div>
              <div className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                <ChevronDown size={20} />
              </div>
            </button>
            
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="p-5 flex flex-col gap-4 border-t border-slate-100 bg-slate-50/30">
                    {groupedSchedule[month].map((entry, idx) => {
                      const interpreted = interpretShift(entry.date, entry.code, customCodes, entry.manualShifts);
                      const isModified = entry.isManuallyModified || entry.isUpdated;
                      const { weekday, dayMonth } = formatCardDate(entry.date);
                      
                      let dailyBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
                      if (interpreted.status === 'Work') {
                        interpreted.shifts.forEach(s => {
                          const startH = getHours(s.start);
                          const endH = getHours(s.end);
                          const shiftBreakdown = calculateShiftBreakdown(entry.date, startH, endH);
                          dailyBreakdown = {
                            totalHours: dailyBreakdown.totalHours + shiftBreakdown.totalHours,
                            sundayHours: dailyBreakdown.sundayHours + shiftBreakdown.sundayHours,
                            nightHours: dailyBreakdown.nightHours + shiftBreakdown.nightHours
                          };
                        });
                      }
                      
                      const dailySalary = calculateSalaryBreakdown(dailyBreakdown, hourlyWage, thirteenthAllowance, vacationAllowance, holidayAllowance, sundaySupplement, nightSupplement, clothingAllocation, avsDeduction, unemploymentDeduction, dailySicknessDeduction, accidentDeduction, secondPillarDeduction, sourceTaxDeduction, coordinationDeduction, maxClothingAllocation);
                      
                      const isActive = entry.date >= todayStr;
                      
                      return (
                        <motion.div 
                          key={`${entry.date}-${idx}`} 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.02 }}
                          className={`border rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-3 relative group ${isModified ? 'bg-amber-50/70 border-amber-300' : 'bg-white'} ${isActive && !isModified ? 'border-indigo-300 shadow-indigo-100/50' : isActive && isModified ? 'shadow-amber-100/50' : !isModified ? 'border-slate-200 hover:border-indigo-100' : 'hover:border-amber-400'}`}
                        >
                          {isActive && (
                            <div className="absolute -top-2 -right-2 bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full shadow-sm">
                              Attivo
                            </div>
                          )}
                          <div className="flex items-start justify-between">
                            <div className="flex flex-col">
                              <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-0.5">
                                {weekday || 'Data'}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-base font-bold text-slate-900">
                                  {dayMonth}
                                </div>
                                <div className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-bold border border-slate-200">
                                  {entry.code || 'GR'}
                                </div>
                                {isModified && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest border bg-amber-100 text-amber-700 border-amber-200">
                                    Modificato
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <button 
                                onClick={() => openEditShiftModal(entry.date, entry.code)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="Modifica turno"
                              >
                                <RefreshCw size={16} />
                              </button>
                              {interpreted.status === 'Work' && interpreted.shifts.length > 0 && (
                                <button
                                  onClick={() => handleAddToCalendar(entry.date, interpreted.shifts, entry.note, entry.code)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                  title="Aggiungi al calendario"
                                >
                                  <CalendarPlus size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {entry.note && (
                            <div className="mt-1 p-2 bg-indigo-50/50 border border-indigo-100/50 rounded-xl flex items-start gap-2">
                              <Info size={12} className="text-indigo-500 shrink-0 mt-0.5" />
                              <p className="text-[10px] font-medium text-indigo-900 leading-relaxed italic">
                                {entry.note}
                              </p>
                            </div>
                          )}
                          
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {interpreted.status === 'Work' && interpreted.shifts.length > 0 ? (
                              <>
                                {interpreted.shifts.map((s, i) => (
                                  <div key={`${s.start}-${s.end}-${i}`} className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-xl">
                                    <Clock size={12} className="text-indigo-500" />
                                    <span className="text-xs font-black text-slate-700">{s.start} &ndash; {s.end}</span>
                                  </div>
                                ))}
                                
                                {enableHourTracking && (
                                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-2.5 py-1.5 rounded-xl">
                                    <CheckCircle2 size={12} className="text-emerald-600" />
                                    <span className="text-xs font-black text-emerald-700">{formatHoursDisplay(dailyBreakdown.totalHours)}</span>
                                    <span className="text-[9px] font-bold text-emerald-600/60 uppercase tracking-tighter">
                                      {dailySalary.netSalary.toFixed(2)} CHF
                                    </span>
                                  </div>
                                )}
                              </>
                            ) : interpreted.status === 'Day off' ? (
                              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                                <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">Giorno Libero</span>
                              </div>
                            ) : interpreted.status === 'Vacation' ? (
                              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-xl">
                                <span className="text-sm">🌴</span>
                                <span className="text-xs font-black text-amber-700 uppercase tracking-wider">Ferie</span>
                              </div>
                            ) : interpreted.status === 'Confirmed' ? (
                              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-xl">
                                <CheckCircle2 size={14} className="text-blue-600" />
                                <span className="text-xs font-black text-blue-700 uppercase tracking-wider">Confermato</span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2 w-full">
                                <div className="flex items-center gap-1.5 text-rose-600 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-100">
                                  <AlertCircle size={14} />
                                  <span className="text-xs font-black uppercase tracking-wider">Non Riconosciuto</span>
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 bg-slate-50 p-2 rounded-xl border border-dashed border-slate-200">
                                  Codice: <span className="text-slate-700">{entry.code}</span>
                                </div>
                                <button
                                  onClick={() => openEditShiftModal(entry.date, entry.code)}
                                  className="text-[10px] font-black text-white bg-slate-900 hover:bg-black px-3 py-2 rounded-lg transition-all w-fit shadow-sm active:scale-95"
                                >
                                  Imposta Orario
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};
