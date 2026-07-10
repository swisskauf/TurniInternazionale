import React from 'react';
import { X } from 'lucide-react';

interface CustomCodeModalProps {
  editingCode: string | null;
  setEditingCode: (code: string | null) => void;
  customIsDayOff: boolean;
  setCustomIsDayOff: (isDayOff: boolean) => void;
  customStart1: string;
  setCustomStart1: (start: string) => void;
  customEnd1: string;
  setCustomEnd1: (end: string) => void;
  customStart2: string;
  setCustomStart2: (start: string) => void;
  customEnd2: string;
  setCustomEnd2: (end: string) => void;
  handleSaveCustomCode: () => void;
}

export const CustomCodeModal: React.FC<CustomCodeModalProps> = ({
  editingCode,
  setEditingCode,
  customIsDayOff,
  setCustomIsDayOff,
  customStart1,
  setCustomStart1,
  customEnd1,
  setCustomEnd1,
  customStart2,
  setCustomStart2,
  customEnd2,
  setCustomEnd2,
  handleSaveCustomCode
}) => {
  if (!editingCode) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-auto overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Imposta orario per "{editingCode}"</h3>
          <button onClick={() => setEditingCode(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="isDayOff"
              checked={customIsDayOff}
              onChange={(e) => setCustomIsDayOff(e.target.checked)}
              className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
            />
            <label htmlFor="isDayOff" className="text-sm font-medium text-slate-700">
              Questo codice indica un giorno libero
            </label>
          </div>

          {!customIsDayOff && (
            <>
              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Primo Turno</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500">Inizio (es. 08:00)</label>
                    <input
                      type="time"
                      value={customStart1}
                      onChange={(e) => setCustomStart1(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500">Fine (es. 12:00)</label>
                    <input
                      type="time"
                      value={customEnd1}
                      onChange={(e) => setCustomEnd1(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Secondo Turno (Opzionale)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500">Inizio (es. 13:00)</label>
                    <input
                      type="time"
                      value={customStart2}
                      onChange={(e) => setCustomStart2(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-slate-500">Fine (es. 17:00)</label>
                    <input
                      type="time"
                      value={customEnd2}
                      onChange={(e) => setCustomEnd2(e.target.value)}
                      className="block w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={() => setEditingCode(null)}
            className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium hover:bg-slate-50 transition-colors cursor-pointer shadow-sm"
          >
            Annulla
          </button>
          <button
            onClick={handleSaveCustomCode}
            disabled={!customIsDayOff && (!customStart1 || !customEnd1)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm"
          >
            Salva Codice
          </button>
        </div>
      </div>
    </div>
  );
};
