import React from 'react';
import { X, Edit2, Clock, Calendar, CheckCircle2, AlertCircle, Coins, CalendarPlus } from 'lucide-react';
import { InterpretedShift } from '../../types';
import { calculateShiftBreakdown, calculateSalaryBreakdown, getHours, formatHoursDisplay } from '../../utils/shiftUtils';

interface ViewShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string;
  code: string;
  note?: string;
  interpreted: InterpretedShift;
  onEdit: () => void;
  isModified: boolean;
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
  sundaySupplement?: number;
  nightSupplement?: number;
}

export const ViewShiftModal: React.FC<ViewShiftModalProps> = ({
  isOpen,
  onClose,
  dateStr,
  code,
  note,
  interpreted,
  onEdit,
  isModified,
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
  sundaySupplement = 0,
  nightSupplement = 0
}) => {
  if (!isOpen) return null;

  const formattedDate = new Date(dateStr).toLocaleDateString('it-IT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let dailyBreakdown = { totalHours: 0, sundayHours: 0, nightHours: 0 };
  if (interpreted.status === 'Work') {
    interpreted.shifts.forEach(s => {
      const startH = getHours(s.start);
      const endH = getHours(s.end);
      const shiftBreakdown = calculateShiftBreakdown(dateStr, startH, endH);
      dailyBreakdown = {
        totalHours: dailyBreakdown.totalHours + shiftBreakdown.totalHours,
        sundayHours: dailyBreakdown.sundayHours + shiftBreakdown.sundayHours,
        nightHours: dailyBreakdown.nightHours + shiftBreakdown.nightHours
      };
    });
  }

  const dailySalary = calculateSalaryBreakdown(
    dailyBreakdown, hourlyWage, thirteenthAllowance, vacationAllowance, 
    holidayAllowance, sundaySupplement, nightSupplement, Math.min(dailyBreakdown.totalHours, 154.5) * clothingAllocation, // Not using full max maxClothingAllocation here just for display
    avsDeduction, unemploymentDeduction, dailySicknessDeduction, accidentDeduction, 
    secondPillarDeduction, sourceTaxDeduction
  );

  const handleAddToCalendar = () => {
    if (interpreted.status !== 'Work' || interpreted.shifts.length === 0) return;

    let eventDetails = '';
    interpreted.shifts.forEach((s, idx) => {
      eventDetails += `Orario ${idx + 1}: ${s.start} - ${s.end}\\n`;
    });
    if (note) {
      eventDetails += `\\nNota: ${note}`;
    }

    const title = `Turno ${code}`;

    const firstShift = interpreted.shifts[0];
    const lastShift = interpreted.shifts[interpreted.shifts.length - 1];

    const formatICSDate = (dateString: string, timeString: string) => {
      const [year, month, day] = dateString.split('-');
      const [hour, minute] = timeString.split(':');
      return `${year}${month}${day}T${hour}${minute}00`;
    };

    const dtStart = formatICSDate(dateStr, firstShift.start);
    let endDateStr = dateStr;
    if (lastShift.end < firstShift.start) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + 1);
        endDateStr = d.toISOString().split('T')[0];
    }
    const dtEnd = formatICSDate(endDateStr, lastShift.end);

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${title}
DESCRIPTION:${eventDetails}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Turno_${dateStr}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors z-10"
        >
          <X size={20} />
        </button>

        <div className={`px-6 py-8 border-b ${isModified ? 'bg-amber-50 border-amber-100 text-amber-900' : 'bg-indigo-50 border-indigo-100 text-indigo-900'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={18} className={isModified ? 'text-amber-500' : 'text-indigo-500'} />
            <span className="text-sm font-semibold capitalize tracking-wide">{formattedDate}</span>
          </div>
          <div className="flex items-end gap-3 mt-4">
            <h2 className="text-4xl font-black">{code || 'GR'}</h2>
            {isModified && (
              <span className="text-xs font-bold px-2 py-1 bg-amber-200 text-amber-800 rounded-md mb-1 uppercase tracking-wider shadow-sm border border-amber-300">MODIFICATA</span>
            )}
          </div>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            {interpreted.status === 'Work' && interpreted.shifts.length > 0 ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
                  <Clock size={16} />
                  <span>Orari Di Lavoro</span>
                </div>
                <div className="flex flex-col gap-2 pl-6">
                  {interpreted.shifts.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 bg-slate-50 rounded-lg px-4 border border-slate-100">
                      <span className="font-bold text-slate-600">{s.start}</span>
                      <span className="text-slate-300 px-2">-</span>
                      <span className="font-bold text-slate-600">{s.end}</span>
                    </div>
                  ))}
                </div>
                
                {enableHourTracking && (
                  <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                    <div className="flex items-center gap-2">
                      <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                        <CheckCircle2 size={18} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600/60">Ore Lavorate</span>
                        <span className="text-sm font-black text-emerald-700">{formatHoursDisplay(dailyBreakdown.totalHours)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600/60">Guadagno netto</span>
                        <span className="text-sm font-black text-emerald-700">{dailySalary.netSalary.toFixed(2)} CHF</span>
                      </div>
                      <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                        <Coins size={18} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center p-6 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-black text-slate-400 uppercase tracking-widest">
                  {interpreted.status === 'Day off' ? 'Riposo' : interpreted.status === 'Vacation' ? 'Ferie' : interpreted.status}
                </span>
              </div>
            )}
            
            {note && (
              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                <div className="text-indigo-500 shrink-0 mt-0.5">
                  <Edit2 size={16} />
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Nota</h4>
                  <p className="text-sm text-slate-700 font-medium italic">{note}</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col gap-3">
            {interpreted.status === 'Work' && interpreted.shifts.length > 0 && (
              <button
                onClick={handleAddToCalendar}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl cursor-pointer transition-colors w-full justify-center"
              >
                <CalendarPlus size={18} />
                <span>Aggiungi al Calendario</span>
              </button>
            )}
            <button
              onClick={() => {
                onClose();
                onEdit();
              }}
              className="flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md cursor-pointer transition-colors w-full justify-center"
            >
              <Edit2 size={18} />
              <span>{(!code || code === 'GR') ? 'Aggiungi Turno' : 'Modifica Turno'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
