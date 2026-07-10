import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, Info, RefreshCw } from 'lucide-react';
import { Employee, CustomShiftCode } from '../types';
import { interpretShift } from '../utils/shiftUtils';
import { ViewShiftModal } from './modals/ViewShiftModal';

interface CalendarPanelProps {
  selectedEmployee: Employee;
  customCodes: Record<string, CustomShiftCode>;
  openEditShiftModal: (date: string, code: string) => void;
  enableHourTracking?: boolean;
  hourlyWage?: number;
  thirteenthAllowance?: number;
  vacationAllowance?: number;
  holidayAllowance?: number;
  clothingAllocation?: number;
  avsDeduction?: number;
  unemploymentDeduction?: number;
  dailySicknessDeduction?: number;
  accidentDeduction?: number;
  secondPillarDeduction?: number;
  sourceTaxDeduction?: number;
  coordinationDeduction?: number;
  maxClothingAllocation?: number;
  sundaySupplement?: number;
  nightSupplement?: number;
}

export const CalendarPanel: React.FC<CalendarPanelProps> = ({
  selectedEmployee,
  customCodes,
  openEditShiftModal,
  enableHourTracking = false,
  hourlyWage = 0,
  thirteenthAllowance = 0,
  vacationAllowance = 0,
  holidayAllowance = 0,
  clothingAllocation = 0,
  avsDeduction = 0,
  unemploymentDeduction = 0,
  dailySicknessDeduction = 0,
  accidentDeduction = 0,
  secondPillarDeduction = 0,
  sourceTaxDeduction = 0,
  coordinationDeduction = 2205,
  maxClothingAllocation = 50,
  sundaySupplement = 0,
  nightSupplement = 0
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  
  const [viewingShift, setViewingShift] = useState<{ dateStr: string, code: string } | null>(null);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const monthName = currentMonth.toLocaleString('it-IT', { month: 'long', year: 'numeric' });

  const scheduleDates = selectedEmployee.schedule.map(s => s.date).sort();
  const globalMinDate = scheduleDates.length ? scheduleDates[0] : '9999-12-31';
  const globalMaxDate = scheduleDates.length ? scheduleDates[scheduleDates.length - 1] : '0000-01-01';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between bg-white px-2 py-1.5 rounded-xl border border-slate-200 shadow-sm mx-auto max-w-sm w-full">
        <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
          <ArrowLeft size={16} />
        </button>
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">{monthName}</h3>
        <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50">
          {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(day => (
            <div key={day} className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 last:border-r-0">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[100px] bg-slate-50/30 border-r border-b border-slate-100 last:border-r-0"></div>
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            if (dateStr > globalMaxDate) {
              return (
                <div key={`empty-end-${day}`} className="min-h-[100px] bg-slate-50/30 border-r border-b border-slate-100 last:border-r-0"></div>
              );
            }

            const entry = selectedEmployee.schedule.find(s => s.date === dateStr);
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            
            let content = null;
            let bgColor = 'bg-white';
            
            if (entry && entry.code && entry.code.trim() !== '') {
              const interpreted = interpretShift(entry.date, entry.code, customCodes, entry.manualShifts);
              const isModified = entry.isManuallyModified || entry.isUpdated;
              
              if (interpreted.status === 'Work') {
                if (entry.note) {
                  bgColor = 'bg-amber-50/70 border-amber-200 shadow-inner';
                } else {
                  bgColor = isModified ? 'bg-amber-50/70 border-amber-200 shadow-inner' : 'bg-indigo-50/30';
                }
                
                const firstStart = interpreted.shifts.length > 0 ? interpreted.shifts[0].start : '';
                const lastEnd = interpreted.shifts.length > 0 ? interpreted.shifts[interpreted.shifts.length - 1].end : '';
                
                const textColor = entry.note ? 'text-amber-700' : (isModified ? 'text-amber-700' : 'text-indigo-700');
                
                content = (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className={`text-xs font-black ${textColor}`}>{entry.code}</span>
                    {firstStart && lastEnd && (
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 shadow-sm border border-emerald-400"></div>
                          <span className={`text-[10px] font-bold ${textColor.replace('700', '600')} leading-none tracking-tight`}>{firstStart}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 shadow-sm border border-rose-400"></div>
                          <span className={`text-[10px] font-bold ${textColor.replace('700', '600')} leading-none tracking-tight`}>{lastEnd}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              } else if (interpreted.status === 'Day off') {
                if (entry.note) {
                  bgColor = 'bg-amber-50/70 border-amber-200 shadow-inner';
                } else {
                  bgColor = isModified ? 'bg-amber-50/60 border-amber-200' : 'bg-emerald-50/30';
                }
                const textColor = entry.note ? 'text-amber-600' : (isModified ? 'text-amber-600' : 'text-emerald-700');
                const subTextColor = entry.note ? 'text-amber-500' : (isModified ? 'text-amber-500' : 'text-emerald-600');
                
                content = (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className={`text-xs font-black ${textColor}`}>{entry.code}</span>
                    <span className={`text-[9px] font-bold ${subTextColor} leading-tight uppercase`}>RIPOSO</span>
                  </div>
                );
              } else if (interpreted.status === 'Vacation') {
                if (entry.note) {
                  bgColor = 'bg-amber-50/70 border-amber-200 shadow-inner';
                } else {
                  bgColor = isModified ? 'bg-amber-50/60 border-amber-200' : 'bg-amber-50/30';
                }
                const textColor = entry.note ? 'text-amber-700' : (isModified ? 'text-amber-700' : 'text-amber-700');
                const subTextColor = entry.note ? 'text-amber-600' : (isModified ? 'text-amber-600' : 'text-amber-600');
                
                content = (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className={`text-xs font-black ${textColor}`}>{entry.code}</span>
                    <span className={`text-[9px] font-bold ${subTextColor} leading-tight uppercase`}>FERIE</span>
                  </div>
                );
              } else {
                if (entry.note) {
                  bgColor = 'bg-amber-50/70 border-amber-200 shadow-inner';
                } else {
                  bgColor = isModified ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50';
                }
                content = <span className={`text-xs font-bold mt-1 block ${entry.note ? 'text-amber-600' : 'text-slate-500'}`}>{entry.code}</span>;
              }
            } else {
               bgColor = 'bg-slate-50 border-slate-100/50';
               const isOutside = dateStr < globalMinDate || dateStr > globalMaxDate;
               if (!isOutside) {
                 content = (
                   <div className="flex flex-col gap-1 mt-1">
                     <span className="text-xs font-black text-slate-400">GR</span>
                     <span className="text-[9px] font-bold text-slate-300 leading-tight uppercase">RIPOSO</span>
                   </div>
                 );
               }
            }

            return (
              <div 
                key={day} 
                onClick={() => dateStr <= globalMaxDate && setViewingShift({ dateStr, code: entry?.code || '' })}
                className={`min-h-[100px] p-2 border-r border-b relative group transition-colors ${dateStr <= globalMaxDate ? 'cursor-pointer hover:bg-slate-50 hover:shadow-inner' : 'bg-slate-50/50'} ${bgColor} ${(!entry || !(entry.isManuallyModified || entry.isUpdated)) ? 'border-slate-100 last:border-r-0' : ''}`}
              >
                {dateStr <= globalMaxDate && (
                  <>
                    <div className="relative flex items-center justify-center w-6 h-6">
                      {isToday && (
                        <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75 animate-ping"></span>
                      )}
                      <div className={`relative z-10 text-xs font-bold w-full h-full flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-400'}`}>
                        {day}
                      </div>
                    </div>
                    <div className="mt-1">
                      {content}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {viewingShift && (() => {
        const entry = selectedEmployee.schedule.find(s => s.date === viewingShift.dateStr);
        const code = viewingShift.code || 'GR';
        const interpreted = interpretShift(viewingShift.dateStr, code, customCodes, entry?.manualShifts);
        const isModified = entry ? (entry.isManuallyModified || entry.isUpdated) : false;
        
        return (
          <ViewShiftModal
            isOpen={!!viewingShift}
            onClose={() => setViewingShift(null)}
            dateStr={viewingShift.dateStr}
            code={code}
            note={entry?.note}
            interpreted={interpreted}
            isModified={isModified || false}
            onEdit={() => {
              setViewingShift(null);
              openEditShiftModal(viewingShift.dateStr, code);
            }}
            enableHourTracking={enableHourTracking}
            hourlyWage={hourlyWage}
            thirteenthAllowance={thirteenthAllowance}
            vacationAllowance={vacationAllowance}
            holidayAllowance={holidayAllowance}
            clothingAllocation={clothingAllocation}
            avsDeduction={avsDeduction}
            unemploymentDeduction={unemploymentDeduction}
            dailySicknessDeduction={dailySicknessDeduction}
            accidentDeduction={accidentDeduction}
            secondPillarDeduction={secondPillarDeduction}
            sourceTaxDeduction={sourceTaxDeduction}
            coordinationDeduction={coordinationDeduction}
            maxClothingAllocation={maxClothingAllocation}
            sundaySupplement={sundaySupplement}
            nightSupplement={nightSupplement}
          />
        );
      })()}
    </div>
  );
};
