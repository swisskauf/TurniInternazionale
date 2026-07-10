import React from 'react';
import { motion } from 'motion/react';
import { Settings, X, Trash2, Users } from 'lucide-react';
import { CustomShiftCode, Employee } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enableHourTracking: boolean;
  setEnableHourTracking: (val: boolean) => void;
  viewMode: 'employees' | 'statistics';
  setViewMode: (mode: 'employees' | 'statistics') => void;
  hourlyWage: number;
  setHourlyWage: (val: number) => void;
  thirteenthAllowance: number;
  setThirteenthAllowance: (val: number) => void;
  vacationAllowance: number;
  setVacationAllowance: (val: number) => void;
  holidayAllowance: number;
  setHolidayAllowance: (val: number) => void;
  clothingAllocation: number;
  setClothingAllocation: (val: number) => void;
  avsDeduction: number;
  setAvsDeduction: (val: number) => void;
  unemploymentDeduction: number;
  setUnemploymentDeduction: (val: number) => void;
  dailySicknessDeduction: number;
  setDailySicknessDeduction: (val: number) => void;
  accidentDeduction: number;
  setAccidentDeduction: (val: number) => void;
  secondPillarDeduction: number;
  setSecondPillarDeduction: (val: number) => void;
  sourceTaxDeduction: number;
  setSourceTaxDeduction: (val: number) => void;
  coordinationDeduction: number;
  setCoordinationDeduction: (val: number) => void;
  maxClothingAllocation: number;
  setMaxClothingAllocation: (val: number) => void;
  sundaySupplement: number;
  setSundaySupplement: (val: number) => void;
  nightSupplement: number;
  setNightSupplement: (val: number) => void;
  targetEmployeeName: string;
  setTargetEmployeeName: (val: string) => void;
  payday: number;
  setPayday: (val: number) => void;
  customCodes: Record<string, CustomShiftCode>;
  setCustomCodes: (codes: Record<string, CustomShiftCode>) => void;
  setConfirmModal: (modal: any) => void;
  setGlobalHistory: (history: any) => void;
  setResult: (result: any) => void;
  setSelectedEmployee: (employee: Employee | null) => void;
}

interface SettingRowProps {
  label: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  step?: string;
  suffix?: string;
  inputWidth?: string;
}

const SettingRow = ({ label, value, onChange, placeholder = "", type = "number", step = "1", suffix = "", inputWidth = "w-20" }: SettingRowProps) => (
  <div className="flex items-center justify-between py-3.5 border-b border-slate-100/50 last:border-0 relative">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    <div className="flex items-center gap-1">
      <input 
        type={type} 
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        className={`text-right text-sm font-bold text-slate-900 bg-transparent outline-none placeholder:text-slate-300 ${inputWidth}`}
      />
      {suffix && <span className="text-sm font-bold text-slate-400 w-8">{suffix}</span>}
    </div>
  </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  enableHourTracking,
  setEnableHourTracking,
  viewMode,
  setViewMode,
  hourlyWage,
  setHourlyWage,
  thirteenthAllowance,
  setThirteenthAllowance,
  vacationAllowance,
  setVacationAllowance,
  holidayAllowance,
  setHolidayAllowance,
  clothingAllocation,
  setClothingAllocation,
  avsDeduction,
  setAvsDeduction,
  unemploymentDeduction,
  setUnemploymentDeduction,
  dailySicknessDeduction,
  setDailySicknessDeduction,
  accidentDeduction,
  setAccidentDeduction,
  secondPillarDeduction,
  setSecondPillarDeduction,
  sourceTaxDeduction,
  setSourceTaxDeduction,
  coordinationDeduction,
  setCoordinationDeduction,
  maxClothingAllocation,
  setMaxClothingAllocation,
  sundaySupplement,
  setSundaySupplement,
  nightSupplement,
  setNightSupplement,
  targetEmployeeName,
  setTargetEmployeeName,
  payday,
  setPayday,
  customCodes,
  setCustomCodes
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-end sm:items-center justify-center z-50 sm:p-4 pb-0">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 100 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-slate-50 w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh] sm:max-h-[85vh]"
      >
        <div className="px-4 py-3 sm:py-4 border-b border-slate-200/60 bg-white/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-10">
          <div className="w-8" />
          <h3 className="text-base font-bold text-slate-900">Impostazioni</h3>
          <button 
            onClick={onClose} 
            className="w-8 h-8 flex items-center justify-center text-slate-400 object-right bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="overflow-y-auto custom-scrollbar flex-1 pb-10">
          <div className="p-4 sm:p-6 flex flex-col gap-6">
            
            <section>
              <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 px-4">Generale</h4>
              <div className="bg-white rounded-2xl px-4 py-1 shadow-sm border border-slate-100">
                <SettingRow 
                  label="Dipendente" 
                  value={targetEmployeeName}
                  type="text"
                  inputWidth="w-32 sm:w-48"
                  placeholder="Mario Rossi"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setTargetEmployeeName(e.target.value);
                    localStorage.setItem('savedEmployeeName', e.target.value);
                  }}
                />
                <SettingRow 
                  label="Giorno di Paga" 
                  value={payday}
                  type="number"
                  inputWidth="w-12"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const val = parseInt(e.target.value, 10);
                    setPayday(val);
                    localStorage.setItem('payday', val.toString());
                  }}
                />
              </div>
            </section>

            <section>
              <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2 px-4">Calcolo Salario</h4>
              <div className="bg-white rounded-2xl px-4 py-1 shadow-sm border border-slate-100">
                <div className="flex items-center justify-between py-3.5 border-b border-slate-100/50 last:border-0 relative">
                  <span className="text-sm font-medium text-slate-700">Abilita calcolo</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={enableHourTracking} 
                      onChange={(e) => {
                        const val = e.target.checked;
                        setEnableHourTracking(val);
                        localStorage.setItem('enableHourTracking', JSON.stringify(val));
                        if (!val && viewMode === 'statistics') setViewMode('employees');
                      }} 
                    />
                    <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                {enableHourTracking && (
                  <SettingRow 
                    label="Paga Oraria base" 
                    value={hourlyWage}
                    step="0.05"
                    suffix="CHF"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const val = parseFloat(e.target.value);
                      setHourlyWage(val);
                      localStorage.setItem('hourlyWage', val.toString());
                    }}
                  />
                )}
              </div>
            </section>

            {enableHourTracking && (
              <>
                <section>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-emerald-500 mb-2 px-4">Indennità (+)</h4>
                  <div className="bg-white rounded-2xl px-4 py-1 shadow-sm border border-slate-100">
                    <SettingRow label="Tredicesima" value={thirteenthAllowance} step="0.001" suffix="%" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setThirteenthAllowance(v); localStorage.setItem('thirteenthAllowance', v.toString()); }} />
                    <SettingRow label="Ferie" value={vacationAllowance} step="0.01" suffix="%" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setVacationAllowance(v); localStorage.setItem('vacationAllowance', v.toString()); }} />
                    <SettingRow label="Giorni Festivi" value={holidayAllowance} step="0.01" suffix="%" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setHolidayAllowance(v); localStorage.setItem('holidayAllowance', v.toString()); }} />
                    <SettingRow label="Lavoro Domenicale" value={sundaySupplement} step="0.5" suffix="CHF/h" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setSundaySupplement(v); localStorage.setItem('sundaySupplement', v.toString()); }} />
                    <SettingRow label="Lavoro Notturno" value={nightSupplement} step="0.5" suffix="CHF/h" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setNightSupplement(v); localStorage.setItem('nightSupplement', v.toString()); }} />
                    <SettingRow label="Indennità Vestiario" value={clothingAllocation} step="0.01" suffix="CHF/h" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setClothingAllocation(v); localStorage.setItem('clothingAllocation', v.toString()); }} />
                    <SettingRow label="Ore Max Vestiario (mese)" value={maxClothingAllocation} step="1" suffix="ore" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setMaxClothingAllocation(v); localStorage.setItem('maxClothingAllocation', v.toString()); }} />
                  </div>
                </section>

                <section>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-red-500 mb-2 px-4">Deduzioni (-)</h4>
                  <div className="bg-white rounded-2xl px-4 py-1 shadow-sm border border-slate-100">
                    <SettingRow label="AVS/AI/IPG" value={avsDeduction} step="0.01" suffix="%" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setAvsDeduction(v); localStorage.setItem('avsDeduction', v.toString()); }} />
                    <SettingRow label="Disoccupazione" value={unemploymentDeduction} step="0.01" suffix="%" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setUnemploymentDeduction(v); localStorage.setItem('unemploymentDeduction', v.toString()); }} />
                    <SettingRow label="Malattia (IG)" value={dailySicknessDeduction} step="0.01" suffix="%" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setDailySicknessDeduction(v); localStorage.setItem('dailySicknessDeduction', v.toString()); }} />
                    <SettingRow label="Infortuni non prof." value={accidentDeduction} step="0.01" suffix="%" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setAccidentDeduction(v); localStorage.setItem('accidentDeduction', v.toString()); }} />
                    <SettingRow label="Deduzione Coordinamento (LPP mensile)" inputWidth="w-24" value={coordinationDeduction} step="1" suffix="CHF" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setCoordinationDeduction(v); localStorage.setItem('coordinationDeduction', v.toString()); }} />
                    <SettingRow label="LPP (2° Pilastro)" value={secondPillarDeduction} step="0.01" suffix="%" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setSecondPillarDeduction(v); localStorage.setItem('secondPillarDeduction', v.toString()); }} />
                    <SettingRow label="Imposta alla Fonte" value={sourceTaxDeduction} step="0.01" suffix="%" onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v=parseFloat(e.target.value); setSourceTaxDeduction(v); localStorage.setItem('sourceTaxDeduction', v.toString()); }} />
                  </div>
                </section>
              </>
            )}

          </div>
        </div>
      </motion.div>
    </div>
  );
};
