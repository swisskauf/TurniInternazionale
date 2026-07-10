import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarRange, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { Employee, CustomShiftCode } from '../types';
import { interpretShift, getHours, calculateShiftBreakdown, calculateSalaryBreakdown, addBreakdowns, ShiftBreakdown, formatHoursDisplay } from '../utils/shiftUtils';

interface DateRangeEarningsPanelProps {
  selectedEmployee: Employee;
  customCodes: Record<string, CustomShiftCode>;
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
  sundaySupplement: number;
  nightSupplement: number;
}

export function DateRangeEarningsPanel({
  selectedEmployee,
  customCodes,
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
  sundaySupplement,
  nightSupplement
}: DateRangeEarningsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  let totalBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };

  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    selectedEmployee.schedule.forEach(entry => {
      const interpreted = interpretShift(entry.date, entry.code, customCodes, entry.manualShifts);
      if (interpreted.status !== 'Work') return;

      const [y, m, d] = entry.date.split('-').map(Number);
      const entryDate = new Date(y, m - 1, d);

      if (entryDate >= start && entryDate <= end) {
        interpreted.shifts.forEach(s => {
          const startH = getHours(s.start);
          const endH = getHours(s.end);
          const fullShift = calculateShiftBreakdown(entry.date, startH, endH);
          totalBreakdown = addBreakdowns(totalBreakdown, fullShift);
        });
      }
    });
  }

  const salary = calculateSalaryBreakdown(totalBreakdown, hourlyWage, thirteenthAllowance, vacationAllowance, holidayAllowance, sundaySupplement, nightSupplement, clothingAllocation, avsDeduction, unemploymentDeduction, dailySicknessDeduction, accidentDeduction, secondPillarDeduction, sourceTaxDeduction);

  return (
    <motion.div 
      whileHover={{ y: -2 }}
      className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col mt-6"
    >
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full text-left group outline-none"
      >
        <div className="flex items-center gap-2 text-slate-800">
          <CalendarRange size={18} className="text-indigo-600 group-hover:scale-110 transition-transform" />
          <h4 className="text-sm font-black uppercase tracking-widest group-hover:text-indigo-600 transition-colors">Calcola Guadagni per Periodo</h4>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
        </motion.div>
      </button>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-6 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Da Data</label>
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">A Data</label>
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              {startDate && endDate && (
                <div className="mt-2 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-800">
                      <Calculator size={16} />
                      <span className="text-xs font-black uppercase tracking-widest">Risultato</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Ore Totali</span>
                      <div className="flex items-baseline gap-1">
                        <span className="font-black text-indigo-900 text-2xl">{formatHoursDisplay(totalBreakdown.totalHours)}</span>
                        <span className="text-xs font-bold text-indigo-500">h</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Guadagno Netto</span>
                      <div className="flex items-baseline gap-1">
                        <span className="font-black text-emerald-600 text-2xl">{salary.netSalary.toFixed(2)}</span>
                        <span className="text-xs font-bold text-emerald-500">CHF</span>
                      </div>
                    </div>
                  </div>

                  {/* Dettaglio Calcolo */}
                  <div className="mt-2 pt-3 border-t border-indigo-200/50 flex flex-col gap-1.5 text-xs">
                    <button 
                      onClick={() => setShowDetails(!showDetails)}
                      className="flex items-center justify-between font-bold text-indigo-900/80 w-full text-left hover:text-indigo-600 transition-colors"
                    >
                      <span>Dettaglio Calcolo</span>
                      {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    
                    <AnimatePresence>
                      {showDetails && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden flex flex-col gap-1.5"
                        >
                          <div className="flex justify-between text-indigo-900/70 pt-2">
                            <span>Salario Base ({formatHoursDisplay(totalBreakdown.totalHours)})</span>
                            <span className="font-medium">{salary.baseSalary.toFixed(2)} CHF</span>
                          </div>
                          <div className="flex justify-between text-indigo-900/70">
                            <span>Indennità Ferie ({vacationAllowance}%)</span>
                            <span className="font-medium">+{salary.vacationAllowance.toFixed(2)} CHF</span>
                          </div>
                          <div className="flex justify-between text-indigo-900/70">
                            <span>Indennità Festivi ({holidayAllowance}%)</span>
                            <span className="font-medium">+{salary.holidayAllowance.toFixed(2)} CHF</span>
                          </div>
                          <div className="flex justify-between text-indigo-900/70">
                            <span>Tredicesima ({thirteenthAllowance}%)</span>
                            <span className="font-medium">+{salary.thirteenthAllowance.toFixed(2)} CHF</span>
                          </div>
                          {totalBreakdown.sundayHours > 0 && (
                            <div className="flex justify-between text-indigo-900/70">
                              <span>Ore Domenicali ({formatHoursDisplay(totalBreakdown.sundayHours)})</span>
                              <span className="font-medium text-emerald-600">+{salary.sundaySupplement.toFixed(2)} CHF</span>
                            </div>
                          )}
                          {totalBreakdown.nightHours > 0 && (
                            <div className="flex justify-between text-indigo-900/70">
                              <span>Ore Notturne ({formatHoursDisplay(totalBreakdown.nightHours)})</span>
                              <span className="font-medium text-emerald-600">+{salary.nightSupplement.toFixed(2)} CHF</span>
                            </div>
                          )}
                          <div className="flex justify-between text-indigo-900/90 font-bold border-t border-indigo-200/50 pt-1 mt-1">
                            <span>Salario Lordo AVS</span>
                            <span>{salary.grossSalaryAVS.toFixed(2)} CHF</span>
                          </div>
                          
                          <div className="font-bold text-indigo-900/80 mb-1 mt-2">Deduzioni Sociali (su Lordo AVS)</div>
                          <div className="flex justify-between text-indigo-900/70">
                            <span>AVS/AI/IPG ({avsDeduction}%)</span>
                            <span className="font-medium text-red-500">-{salary.avsDeduction.toFixed(2)} CHF</span>
                          </div>
                          <div className="flex justify-between text-indigo-900/70">
                            <span>Ass. Disoccupazione ({unemploymentDeduction}%)</span>
                            <span className="font-medium text-red-500">-{salary.unemploymentDeduction.toFixed(2)} CHF</span>
                          </div>
                          <div className="flex justify-between text-indigo-900/70">
                            <span>Ass. Indennità Giornaliera ({dailySicknessDeduction}%)</span>
                            <span className="font-medium text-red-500">-{salary.dailySicknessDeduction.toFixed(2)} CHF</span>
                          </div>
                          <div className="flex justify-between text-indigo-900/70">
                            <span>Ass. Infortuni ({accidentDeduction}%)</span>
                            <span className="font-medium text-red-500">-{salary.accidentDeduction.toFixed(2)} CHF</span>
                          </div>
                          <div className="flex justify-between text-indigo-900/70">
                            <span>Previdenza Prof. ({secondPillarDeduction}%)</span>
                            <span className="font-medium text-red-500">-{salary.secondPillarDeduction.toFixed(2)} CHF</span>
                          </div>

                          <div className="flex justify-between text-indigo-900/70 border-t border-indigo-200/50 pt-1 mt-1">
                            <span>Allocazione Vestiario ({clothingAllocation} CHF/h)</span>
                            <span className="font-medium">+{salary.clothingAllocation.toFixed(2)} CHF</span>
                          </div>
                          <div className="flex justify-between text-indigo-900 font-black border-t border-indigo-200/50 pt-1 mt-1">
                            <span>Salario Lordo Totale</span>
                            <span>{salary.grossSalary.toFixed(2)} CHF</span>
                          </div>
                          
                          <div className="font-bold text-indigo-900/80 mb-1 mt-2">Imposte (su Lordo AVS + Vestiario)</div>
                          <div className="flex justify-between text-indigo-900/70">
                            <span>Imposta alla Fonte ({sourceTaxDeduction}%)</span>
                            <span className="font-medium text-red-500">-{salary.sourceTaxDeduction.toFixed(2)} CHF</span>
                          </div>
                          
                          <div className="flex justify-between text-indigo-900 font-bold border-t border-indigo-200/50 pt-1 mt-1">
                            <span>Totale Deduzioni</span>
                            <span className="text-red-500">-{salary.totalDeductions.toFixed(2)} CHF</span>
                          </div>
                          
                          <div className="flex justify-between text-indigo-700 font-black border-t border-indigo-300 pt-2 mt-2 text-sm">
                            <span>Salario Netto</span>
                            <span>{salary.netSalary.toFixed(2)} CHF</span>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
