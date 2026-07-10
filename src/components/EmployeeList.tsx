import React from 'react';
import { motion } from 'motion/react';
import { Users, Trash2, ChevronRight } from 'lucide-react';
import { Employee } from '../types';

interface EmployeeListProps {
  employees: Employee[];
  targetEmployeeName: string;
  onSelectEmployee: (emp: Employee) => void;
  onRemoveEmployee: (emp: Employee) => void;
}

export const EmployeeList: React.FC<EmployeeListProps> = ({
  employees,
  targetEmployeeName,
  onSelectEmployee,
  onRemoveEmployee
}) => {
  const filteredEmployees = employees.filter(emp => 
    !targetEmployeeName || emp.name.toLowerCase().includes(targetEmployeeName.toLowerCase())
  );

  return (
    <motion.div
      key="list"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between px-2 mb-2">
        <div className="flex flex-col">
          <h3 className="text-lg font-black text-slate-900 tracking-tight">Personale</h3>
          {targetEmployeeName && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-indigo-100">
                Filtro: {targetEmployeeName}
              </span>
            </div>
          )}
        </div>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md uppercase tracking-widest">
          {filteredEmployees.length} Dipendenti
        </span>
      </div>
      
      {filteredEmployees.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400 font-medium">
          Nessun dipendente trovato. Carica un'immagine per iniziare.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filteredEmployees.map((emp, idx) => (
            <motion.button
              key={`${emp.name}-${idx}`}
              whileHover={{ scale: 1.01, x: 4 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSelectEmployee(emp)}
              className="flex items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl hover:border-indigo-200 hover:shadow-md transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Users size={24} />
                </div>
                <div>
                  <span className="font-bold text-slate-800 text-lg block">{emp.name}</span>
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {emp.schedule.filter(s => s.code && s.code.trim() !== '').length} turni registrati
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveEmployee(emp);
                  }}
                  className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                  title="Rimuovi dai risultati"
                >
                  <Trash2 size={18} />
                </button>
                <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                  <ChevronRight size={20} />
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
};
