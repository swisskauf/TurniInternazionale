import React from 'react';
import { Loader2, AlertCircle, Users, Table as TableIcon } from 'lucide-react';

interface PreviewPanelProps {
  imagePreview: string;
  isProcessing: boolean;
  error: string | null;
  targetEmployeeName: string;
  setTargetEmployeeName: (name: string) => void;
  processImage: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  imagePreview,
  isProcessing,
  error,
  targetEmployeeName,
  setTargetEmployeeName,
  processImage
}) => {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-300">
      <div className="relative rounded-2xl overflow-hidden shadow-md bg-black/5 border border-slate-200">
        <img src={imagePreview} alt="Anteprima orario" className="w-full h-auto max-h-[50vh] object-contain" />
        {isProcessing && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <Loader2 size={40} className="text-indigo-600 animate-spin" />
            <div className="flex flex-col items-center">
              <p className="font-medium text-indigo-900 animate-pulse">Elaborazione immagine in corso...</p>
              <p className="text-xs text-indigo-600 mt-1 text-center px-4">Rilevamento bordi, correzione prospettiva, miglioramento contrasto e riduzione rumore</p>
            </div>
          </div>
        )}
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle size={20} className="shrink-0 mt-0.5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      {!isProcessing && (
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Nome Dipendente da Analizzare
            </label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={targetEmployeeName}
                onChange={(e) => {
                  setTargetEmployeeName(e.target.value);
                  localStorage.setItem('savedEmployeeName', e.target.value);
                }}
                placeholder="Es: Mario Rossi"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>
            <p className="text-xs text-slate-500 mt-2 italic">
              L'AI si concentrerà solo su questo nome per velocizzare l'analisi.
            </p>
          </div>

          <button 
            onClick={processImage}
            disabled={!targetEmployeeName.trim()}
            className={`w-full font-medium py-4 px-6 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2 text-lg cursor-pointer ${
              !targetEmployeeName.trim() 
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            <TableIcon size={24} />
            Estrai Dati
          </button>
        </div>
      )}
    </div>
  );
};
