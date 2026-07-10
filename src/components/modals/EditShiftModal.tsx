import React from 'react';
import { X, Plus, RefreshCw, Loader2 } from 'lucide-react';
import { formatCardDate } from '../../utils/dateUtils';
import { EditingShift, ShiftPeriod, CustomShiftCode } from '../../types';
import { interpretShift } from '../../utils/shiftUtils';

interface EditShiftModalProps {
  editingShift: EditingShift | null;
  setEditingShift: (shift: EditingShift | null) => void;
  manualPeriods: ShiftPeriod[];
  setManualPeriods: (periods: ShiftPeriod[]) => void;
  newShiftCode: string;
  setNewShiftCode: (code: string) => void;
  isImprovingNote: boolean;
  handleImproveNote: () => void;
  handleUpdateShiftCode: () => void;
  customCodes: Record<string, CustomShiftCode>;
}

export const EditShiftModal: React.FC<EditShiftModalProps> = ({
  editingShift,
  setEditingShift,
  manualPeriods,
  setManualPeriods,
  newShiftCode,
  setNewShiftCode,
  isImprovingNote,
  handleImproveNote,
  handleUpdateShiftCode,
  customCodes
}) => {
  if (!editingShift) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-auto overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Modifica Turno: {formatCardDate(editingShift.date).dayMonth}</h3>
          <button onClick={() => setEditingShift(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Data</label>
            <input 
              type="date" 
              value={editingShift.date} 
              onChange={(e) => setEditingShift({ ...editingShift, date: e.target.value })}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="flex flex-col gap-4">
            <label className="text-sm font-medium text-slate-700">Orari di Lavoro (Pause incluse)</label>
            {manualPeriods.map((period, idx) => (
              <div key={`period-${idx}`} className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl relative">
                {manualPeriods.length > 1 && (
                  <button 
                    onClick={() => {
                      const newPeriods = [...manualPeriods];
                      newPeriods.splice(idx, 1);
                      setManualPeriods(newPeriods);
                    }}
                    className="absolute -top-2 -right-2 bg-white border border-slate-200 text-rose-500 p-1 rounded-full shadow-sm hover:bg-rose-50 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inizio {idx + 1}</label>
                    <input 
                      type="time" 
                      value={period.start}
                      onChange={(e) => {
                        const newPeriods = [...manualPeriods];
                        newPeriods[idx].start = e.target.value;
                        setManualPeriods(newPeriods);
                        setEditingShift({ ...editingShift, isManuallyModified: true });
                      }}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fine {idx + 1}</label>
                    <input 
                      type="time" 
                      value={period.end}
                      onChange={(e) => {
                        const newPeriods = [...manualPeriods];
                        newPeriods[idx].end = e.target.value;
                        setManualPeriods(newPeriods);
                        setEditingShift({ ...editingShift, isManuallyModified: true });
                      }}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
            
            <button 
              onClick={() => setManualPeriods([...manualPeriods, { start: '', end: '' }])}
              className="flex items-center justify-center gap-2 py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-all text-sm font-medium"
            >
              <Plus size={16} />
              Aggiungi Turno/Pausa
            </button>
          </div>

          <div className="relative flex items-center gap-2 my-2">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Oppure usa un codice</span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Codice Turno (Opzionale)</label>
            <input 
              type="text" 
              value={newShiftCode} 
              onChange={(e) => {
                const code = e.target.value.toUpperCase();
                setNewShiftCode(code);
                
                // If they change code, assume we want to reset to "Normale" for this new code
                setEditingShift({ ...editingShift, isManuallyModified: false });
                
                const interpreted = interpretShift(editingShift.date, code, customCodes);
                if (interpreted.status === 'Work' && interpreted.shifts.length > 0) {
                  setManualPeriods(interpreted.shifts.map(s => ({ ...s })));
                } else {
                  setManualPeriods([{ start: '', end: '' }]);
                }
              }}
              placeholder="Es: P1, GR, GV, 4..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-bold"
            />
            <button
              onClick={() => {
                const newIsModified = !editingShift.isManuallyModified;
                setEditingShift({ ...editingShift, isManuallyModified: newIsModified });
                if (!newIsModified) {
                  // Switch to Normale: reset manual periods to the default code's periods
                  const interpreted = interpretShift(editingShift.date, newShiftCode, customCodes);
                  if (interpreted.status === 'Work' && interpreted.shifts.length > 0) {
                    setManualPeriods(interpreted.shifts.map(s => ({ ...s })));
                  } else {
                    setManualPeriods([{ start: '', end: '' }]);
                  }
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${editingShift.isManuallyModified ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
            >
              <div className={`w-3 h-3 rounded-full ${editingShift.isManuallyModified ? 'bg-amber-500' : 'bg-slate-400'}`}></div>
              {editingShift.isManuallyModified ? 'Modificato' : 'Normale'}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Note Tecniche</label>
              <button 
                onClick={handleImproveNote}
                disabled={isImprovingNote || !editingShift.note?.trim()}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 hover:text-indigo-700 disabled:text-slate-400 transition-colors cursor-pointer"
              >
                {isImprovingNote ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                Migliora con AI
              </button>
            </div>
            <textarea 
              value={editingShift.note || ''} 
              onChange={(e) => setEditingShift({ ...editingShift, note: e.target.value })}
              placeholder="Aggiungi una nota tecnica..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm min-h-[80px] resize-none"
            />
          </div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={() => setEditingShift(null)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors cursor-pointer">Annulla</button>
          <button onClick={handleUpdateShiftCode} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors cursor-pointer shadow-sm">Aggiorna Turno</button>
        </div>
      </div>
    </div>
  );
};
