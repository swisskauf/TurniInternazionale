import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calculator, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Employee, CustomShiftCode } from '../../types';
import { interpretShift, getHours, calculateShiftBreakdown, calculateSalaryBreakdown, addBreakdowns, ShiftBreakdown, formatHoursDisplay } from '../../utils/shiftUtils';

interface EarningsCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
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
  coordinationDeduction: number;
  maxClothingAllocation: number;
  sundaySupplement: number;
  nightSupplement: number;
}

export function SalaryCalculatorModal({
  isOpen,
  onClose,
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
  coordinationDeduction,
  maxClothingAllocation,
  sundaySupplement,
  nightSupplement
}: EarningsCalculatorModalProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  if (!isOpen) return null;

  let totalBreakdown: ShiftBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };

  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    selectedEmployee.schedule.forEach((entry) => {
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

  const salary = calculateSalaryBreakdown(totalBreakdown, hourlyWage, thirteenthAllowance, vacationAllowance, holidayAllowance, sundaySupplement, nightSupplement, clothingAllocation, avsDeduction, unemploymentDeduction, dailySicknessDeduction, accidentDeduction, secondPillarDeduction, sourceTaxDeduction, coordinationDeduction, maxClothingAllocation);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col h-auto max-h-[90vh]"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              <Calculator size={22} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Calcolo Guadagni</h3>
              <p className="text-xs font-bold text-slate-400">Strumento di calcolo stipendio periodo</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-900 p-2 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2 relative">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Da Data</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 text-sm appearance-none"
              />
            </div>
            <div className="flex flex-col gap-2 relative">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">A Data</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-bold text-slate-700 text-sm appearance-none"
              />
            </div>
          </div>

          {startDate && endDate ? (
            <div className="flex flex-col gap-5">
              <div className="p-6 bg-slate-900 rounded-2xl shadow-lg border border-slate-800 flex flex-col gap-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                
                <div className="grid grid-cols-2 gap-6 relative z-10">
                  <div className="flex flex-col gap-1.5 border-r border-slate-700/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ore Totali</span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-black text-white text-3xl">{formatHoursDisplay(totalBreakdown.totalHours)}</span>
                      <span className="text-sm font-bold text-slate-400">h</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 pl-2">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Netto Stimato</span>
                    <div className="flex items-baseline gap-1">
                      <span className="font-black text-emerald-400 text-3xl" suppressHydrationWarning>{salary.netSalary.toFixed(2)}</span>
                      <span className="text-sm font-bold text-emerald-400/60">CHF</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dettaglio Calcolo */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
                <button 
                  onClick={() => setShowDetails(!showDetails)}
                  className={`flex items-center justify-between font-bold text-slate-700 w-full text-left transition-colors p-4 hover:bg-slate-50 ${showDetails ? 'bg-slate-50 border-b border-slate-100' : ''}`}
                >
                  <span className="text-sm tracking-tight">Dettaglio Calcolo (Prospetto)</span>
                  <div className={`p-1.5 rounded-lg transition-colors ${showDetails ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-500'}`}>
                    {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>
                
                <AnimatePresence>
                  {showDetails && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden flex flex-col px-4 pb-4"
                    >
                      <div className="pt-4 flex flex-col gap-2.5 text-xs text-slate-600">
                        <div className="flex justify-between">
                          <span className="font-medium">Salario Base ({formatHoursDisplay(totalBreakdown.totalHours)})</span>
                          <span className="font-black text-slate-800">{salary.baseSalary.toFixed(2)} CHF</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">Indennità Ferie ({vacationAllowance}%)</span>
                          <span className="font-black text-slate-800">+{salary.vacationAllowance.toFixed(2)} CHF</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">Indennità Festivi ({holidayAllowance}%)</span>
                          <span className="font-black text-slate-800">+{salary.holidayAllowance.toFixed(2)} CHF</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">Tredicesima ({thirteenthAllowance}%)</span>
                          <span className="font-black text-slate-800">+{salary.thirteenthAllowance.toFixed(2)} CHF</span>
                        </div>
                        
                        {(totalBreakdown.sundayHours > 0 || totalBreakdown.nightHours > 0 || salary.clothingAllocation > 0) && (
                          <div className="my-1 border-t border-slate-100"></div>
                        )}
                        
                        {totalBreakdown.sundayHours > 0 && (
                          <div className="flex justify-between">
                            <span className="font-medium">Ore Domenicali ({formatHoursDisplay(totalBreakdown.sundayHours)})</span>
                            <span className="font-black text-emerald-600">+{salary.sundaySupplement.toFixed(2)} CHF</span>
                          </div>
                        )}
                        {totalBreakdown.nightHours > 0 && (
                          <div className="flex justify-between">
                            <span className="font-medium">Ore Notturne ({formatHoursDisplay(totalBreakdown.nightHours)})</span>
                            <span className="font-black text-emerald-600">+{salary.nightSupplement.toFixed(2)} CHF</span>
                          </div>
                        )}
                        {salary.clothingAllocation > 0 && (
                          <div className="flex justify-between">
                            <span className="font-medium">Allocazione Vestiario</span>
                            <span className="font-black text-slate-800">+{salary.clothingAllocation.toFixed(2)} CHF</span>
                          </div>
                        )}

                        <div className="flex justify-between text-indigo-900 border-t border-slate-200 pt-2 mt-1 px-2 py-1.5 rounded-lg bg-slate-50">
                          <span className="font-black text-[11px] uppercase tracking-wider">Salario Lordo</span>
                          <span className="font-black">{salary.grossSalary.toFixed(2)} CHF</span>
                        </div>
                        
                        <div className="font-black text-[10px] text-slate-400 uppercase tracking-widest mt-3 mb-1">Deduzioni Sociali</div>
                        
                        <div className="flex justify-between">
                          <span className="font-medium">AVS/AI/IPG ({avsDeduction}%)</span>
                          <span className="font-black text-rose-500">-{salary.avsDeduction.toFixed(2)} CHF</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">Ass. Disoccupazione ({unemploymentDeduction}%)</span>
                          <span className="font-black text-rose-500">-{salary.unemploymentDeduction.toFixed(2)} CHF</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">Ass. Ind. Giornaliera ({dailySicknessDeduction}%)</span>
                          <span className="font-black text-rose-500">-{salary.dailySicknessDeduction.toFixed(2)} CHF</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">Ass. Infortuni ({accidentDeduction}%)</span>
                          <span className="font-black text-rose-500">-{salary.accidentDeduction.toFixed(2)} CHF</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">Previdenza Prof. ({secondPillarDeduction}%)</span>
                          <span className="font-black text-rose-500">-{salary.secondPillarDeduction.toFixed(2)} CHF</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-medium">Imposta alla Fonte ({sourceTaxDeduction}%)</span>
                          <span className="font-black text-rose-500">-{salary.sourceTaxDeduction.toFixed(2)} CHF</span>
                        </div>
                        
                        <div className="flex justify-between text-rose-700 border-t border-rose-100 pt-2 mt-1 px-2 py-1.5 rounded-lg bg-rose-50/50">
                          <span className="font-black text-[11px] uppercase tracking-wider">Totale Trat.</span>
                          <span className="font-black">-{salary.totalDeductions.toFixed(2)} CHF</span>
                        </div>
                        
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-center text-slate-400 p-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <Calculator size={36} className="text-slate-300 mb-4" />
              <p className="text-sm font-medium max-w-[220px] text-slate-500">
                Seleziona un intervallo di date per generare un calcolo dello stipendio.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
