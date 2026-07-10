import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Edit2, Check, Clock, ChevronRight } from 'lucide-react';
import { CustomShiftCode, ShiftPeriod } from '../../types';

interface ManageCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  customCodes: Record<string, CustomShiftCode>;
  setCustomCodes: React.Dispatch<React.SetStateAction<Record<string, CustomShiftCode>>>;
}

export const ManageCodesModal: React.FC<ManageCodesModalProps> = ({ isOpen, onClose, customCodes, setCustomCodes }) => {
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [tempCode, setTempCode] = useState<CustomShiftCode | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  if (!isOpen) return null;

  const handleEdit = (code: string) => {
    setTempCode({ ...customCodes[code] });
    setEditingCode(code);
    setIsAdding(false);
  };

  const handleAdd = () => {
    setTempCode({ code: '', status: 'Work', shifts: [{ start: '08:00', end: '17:00' }] });
    setEditingCode(null);
    setIsAdding(true);
  };

  const handleSave = () => {
    if (!tempCode || !tempCode.code.trim()) return;
    const key = tempCode.code.trim().toUpperCase();
    setCustomCodes(prev => ({
      ...prev,
      [key]: {
        ...tempCode,
        code: key,
        deleted: false
      }
    }));
    setEditingCode(null);
    setIsAdding(false);
    setTempCode(null);
  };

  const handleDelete = (code: string) => {
    if (confirm(`Sei sicuro di voler eliminare il codice "${code}"?`)) {
      setCustomCodes(prev => ({
        ...prev,
        [code]: { ...prev[code], deleted: true }
      }));
      if (editingCode === code) {
        setEditingCode(null);
        setTempCode(null);
      }
    }
  };

  const activeCodes = (Object.entries(customCodes) as [string, CustomShiftCode][]).filter(([_, val]) => !val.deleted).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col sm:flex-row"
      >
        {/* Left Side: List of Codes */}
        <div className={`w-full sm:w-5/12 lg:w-1/3 flex-col min-h-0 bg-slate-50 border-r border-slate-200 ${tempCode ? 'hidden sm:flex' : 'flex'}`}>
          <div className="flex justify-between items-center p-6 border-b border-slate-200 shrink-0 bg-white">
            <h2 className="text-xl font-black text-slate-800">Codici Turno</h2>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors sm:hidden">
              <X size={20} className="text-slate-500" />
            </button>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto min-h-0">
            <button 
              onClick={handleAdd}
              className={`w-full mb-4 flex shrink-0 items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-colors shadow-sm ${isAdding ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-white text-indigo-600 border border-slate-200 hover:border-indigo-200 hover:bg-indigo-50'}`}
            >
              <Plus size={16} /> Nuovo Codice Turno
            </button>

            <div className="flex flex-col gap-2">
              {activeCodes.map(([code, details]) => {
                const isSelected = editingCode === code;
                return (
                  <button 
                    key={code}
                    onClick={() => handleEdit(code)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all ${isSelected ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-slate-200 hover:border-indigo-200 hover:shadow-sm'}`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black uppercase ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>{code}</span>
                        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full ${details.status === 'Work' ? 'bg-emerald-100 text-emerald-700' : details.status === 'Vacation' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                          {details.status === 'Work' ? 'Lav' : details.status === 'Vacation' ? 'Fer' : 'Rip'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {details.status === 'Work' && details.shifts && details.shifts.length > 0 ? (
                          <span className="text-xs font-bold text-slate-500">
                            {details.shifts.map(s => `${s.start}-${s.end}`).join(' / ')}
                          </span>
                        ) : (
                           <span className="text-xs font-medium text-slate-400">Intero giorno</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <ChevronRight size={18} className={isSelected ? 'text-indigo-500' : 'text-slate-300'} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Edit Form */}
        <div className={`flex-1 flex-col min-h-0 bg-white ${tempCode ? 'flex' : 'hidden sm:flex'}`}>
          <div className="flex sm:hidden shrink-0 items-center justify-between p-4 border-b border-slate-100 bg-white">
            <button onClick={() => { setEditingCode(null); setTempCode(null); setIsAdding(false); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors font-bold text-slate-500 flex items-center gap-1">
               <span className="px-2">Indietro</span>
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X size={20} className="text-slate-500" />
            </button>
          </div>
          <div className="hidden sm:flex shrink-0 justify-end p-4">
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <X size={24} className="text-slate-500" />
            </button>
          </div>

          <div className="flex-1 p-6 sm:px-12 pb-12 overflow-y-auto min-h-0">
            {!tempCode ? (
              <div className="w-full h-full flex flex-col items-center justify-center text-center opacity-50">
                <Edit2 size={48} className="text-slate-300 mb-4" />
                <h3 className="text-lg font-bold text-slate-500">Seleziona un codice</h3>
                <p className="text-sm font-medium text-slate-400">Clicca su un codice a sinistra per modificarlo o creane uno nuovo.</p>
              </div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                key={isAdding ? 'add' : editingCode}
                className="max-w-md mx-auto w-full"
              >
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-2xl font-black text-slate-800">{isAdding ? 'Crea nuovo codice' : `Modifica codice ${tempCode.code}`}</h3>
                  {!isAdding && editingCode && (
                    <button onClick={() => handleDelete(editingCode)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="Elimina codice">
                      <Trash2 size={20} />
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">Codice Abbreviazione</label>
                    <input
                      type="text"
                      value={tempCode.code}
                      onChange={e => setTempCode({...tempCode, code: e.target.value.toUpperCase()})}
                      disabled={!isAdding}
                      className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-black text-lg uppercase text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all disabled:opacity-50"
                      placeholder="ES: M1, P2..."
                    />
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">Tipo Riconoscimento</label>
                    <select 
                      value={tempCode.status}
                      onChange={e => setTempCode({...tempCode, status: e.target.value as any, shifts: e.target.value !== 'Work' ? [] : (tempCode.shifts.length ? tempCode.shifts : [{start: '08:00', end: '17:00'}])})}
                      className="w-full px-5 py-3.5 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all cursor-pointer"
                    >
                      <option value="Work">Lavoro Operativo (con orari)</option>
                      <option value="Day off">Giorno Libero / Riposo</option>
                      <option value="Vacation">Ferie o Malattia 🌴</option>
                    </select>
                  </div>

                  {tempCode.status === 'Work' && (
                    <div className="flex flex-col gap-4 mt-2">
                      <div className="flex justify-between items-end">
                        <label className="text-xs font-black uppercase tracking-wider text-slate-500">
                          Orari Shift
                        </label>
                        <button 
                          onClick={() => setTempCode({...tempCode, shifts: [...tempCode.shifts, { start: '00:00', end: '00:00' }]})}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5"
                        >
                          <Plus size={14} /> Aggiungi Fascia
                        </button>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        {tempCode.shifts.map((s, idx) => (
                          <div key={idx} className="flex items-center gap-3 relative group">
                            <div className="flex-1 flex flex-col gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Inizio</span>
                              <input
                                type="time"
                                value={s.start}
                                onChange={e => {
                                  const newShifts = [...tempCode.shifts];
                                  newShifts[idx].start = e.target.value;
                                  setTempCode({...tempCode, shifts: newShifts});
                                }}
                                className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:border-indigo-500 transition-all font-mono"
                              />
                            </div>
                            <div className="pt-6">
                              <span className="text-slate-300 font-bold">→</span>
                            </div>
                            <div className="flex-1 flex flex-col gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Fine</span>
                              <input
                                type="time"
                                value={s.end}
                                onChange={e => {
                                  const newShifts = [...tempCode.shifts];
                                  newShifts[idx].end = e.target.value;
                                  setTempCode({...tempCode, shifts: newShifts});
                                }}
                                className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-black text-slate-800 outline-none focus:border-indigo-500 transition-all font-mono"
                              />
                            </div>
                            
                            {tempCode.shifts.length > 1 && (
                              <div className="pt-6 absolute -right-12 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    const newShifts = tempCode.shifts.filter((_, i) => i !== idx);
                                    setTempCode({...tempCode, shifts: newShifts});
                                  }}
                                  className="p-2.5 text-rose-500 hover:bg-rose-100 rounded-full transition-colors"
                                  title="Rimuovi fascia"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={handleSave}
                    disabled={!tempCode.code.trim() || (tempCode.status === 'Work' && tempCode.shifts.some(s => !s.start || !s.end))}
                    className="w-full mt-6 py-4 flex items-center justify-center gap-2 bg-indigo-600 text-white rounded-xl font-black text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:shadow-none"
                  >
                    <Check size={20} /> {isAdding ? 'Crea Codice' : 'Salva Modifiche'}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
