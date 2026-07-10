import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Clock, BarChart3, Banknote, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { Employee, CustomShiftCode } from '../types';
import { interpretShift, getHours, formatHoursDisplay } from '../utils/shiftUtils';
import { calculateShiftBreakdown, calculateSalaryBreakdown, addBreakdowns, ShiftBreakdown, SalaryBreakdown } from '../utils/shiftUtils';

interface DashboardPanelProps {
  selectedEmployee: Employee;
  currentDay: number;
  currentMonth: number;
  currentYear: number;
  payday: number;
  customCodes: Record<string, CustomShiftCode>;
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
  now: Date;
  todayStr: string;
  actionButtons?: React.ReactNode;
}

export const DashboardPanel = ({
  selectedEmployee,
  currentDay,
  currentMonth,
  currentYear,
  payday,
  customCodes,
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
  now,
  todayStr,
  actionButtons
}: DashboardPanelProps) => {
  const [showDetails, setShowDetails] = useState(false);

  let ppStart: Date, ppEnd: Date;
  if (currentDay >= payday) {
    ppStart = new Date(currentYear, currentMonth, payday);
    ppEnd = new Date(currentYear, currentMonth + 1, payday - 1);
  } else {
    ppStart = new Date(currentYear, currentMonth - 1, payday);
    ppEnd = new Date(currentYear, currentMonth, payday - 1);
  }
  
  const nextPayday = new Date(ppEnd);
  nextPayday.setDate(nextPayday.getDate() + 1);
  
  const todayStart = new Date(currentYear, currentMonth, currentDay);
  const diffTime = nextPayday.getTime() - todayStart.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let weekBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
  let monthBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
  let payPeriodBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
  let earnedSoFarBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
  let todayTotalBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
  let realTimeBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
  let nextShift: { date: string, start: string } | null = null;
  
  const currentDecimalHours = now.getHours() + now.getMinutes()/60 + now.getSeconds()/3600;
  
  // Calculate current week range (Monday to Sunday)
  const dayOfWeek = now.getDay(); // 0 (Sun) to 6 (Sat)
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const monday = new Date(currentYear, currentMonth, currentDay + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  let isWorkingNow = false;

  const sortedEntries = [...selectedEmployee.schedule].sort((a, b) => a.date.localeCompare(b.date));

  sortedEntries.forEach(entry => {
    const interpreted = interpretShift(entry.date, entry.code, customCodes, entry.manualShifts);
    if (interpreted.status !== 'Work') return;

    const [y, m, d] = entry.date.split('-').map(Number);
    const entryDate = new Date(y, m - 1, d);

    let shiftTotalBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
    let shiftEarnedBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };

    interpreted.shifts.forEach(s => {
      const startH = getHours(s.start);
      const endH = getHours(s.end);
      
      const fullShift = calculateShiftBreakdown(entry.date, startH, endH);
      shiftTotalBreakdown = addBreakdowns(shiftTotalBreakdown, fullShift);

      if (!nextShift) {
        if (entry.date > todayStr || (entry.date === todayStr && startH > currentDecimalHours)) {
          nextShift = { date: entry.date, start: s.start };
        }
      }

      let shiftIsWorkingNow = false;
      let earnedShift: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
      
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
      
      if (entry.date < todayStr) {
        // Check if it's yesterday's night shift still ongoing today
        if (entry.date === yesterdayStr && startH > endH) {
          if (currentDecimalHours <= endH) {
            shiftIsWorkingNow = true;
            isWorkingNow = true;
            earnedShift = calculateShiftBreakdown(entry.date, startH, endH, currentDecimalHours + 24);
          } else {
            earnedShift = fullShift;
          }
        } else {
          earnedShift = fullShift;
        }
      } else if (entry.date === todayStr) {
        if (startH <= endH) {
          if (currentDecimalHours >= endH) {
            earnedShift = fullShift;
          } else if (currentDecimalHours >= startH) {
            shiftIsWorkingNow = true;
            isWorkingNow = true;
            earnedShift = calculateShiftBreakdown(entry.date, startH, endH, currentDecimalHours);
          }
        } else {
          // Shift crosses midnight
          if (currentDecimalHours >= startH) {
            shiftIsWorkingNow = true;
            isWorkingNow = true;
            earnedShift = calculateShiftBreakdown(entry.date, startH, endH, currentDecimalHours);
          } else if (currentDecimalHours <= endH) {
            // It's the next day, shift is ongoing
            shiftIsWorkingNow = true;
            isWorkingNow = true;
            earnedShift = calculateShiftBreakdown(entry.date, startH, endH, currentDecimalHours + 24);
          }
        }
      }

      shiftEarnedBreakdown = addBreakdowns(shiftEarnedBreakdown, earnedShift);
      
      if (entry.date === todayStr || (entry.date === yesterdayStr && startH > endH)) {
        realTimeBreakdown = addBreakdowns(realTimeBreakdown, earnedShift);
      }
    });

    if (entry.date === todayStr) {
      todayTotalBreakdown = addBreakdowns(todayTotalBreakdown, shiftTotalBreakdown);
    }

    // Mese stat: current pay period (from payday of month to payday-1 of next month)
    if (entryDate >= ppStart && entryDate <= ppEnd) {
      monthBreakdown = addBreakdowns(monthBreakdown, shiftTotalBreakdown);
      payPeriodBreakdown = addBreakdowns(payPeriodBreakdown, shiftTotalBreakdown);
      earnedSoFarBreakdown = addBreakdowns(earnedSoFarBreakdown, shiftEarnedBreakdown);
    }
    
    // Settimana: Monday to Sunday
    if (entryDate >= monday && entryDate <= sunday) {
      weekBreakdown = addBreakdowns(weekBreakdown, shiftTotalBreakdown);
    }
  });

  const realTimeSalary = calculateSalaryBreakdown(realTimeBreakdown, hourlyWage, thirteenthAllowance, vacationAllowance, holidayAllowance, sundaySupplement, nightSupplement, clothingAllocation, avsDeduction, unemploymentDeduction, dailySicknessDeduction, accidentDeduction, secondPillarDeduction, sourceTaxDeduction, coordinationDeduction, maxClothingAllocation);
  const earnedSoFarSalary = calculateSalaryBreakdown(earnedSoFarBreakdown, hourlyWage, thirteenthAllowance, vacationAllowance, holidayAllowance, sundaySupplement, nightSupplement, clothingAllocation, avsDeduction, unemploymentDeduction, dailySicknessDeduction, accidentDeduction, secondPillarDeduction, sourceTaxDeduction, coordinationDeduction, maxClothingAllocation);
  const todayTotalSalary = calculateSalaryBreakdown(todayTotalBreakdown, hourlyWage, thirteenthAllowance, vacationAllowance, holidayAllowance, sundaySupplement, nightSupplement, clothingAllocation, avsDeduction, unemploymentDeduction, dailySicknessDeduction, accidentDeduction, secondPillarDeduction, sourceTaxDeduction, coordinationDeduction, maxClothingAllocation);
  const estimatedSalary = calculateSalaryBreakdown(payPeriodBreakdown, hourlyWage, thirteenthAllowance, vacationAllowance, holidayAllowance, sundaySupplement, nightSupplement, clothingAllocation, avsDeduction, unemploymentDeduction, dailySicknessDeduction, accidentDeduction, secondPillarDeduction, sourceTaxDeduction, coordinationDeduction, maxClothingAllocation);

  return (
    <div className="flex flex-col gap-4 animate-slide-up">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 animate-slide-up">
        {/* Action Buttons */}
        {actionButtons && (
          <div className="flex items-center gap-2 flex-wrap">
            {actionButtons}
          </div>
        )}

        {/* Guadagno Oggi */}
        {enableHourTracking && realTimeBreakdown.totalHours > 0 && (
          <div className="bg-indigo-600 text-white rounded-2xl p-3 shadow-lg shadow-indigo-200 flex items-center justify-center gap-4 relative overflow-hidden w-full sm:w-auto sm:px-6 group">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.15),transparent)] pointer-events-none"></div>
            <div className="flex flex-col relative z-10">
               <span className="text-indigo-100 font-black uppercase tracking-[0.2em] text-[8px]">Guadagno Oggi</span>
               <div className="text-2xl font-black tracking-tighter flex items-baseline gap-1 mt-0.5">
                  {realTimeSalary.netSalary.toFixed(2)} <span className="text-xs text-indigo-300 font-bold">CHF</span>
               </div>
            </div>
            {isWorkingNow && (
              <div className="bg-white/10 backdrop-blur-md px-2 py-1.5 rounded-md text-white text-[9px] font-bold flex items-center gap-1.5 border border-white/10 shrink-0 relative z-10">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                </span>
                Live
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {enableHourTracking && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 flex flex-col sm:flex-row items-center justify-between bg-slate-50 border-b border-slate-100 gap-4">
               <div className="flex flex-col gap-1 w-full sm:w-auto">
                 <div className="flex items-center justify-between sm:justify-start gap-2">
                   <div className="flex items-center gap-1.5 text-amber-600">
                      <Banknote size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Stipendio Periodo</span>
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200 sm:hidden">
                        {ppStart.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} - {ppEnd.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                     </span>
                     <div className="flex items-center gap-1 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/50">
                        <TrendingUp size={10} className="text-indigo-600" />
                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider">{daysRemaining} gg alla paga</span>
                     </div>
                   </div>
                 </div>
                 <div className="flex items-baseline gap-1 mt-1">
                   <span className="font-black text-slate-900 text-3xl tracking-tight">{estimatedSalary.netSalary.toFixed(0)}</span>
                   <span className="text-sm font-bold text-slate-400 ml-1">CHF</span>
                 </div>
               </div>
               
               <div className="flex gap-4 w-full sm:w-auto overflow-hidden sm:divide-x divide-slate-200">
                  <div className="flex flex-col flex-1 sm:flex-auto">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Fino ad ora</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-black text-indigo-600 text-xl">{earnedSoFarSalary.netSalary.toFixed(0)}</span>
                      <span className="text-[9px] font-bold text-indigo-400 ml-0.5">CHF</span>
                    </div>
                  </div>
                  <div className="flex flex-col pl-4 flex-1 sm:flex-auto">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Giornata</span>
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-black text-emerald-600 text-xl">{todayTotalSalary.netSalary.toFixed(0)}</span>
                      <span className="text-[9px] font-bold text-emerald-400 ml-0.5">CHF</span>
                    </div>
                  </div>
               </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-100 bg-white">
                <div className="p-3 flex items-center gap-3">
                    <div className="bg-emerald-50 text-emerald-500 p-2 rounded-lg shrink-0">
                       <Clock size={14} />
                    </div>
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ore Settimana</span>
                       <div className="flex items-baseline gap-0.5 mt-0.5 text-slate-800">
                          <span className="font-black text-lg">{formatHoursDisplay(weekBreakdown.totalHours)}</span>
                          <span className="text-[10px] font-bold text-slate-400">h</span>
                       </div>
                    </div>
                </div>
                <div className="p-3 flex items-center gap-3 relative">
                    <div className="bg-blue-50 text-blue-500 p-2 rounded-lg shrink-0">
                       <BarChart3 size={14} />
                    </div>
                    <div className="flex flex-col">
                       <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ore Mese</span>
                       <div className="flex items-baseline gap-0.5 mt-0.5 text-slate-800">
                          <span className="font-black text-lg">{formatHoursDisplay(monthBreakdown.totalHours)}</span>
                          <span className="text-[10px] font-bold text-slate-400">h</span>
                       </div>
                    </div>
                    <span className="absolute top-2 right-2 text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded hidden sm:block">
                       {ppStart.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} - {ppEnd.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}
                    </span>
                </div>
            </div>

            <div className="border-t border-slate-100 p-3 pt-3 flex flex-col gap-1 text-[11px] bg-slate-50/50">
                <button 
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center justify-between font-bold text-slate-700 w-full text-left hover:text-indigo-600 transition-colors py-1"
                >
                  <span>Dettaglio Calcolo (Periodo)</span>
                  {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                
                <AnimatePresence>
                  {showDetails && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden flex flex-col gap-2"
                    >
                      <div className="flex justify-between text-slate-600 pt-2">
                        <span>Salario Base ({formatHoursDisplay(payPeriodBreakdown.totalHours)})</span>
                        <span className="font-medium">{estimatedSalary.baseSalary.toFixed(2)} CHF</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Indennità Ferie ({vacationAllowance}%)</span>
                        <span className="font-medium">+{estimatedSalary.vacationAllowance.toFixed(2)} CHF</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Indennità Festivi ({holidayAllowance}%)</span>
                        <span className="font-medium">+{estimatedSalary.holidayAllowance.toFixed(2)} CHF</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Tredicesima ({thirteenthAllowance}%)</span>
                        <span className="font-medium">+{estimatedSalary.thirteenthAllowance.toFixed(2)} CHF</span>
                      </div>
                      {payPeriodBreakdown.sundayHours > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Ore Domenicali ({formatHoursDisplay(payPeriodBreakdown.sundayHours)})</span>
                          <span className="font-medium text-emerald-600">+{estimatedSalary.sundaySupplement.toFixed(2)} CHF</span>
                        </div>
                      )}
                      {payPeriodBreakdown.nightHours > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>Ore Notturne ({formatHoursDisplay(payPeriodBreakdown.nightHours)})</span>
                          <span className="font-medium text-emerald-600">+{estimatedSalary.nightSupplement.toFixed(2)} CHF</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600 font-medium border-t border-slate-100 pt-1 mt-1">
                        <span>Salario Lordo AVS</span>
                        <span>{estimatedSalary.grossSalaryAVS.toFixed(2)} CHF</span>
                      </div>
                      
                      <div className="font-bold text-slate-700 mb-1 mt-2">Deduzioni Sociali (su Lordo AVS)</div>
                      <div className="flex justify-between text-slate-600">
                        <span>AVS/AI/IPG ({avsDeduction}%)</span>
                        <span className="font-medium text-red-500">-{estimatedSalary.avsDeduction.toFixed(2)} CHF</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Ass. Disoccupazione ({unemploymentDeduction}%)</span>
                        <span className="font-medium text-red-500">-{estimatedSalary.unemploymentDeduction.toFixed(2)} CHF</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Ass. Indennità Giornaliera ({dailySicknessDeduction}%)</span>
                        <span className="font-medium text-red-500">-{estimatedSalary.dailySicknessDeduction.toFixed(2)} CHF</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Ass. Infortuni ({accidentDeduction}%)</span>
                        <span className="font-medium text-red-500">-{estimatedSalary.accidentDeduction.toFixed(2)} CHF</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Previdenza Prof. ({secondPillarDeduction}%)</span>
                        <span className="font-medium text-red-500">-{estimatedSalary.secondPillarDeduction.toFixed(2)} CHF</span>
                      </div>

                      <div className="flex justify-between text-slate-600 border-t border-slate-100 pt-1 mt-1">
                        <span>Allocazione Vestiario ({clothingAllocation} CHF/h)</span>
                        <span className="font-medium">+{estimatedSalary.clothingAllocation.toFixed(2)} CHF</span>
                      </div>
                      <div className="flex justify-between text-slate-800 font-bold border-t border-slate-100 pt-1 mt-1">
                        <span>Salario Lordo Totale</span>
                        <span>{estimatedSalary.grossSalary.toFixed(2)} CHF</span>
                      </div>
                      
                      <div className="font-bold text-slate-700 mb-1 mt-2">Imposte (su Lordo AVS + Vestiario)</div>
                      <div className="flex justify-between text-slate-600">
                        <span>Imposta alla Fonte ({sourceTaxDeduction}%)</span>
                        <span className="font-medium text-red-500">-{estimatedSalary.sourceTaxDeduction.toFixed(2)} CHF</span>
                      </div>
                      
                      <div className="flex justify-between text-slate-800 font-bold border-t border-slate-100 pt-1 mt-1">
                        <span>Totale Deduzioni</span>
                        <span className="text-red-500">-{estimatedSalary.totalDeductions.toFixed(2)} CHF</span>
                      </div>
                      
                      <div className="flex justify-between text-indigo-700 font-black border-t border-indigo-100 pt-2 mt-2 text-sm">
                        <span>Salario Netto</span>
                        <span>{estimatedSalary.netSalary.toFixed(2)} CHF</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
        )}
      </div>
    </div>
  );
};
