import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Printer, Info, CalendarPlus, ChevronRight, Calculator, Camera } from 'lucide-react';
import { EmployeeList } from './EmployeeList';
import { DashboardPanel } from './DashboardPanel';
import { CalendarPanel } from './CalendarPanel';
import { ShiftHistoryPanel } from './ShiftHistoryPanel';
import { SalaryCalculatorModal } from './modals/SalaryCalculatorModal';
import { Employee, ShiftPeriod, CustomShiftCode } from '../types';
import { SYSTEM_CODES } from '../constants';
import { ManageCodesModal } from './modals/ManageCodesModal';

interface ResultsPanelProps {
  result: { employees: Employee[] };
  viewMode: 'employees' | 'calendar';
  selectedEmployee: Employee | null;
  targetEmployeeName: string;
  handleSelectEmployee: (emp: Employee) => void;
  setConfirmModal: (modal: any) => void;
  setResult: (result: any) => void;
  setPrintModal: (modal: any) => void;
  customCodes: Record<string, CustomShiftCode>;
  setCustomCodes: React.Dispatch<React.SetStateAction<Record<string, CustomShiftCode>>>;
  todayStr: string;
  enableHourTracking: boolean;
  hourlyWage: number;
  thirteenthAllowance: number;
  vacationAllowance: number;
  holidayAllowance: number;
  clothingAllocation: number;
  avsDeduction: number;
  unemploymentDeduction: number;
  dailySicknessDeduction: number;
  accidentDeduction: number;
  secondPillarDeduction: number;
  sourceTaxDeduction: number;
  coordinationDeduction: number;
  maxClothingAllocation: number;
  sundaySupplement: number;
  nightSupplement: number;
  openEditShiftModal: (date: string, code: string) => void;
  setIsAddShiftModalOpen: (isOpen: boolean) => void;
  handleAddToCalendar: (dateStr: string, shifts: ShiftPeriod[], note?: string, code?: string) => void;
  currentDay: number;
  currentMonth: number;
  currentYear: number;
  payday: number;
  now: Date;
}

export const ResultsPanel = ({
  result,
  viewMode,
  selectedEmployee,
  targetEmployeeName,
  handleSelectEmployee,
  setConfirmModal,
  setResult,
  setPrintModal,
  customCodes,
  setCustomCodes,
  todayStr,
  enableHourTracking,
  hourlyWage,
  thirteenthAllowance,
  vacationAllowance,
  holidayAllowance,
  clothingAllocation,
  avsDeduction,
  unemploymentDeduction,
  dailySicknessDeduction,
  accidentDeduction,
  secondPillarDeduction,
  sourceTaxDeduction,
  coordinationDeduction,
  maxClothingAllocation,
  sundaySupplement,
  nightSupplement,
  openEditShiftModal,
  setIsAddShiftModalOpen,
  handleAddToCalendar,
  currentDay,
  currentMonth,
  currentYear,
  payday,
  now,
  onOpenScanner
}: ResultsPanelProps & { onOpenScanner: () => void }) => {
  const [isLegendaOpen, setIsLegendaOpen] = useState(false);
  const [isEarningsCalculatorOpen, setIsEarningsCalculatorOpen] = useState(false);
  const [employeeTab, setEmployeeTab] = useState<'calendar' | 'timeline'>('calendar');

  return (
    <div className="flex flex-col gap-4 animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {viewMode === 'employees' ? (
          <div className="p-4 flex-1 flex flex-col">
            <AnimatePresence mode="wait">
              {!selectedEmployee ? (
                <EmployeeList 
                  employees={result.employees}
                  targetEmployeeName={targetEmployeeName}
                  onSelectEmployee={handleSelectEmployee}
                  onRemoveEmployee={(emp) => {
                    setConfirmModal({
                      isOpen: true,
                      title: 'Rimuovi Risultato',
                      message: `Vuoi rimuovere ${emp.name} dai risultati correnti?`,
                      onConfirm: () => {
                        const newEmployees = result.employees.filter(e => e.name !== emp.name);
                        const newResult = { ...result, employees: newEmployees };
                        setResult(newResult);
                        localStorage.setItem('scheduleResult', JSON.stringify(newResult));
                      }
                    });
                  }}
                />
              ) : (
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex flex-col gap-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                      Dettaglio Turni 
                      <span className="text-indigo-600 border-l border-slate-300 ml-2 pl-2">{selectedEmployee.name}</span>
                    </h3>
                  </div>
                </div>
                
                <DashboardPanel
                  actionButtons={
                    <>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={onOpenScanner}
                        className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200/50 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-all cursor-pointer shadow-sm"
                        title="Scansiona Orario"
                      >
                        <Camera size={18} />
                        <span className="hidden sm:inline">Scansiona</span>
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsAddShiftModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all cursor-pointer shadow-sm shadow-emerald-100"
                      >
                        <CalendarPlus size={18} />
                        <span className="hidden xl:inline">Aggiungi</span>
                      </motion.button>
                      <motion.button 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          setPrintModal({ isOpen: true, startDate: today, endDate: today });
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-900 transition-all cursor-pointer shadow-sm shadow-slate-200"
                      >
                        <Printer size={18} />
                        <span className="hidden xl:inline">Stampa</span>
                      </motion.button>
                    </>
                  }
                  selectedEmployee={selectedEmployee}
                  currentDay={currentDay}
                  currentMonth={currentMonth}
                  currentYear={currentYear}
                  payday={payday}
                  customCodes={customCodes}
                  enableHourTracking={enableHourTracking}
                  hourlyWage={hourlyWage}
                  thirteenthAllowance={thirteenthAllowance}
                  vacationAllowance={vacationAllowance}
                  holidayAllowance={holidayAllowance}
                  clothingAllocation={clothingAllocation}
                  avsDeduction={avsDeduction}
                  unemploymentDeduction={unemploymentDeduction}
                  dailySicknessDeduction={dailySicknessDeduction}
                  accidentDeduction={accidentDeduction}
                  secondPillarDeduction={secondPillarDeduction}
                  sourceTaxDeduction={sourceTaxDeduction}
                  coordinationDeduction={coordinationDeduction}
                  maxClothingAllocation={maxClothingAllocation}
                  sundaySupplement={sundaySupplement}
                  nightSupplement={nightSupplement}
                  now={now}
                  todayStr={todayStr}
                />

                <div className="flex flex-col gap-4">
                  {employeeTab === 'calendar' ? (
                    <CalendarPanel
                      selectedEmployee={selectedEmployee}
                      customCodes={customCodes}
                      openEditShiftModal={openEditShiftModal}
                      enableHourTracking={enableHourTracking}
                      hourlyWage={hourlyWage}
                      thirteenthAllowance={thirteenthAllowance}
                      vacationAllowance={vacationAllowance}
                      holidayAllowance={holidayAllowance}
                      clothingAllocation={clothingAllocation}
                      avsDeduction={avsDeduction}
                      unemploymentDeduction={unemploymentDeduction}
                      dailySicknessDeduction={dailySicknessDeduction}
                      accidentDeduction={accidentDeduction}
                      secondPillarDeduction={secondPillarDeduction}
                      sourceTaxDeduction={sourceTaxDeduction}
                      coordinationDeduction={coordinationDeduction}
                      maxClothingAllocation={maxClothingAllocation}
                      sundaySupplement={sundaySupplement}
                      nightSupplement={nightSupplement}
                    />
                  ) : (
                    <ShiftHistoryPanel
                      selectedEmployee={selectedEmployee}
                      customCodes={customCodes}
                      todayStr={todayStr}
                      enableHourTracking={enableHourTracking}
                      hourlyWage={hourlyWage}
                      thirteenthAllowance={thirteenthAllowance}
                      vacationAllowance={vacationAllowance}
                      holidayAllowance={holidayAllowance}
                      clothingAllocation={clothingAllocation}
                      avsDeduction={avsDeduction}
                      unemploymentDeduction={unemploymentDeduction}
                      dailySicknessDeduction={dailySicknessDeduction}
                      accidentDeduction={accidentDeduction}
                      secondPillarDeduction={secondPillarDeduction}
                      sourceTaxDeduction={sourceTaxDeduction}
                      coordinationDeduction={coordinationDeduction}
                      maxClothingAllocation={maxClothingAllocation}
                      sundaySupplement={sundaySupplement}
                      nightSupplement={nightSupplement}
                      openEditShiftModal={openEditShiftModal}
                      handleAddToCalendar={handleAddToCalendar}
                    />
                  )}
                  
                  <div className="flex bg-slate-100 p-1 rounded-xl mx-auto w-full max-w-sm mt-2">
                    <button
                      onClick={() => setEmployeeTab('calendar')}
                      className={`flex-1 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                        employeeTab === 'calendar' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Calendario Mese
                    </button>
                    <button
                      onClick={() => setEmployeeTab('timeline')}
                      className={`flex-1 py-1.5 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
                        employeeTab === 'timeline' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Timeline Storico
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        ) : viewMode === 'calendar' ? (
          <div className="p-4 flex-1 flex flex-col">
            {selectedEmployee && (
              <CalendarPanel
                selectedEmployee={selectedEmployee}
                customCodes={customCodes}
                openEditShiftModal={openEditShiftModal}
                enableHourTracking={enableHourTracking}
                hourlyWage={hourlyWage}
                thirteenthAllowance={thirteenthAllowance}
                vacationAllowance={vacationAllowance}
                holidayAllowance={holidayAllowance}
                clothingAllocation={clothingAllocation}
                avsDeduction={avsDeduction}
                unemploymentDeduction={unemploymentDeduction}
                dailySicknessDeduction={dailySicknessDeduction}
                accidentDeduction={accidentDeduction}
                secondPillarDeduction={secondPillarDeduction}
                sourceTaxDeduction={sourceTaxDeduction}
                sundaySupplement={sundaySupplement}
                nightSupplement={nightSupplement}
              />
            )}
          </div>
        ) : null}
      </div>

      {selectedEmployee && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button 
            onClick={() => setIsLegendaOpen(true)}
            className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm hover:border-indigo-200 hover:bg-slate-50 transition-colors w-full"
          >
            <div className="flex items-center gap-3 text-slate-800">
              <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                <Info size={16} />
              </div>
              <h4 className="text-xs font-black uppercase tracking-widest">Codici Turno</h4>
            </div>
            <ChevronRight size={18} className="text-slate-400 opacity-50" />
          </button>

          {enableHourTracking && (
            <button 
              onClick={() => setIsEarningsCalculatorOpen(true)}
              className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between shadow-sm hover:border-emerald-200 hover:bg-emerald-50 transition-colors w-full"
            >
              <div className="flex items-center gap-3 text-slate-800">
                <div className="bg-emerald-50 p-2 rounded-lg text-emerald-600">
                  <Calculator size={16} />
                </div>
                <h4 className="text-xs font-black uppercase tracking-widest">Calcola Guadagni</h4>
              </div>
              <ChevronRight size={18} className="text-slate-400 opacity-50" />
            </button>
          )}
        </div>
      )}
      
      <ManageCodesModal 
        isOpen={isLegendaOpen} 
        onClose={() => setIsLegendaOpen(false)}
        customCodes={customCodes}
        setCustomCodes={setCustomCodes}
      />

      {selectedEmployee && enableHourTracking && (
        <SalaryCalculatorModal
          isOpen={isEarningsCalculatorOpen}
          onClose={() => setIsEarningsCalculatorOpen(false)}
          selectedEmployee={selectedEmployee}
          customCodes={customCodes}
          hourlyWage={hourlyWage}
          thirteenthAllowance={thirteenthAllowance}
          vacationAllowance={vacationAllowance}
          holidayAllowance={holidayAllowance}
          clothingAllocation={clothingAllocation}
          avsDeduction={avsDeduction}
          unemploymentDeduction={unemploymentDeduction}
          dailySicknessDeduction={dailySicknessDeduction}
          accidentDeduction={accidentDeduction}
          secondPillarDeduction={secondPillarDeduction}
          sourceTaxDeduction={sourceTaxDeduction}
          coordinationDeduction={coordinationDeduction}
          maxClothingAllocation={maxClothingAllocation}
          sundaySupplement={sundaySupplement}
          nightSupplement={nightSupplement}
        />
      )}
    </div>
  );
};
