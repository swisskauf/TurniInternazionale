import React, { useState } from 'react';
import { Printer, X, Copy, Check } from 'lucide-react';
import { Employee, CustomShiftCode } from '../../types';
import { interpretShift, calculateShiftHours, formatHoursDisplay } from '../../utils/shiftUtils';
import { getWeekNumber, formatCardDate } from '../../utils/dateUtils';

interface PrintModalProps {
  isOpen: boolean;
  startDate: string;
  endDate: string;
  selectedEmployee: Employee | null;
  customCodes: Record<string, CustomShiftCode>;
  onClose: () => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

export const PrintModal: React.FC<PrintModalProps> = ({
  isOpen,
  startDate,
  endDate,
  selectedEmployee,
  customCodes,
  onClose,
  onStartDateChange,
  onEndDateChange
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !selectedEmployee) return null;

  const handlePrint = () => {
    window.focus(); // Ensure the window has focus
    window.print();
  };

  const handleCopyText = () => {
    let summaryText = `Riassunto Turni: ${selectedEmployee.name} (${startDate.split('-').reverse().join('.')} - ${endDate.split('-').reverse().join('.')})\n\n`;
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Iterate through all days in range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const entry = selectedEmployee.schedule.find(e => e.date === dateStr);
      
      if (entry && entry.code && entry.code.trim() !== '') {
        const { weekday, dayMonth } = formatCardDate(entry.date);
        const interpreted = interpretShift(entry.date, entry.code, customCodes, entry.manualShifts);
        let dailyHours = 0;
        let timeString = "";
        
        if (interpreted.status === 'Work') {
          interpreted.shifts.forEach(s => { dailyHours += calculateShiftHours(s.start, s.end); });
          timeString = interpreted.shifts.map(s => `${s.start}-${s.end}`).join(' / ');
        } else {
          timeString = interpreted.status;
        }

        const totalMinutes = Math.round(dailyHours * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const timeFormat = `${hours}h ${minutes.toString().padStart(2, '0')}m`;

        summaryText += `${weekday} ${dayMonth} - Turno (${entry.code}): ${timeString} = ${timeFormat}\n`;
      }
    }

    navigator.clipboard.writeText(summaryText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <style>
        {`
          @media print {
            @page {
              margin: 1.2cm;
              size: A4 portrait;
            }
            
            html, body, #root {
              height: auto !important;
              overflow: visible !important;
              background-color: white !important;
            }
            
            /* Hide ALL elements in the body by default */
            body * {
              visibility: hidden;
            }
            
            /* Make the print section and all its children visible */
            #print-section, #print-section * {
              visibility: visible;
            }
            
            /* Crucial for multi-page printing: prevent the section from being restricted by its containers */
            #print-section {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              margin: 0;
              padding: 0;
            }

            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
            tfoot { display: table-row-group; } /* Better than footer-group for not repeating at bottom of every page unless intended */
          }
          
          /* Custom font for elegance */
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        `}
      </style>

      {/* Print Modal UI */}
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto pt-4 pb-4 print:hidden">
        <div className="bg-white rounded-[32px] w-full max-w-md my-auto shadow-2xl flex flex-col max-h-[95vh] border border-white/20 relative">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 sticky top-0 rounded-t-[32px] z-10 shrink-0">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <Printer size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">Stampa Report</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] leading-tight mt-0.5">Configura Periodo</p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="p-6 flex flex-col gap-6 overflow-y-auto shrink grow">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Inizio Periodo</label>
                <div className="relative group">
                  <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    className="block w-full min-w-0 appearance-none px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-semibold text-slate-700 transition-all font-sans cursor-pointer group-hover:border-slate-300"
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Fine Periodo</label>
                <div className="relative group">
                  <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => onEndDateChange(e.target.value)}
                    className="block w-full min-w-0 appearance-none px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-semibold text-slate-700 transition-all font-sans cursor-pointer group-hover:border-slate-300"
                  />
                </div>
              </div>
            </div>

            <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50 flex items-start gap-3">
              <div className="text-indigo-500 mt-0.5">
                <Printer size={16} />
              </div>
              <p className="text-[11px] text-indigo-700/80 font-medium leading-relaxed">
                Il report verrà generato in formato A4, ottimizzato per la massima leggibilità e risparmio di spazio.
              </p>
            </div>
          </div>
          
          <div className="p-5 bg-slate-50/80 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-0 rounded-b-[32px] z-10 shrink-0">
            <button 
              onClick={onClose} 
              className="px-6 py-2.5 text-slate-500 font-bold text-sm hover:text-slate-900 transition-colors uppercase tracking-widest w-full sm:w-auto"
            >
              Annulla
            </button>
            <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
              <button 
                onClick={handleCopyText} 
                className="bg-white text-slate-700 px-5 py-3 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all active:scale-95 border border-slate-200 shadow-sm flex items-center justify-center gap-2 uppercase tracking-widest whitespace-nowrap"
              >
                {copied ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                {copied ? "Copiato" : "Copia Testo"}
              </button>
              <button 
                onClick={handlePrint} 
                className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 uppercase tracking-widest whitespace-nowrap"
              >
                <Printer size={16} />
                Genera PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Print Section - Optimized for Elegance and Compactness */}
      <div id="print-section" className="hidden print:block bg-white text-slate-900 w-full font-sans">
        <div className="flex justify-between items-end border-b-4 border-slate-900 pb-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xs">S</div>
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600">ScattaTurni</span>
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tighter text-slate-950 leading-none">Registro Ore</h1>
            <p className="text-slate-400 text-xs mt-1 font-medium tracking-wide">
              Report generato il {new Date().toLocaleDateString('it-IT')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Collaboratore</p>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">{selectedEmployee.name}</h2>
            <div className="flex items-center justify-end gap-2 text-slate-500 text-xs mt-1">
              <span className="font-bold text-slate-900">Periodo:</span>
              <span>{startDate.split('-').reverse().join('.')}</span>
              <span>—</span>
              <span>{endDate.split('-').reverse().join('.')}</span>
            </div>
          </div>
        </div>

        {(() => {
          const usedCodes = new Set(
            selectedEmployee.schedule
              .filter(entry => entry.date >= startDate && entry.date <= endDate && entry.code && entry.code.trim() !== '')
              .map(entry => entry.code.trim().toUpperCase())
          );
          
          const legendCodes = Object.entries(customCodes).filter(([code, val]: [string, CustomShiftCode]) => usedCodes.has(code) && !val.deleted);
          
          if (legendCodes.length > 0) {
            return (
              <div className="mb-6 text-[9px] border-l-2 border-indigo-500 pl-4 py-1 font-sans">
                <h3 className="font-black mb-1.5 uppercase tracking-widest text-slate-400">Glossario Codici</h3>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {legendCodes.map(([code, details]: [string, CustomShiftCode]) => (
                    <div key={code} className="flex gap-2 items-center">
                      <span className="font-bold text-slate-900">{code}</span>
                      <span className="text-slate-400">/</span>
                      <span className="text-slate-500 italic">
                        {details.status === 'Work' && details.shifts 
                          ? details.shifts.map(s => `${s.start}-${s.end}`).join(', ')
                          : details.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          return null;
        })()}

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-900 text-[10px] font-black uppercase tracking-widest border-y border-slate-200">
              <th className="py-3 px-4 text-left w-[20%]">Data / Giorno</th>
              <th className="py-3 px-4 text-left w-[12%]">Codice</th>
              <th className="py-3 px-4 text-left w-[30%]">Turni di Lavoro</th>
              <th className="py-3 px-4 text-left w-[28%]">Note di Servizio</th>
              <th className="py-3 px-4 text-right w-[10%]">H. Tot</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const allDates: string[] = [];
              const start = new Date(startDate);
              const end = new Date(endDate);
              for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                allDates.push(d.toISOString().split('T')[0]);
              }

              const filteredEntries = allDates.map(dateStr => {
                const existingEntry = selectedEmployee.schedule.find(e => e.date === dateStr);
                return existingEntry || { date: dateStr, code: '', isManuallyModified: false, isUpdated: false };
              }).filter(entry => entry.code !== '');

              let lastWeekNum = -1;
              
              return filteredEntries.map((entry, idx) => {
                const isEmpty = !entry.code || entry.code.trim() === '';
                const interpreted = isEmpty ? null : interpretShift(entry.date, entry.code, customCodes, entry.manualShifts);
                const { weekday, dayMonth } = formatCardDate(entry.date);
                const dateObj = new Date(entry.date);
                const weekNum = getWeekNumber(dateObj);
                const showWeekHeader = lastWeekNum !== weekNum;
                lastWeekNum = weekNum;
                
                let dailyHours = 0;
                if (interpreted && interpreted.status === 'Work') {
                  interpreted.shifts.forEach(s => { dailyHours += calculateShiftHours(s.start, s.end); });
                }

                const isModified = entry.isManuallyModified || entry.isUpdated;

                return (
                  <React.Fragment key={`${entry.date}-${idx}`}>
                    {showWeekHeader && (
                      <tr className="bg-slate-100">
                        <td colSpan={5} className="py-2 px-4 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
                          Settimana {weekNum}
                        </td>
                      </tr>
                    )}
                    <tr className={`border-b text-[10px] ${isModified ? "bg-amber-50/50 border-amber-100" : "bg-white border-slate-100"}`}>
                      <td className="py-2.5 px-4">
                        <span className="font-bold text-slate-900">{weekday}</span>
                        <span className="ml-2 text-slate-400 font-medium">{dayMonth}</span>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-slate-800">{entry.code || 'GR'}</span>
                          {isModified && (
                            <span className="text-[7px] bg-amber-200 text-amber-800 font-black px-1.5 py-0.5 rounded uppercase tracking-tighter shadow-sm border border-amber-300">MODIFICATA</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-medium">
                        {isEmpty ? (
                          <span className="text-slate-300">—</span>
                        ) : interpreted?.status === 'Work' ? (
                          <div className="flex flex-wrap gap-2 text-slate-700">
                            {interpreted.shifts.map((s, i) => (
                              <span key={`${s.start}-${s.end}-${i}`} className="flex items-center gap-1">
                                {s.start} <span className="text-slate-300">→</span> {s.end}
                                {i < interpreted.shifts.length - 1 && <span className="text-slate-200 ml-1">/</span>}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 uppercase text-[8px] font-black tabular-nums tracking-widest">{interpreted?.status || "—"}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 italic text-[9px] leading-tight max-w-[200px] truncate">
                        {entry.note || ""}
                      </td>
                      <td className="py-2.5 px-4 text-right font-black text-slate-900 tabular-nums">
                        {formatHoursDisplay(dailyHours)}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              });
            })()}
          </tbody>
          <tfoot>
            <tr className="bg-slate-950 text-white">
              <td colSpan={4} className="py-4 px-4 text-right uppercase font-black tracking-[0.2em] text-[10px] text-slate-400">
                Sommario Totale Periodo
              </td>
              <td className="py-4 px-4 text-right font-black text-xl tabular-nums">
                {formatHoursDisplay(
                  selectedEmployee.schedule
                    .filter(entry => entry.date >= startDate && entry.date <= endDate && entry.code && entry.code.trim() !== '')
                    .reduce((total, entry) => {
                      const interpreted = interpretShift(entry.date, entry.code, customCodes, entry.manualShifts);
                      let dailyHours = 0;
                      if (interpreted.status === 'Work') {
                        interpreted.shifts.forEach(s => { dailyHours += calculateShiftHours(s.start, s.end); });
                      }
                      return total + dailyHours;
                    }, 0)
                )}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="fixed bottom-0 left-0 w-full p-6 flex justify-end items-center text-[8px] text-slate-300 font-sans uppercase tracking-[0.2em]">
        </div>
      </div>

    </>
  );
};

