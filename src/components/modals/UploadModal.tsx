import React, { useRef } from 'react';
import { Camera, Upload, Users, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetEmployeeName: string;
  onEmployeeNameChange: (name: string) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  targetEmployeeName,
  onEmployeeNameChange,
  onFileChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-900/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
        >
          <div className="flex bg-slate-50 items-center justify-between p-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800">Scansiona Orario</h3>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="p-5 flex flex-col gap-6">
            <div className="text-center space-y-1">
              <p className="text-slate-500 text-sm">
                Carica o scatta una foto per estrarre i turni.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm">
              <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
                Nome Dipendente
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  value={targetEmployeeName}
                  onChange={(e) => {
                    onEmployeeNameChange(e.target.value);
                    localStorage.setItem('savedEmployeeName', e.target.value);
                  }}
                  placeholder="Inserisci il tuo nome"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                />
              </div>
            </div>
            
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-bold text-sm shadow-sm"
              >
                <Camera size={18} />
                Scatta
              </button>
              
              <button 
                onClick={() => galleryInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-700 font-bold text-sm shadow-sm"
              >
                <Upload size={18} />
                Carica
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef}
        onChange={(e) => { onClose(); onFileChange(e); }}
        accept="image/*"
        capture="environment"
        className="hidden"
      />
      <input 
        type="file" 
        ref={galleryInputRef}
        onChange={(e) => { onClose(); onFileChange(e); }}
        accept="image/*"
        className="hidden"
      />
    </AnimatePresence>
  );
};
