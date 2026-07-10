import React from 'react';
import { motion } from 'motion/react';
import { Table as TableIcon, RefreshCw, Settings, Undo2, Trash2 } from 'lucide-react';

interface HeaderProps {
  onReset: () => void;
  onOpenSettings: () => void;
  onUndo?: () => void;
  canUndo?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onReset, onOpenSettings, onUndo, canUndo }) => {
  const onReload = () => {
    window.location.reload();
  };
  
  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 sticky top-0 z-30 shadow-sm flex items-center justify-between print:hidden">
      <div className="flex items-center gap-3">
        <motion.div 
          initial={{ rotate: -10, scale: 0.9 }}
          animate={{ rotate: 0, scale: 1 }}
          className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-200"
        >
          <TableIcon size={22} />
        </motion.div>
        <div>
          <h1 className="font-bold text-xl tracking-tight text-slate-900">ScattaTurni</h1>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {onUndo && (
          <button 
            onClick={onUndo}
            disabled={!canUndo}
            className={`p-2.5 rounded-xl transition-all ${
              canUndo 
                ? 'text-slate-500 hover:text-blue-600 hover:bg-blue-50 cursor-pointer' 
                : 'text-slate-300 cursor-not-allowed'
            }`}
            title="Annulla Ultima Azione"
          >
            <Undo2 size={20} />
          </button>
        )}
        <button 
          onClick={onReload}
          className="text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 p-2.5 rounded-xl transition-all cursor-pointer"
          title="Aggiorna App (dati salvati)"
        >
          <RefreshCw size={20} />
        </button>
        <button 
          onClick={onReset}
          className="text-slate-500 hover:text-red-600 hover:bg-red-50 p-2.5 rounded-xl transition-all cursor-pointer"
          title="Elimina Tutti i Dati"
        >
          <Trash2 size={20} />
        </button>
        <button 
          onClick={onOpenSettings} 
          className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-2.5 rounded-xl transition-all cursor-pointer"
          title="Impostazioni"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
};
