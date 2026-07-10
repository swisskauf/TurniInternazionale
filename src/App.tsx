import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';

import { 
  ScheduleEntry, 
  ShiftPeriod, 
  InterpretedShift, 
  CustomShiftCode, 
  Employee, 
  ScheduleData,
  EditingShift
} from './types';
import { SYSTEM_CODES } from './constants';
import { interpretShift, calculateShiftHours, calculateBreakHours, getHours } from './utils/shiftUtils';
import { getWeekNumber, formatCardDate } from './utils/dateUtils';
import { preprocessImage } from './utils/imageUtils';
import { Header } from './components/Header';
import { UploadModal } from './components/modals/UploadModal';
import { ConfirmModal } from './components/modals/ConfirmModal';
import { PrintModal } from './components/modals/PrintModal';
import { PreviewPanel } from './components/PreviewPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { SettingsModal } from './components/modals/SettingsModal';
import { CustomCodeModal } from './components/modals/CustomCodeModal';
import { EditShiftModal } from './components/modals/EditShiftModal';
import { AddShiftModal } from './components/modals/AddShiftModal';

export default function App() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ScheduleData | null>(null);
  const [resultHistory, setResultHistory] = useState<ScheduleData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'employees' | 'calendar'>('employees');
  const [historyYear, setHistoryYear] = useState(new Date().getFullYear());
  const [historyMonth, setHistoryMonth] = useState(new Date().getMonth() + 1);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isAddShiftModalOpen, setIsAddShiftModalOpen] = useState(false);
  const [hourlyWage, setHourlyWage] = useState<number>(19.75);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hourlyWage');
      if (saved) setHourlyWage(parseFloat(saved));
    } catch (e) {
      console.error("Failed to parse hourlyWage, resetting.", e);
      localStorage.removeItem('hourlyWage');
    }
  }, []);
  const [payday, setPayday] = useState<number>(6);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('payday');
      if (saved) setPayday(parseInt(saved, 10));
    } catch (e) {
      console.error("Failed to parse payday, resetting.", e);
      localStorage.removeItem('payday');
    }
  }, []);
  
  const [thirteenthAllowance, setThirteenthAllowance] = useState<number>(8.33);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('thirteenthAllowance');
      if (saved) setThirteenthAllowance(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [vacationAllowance, setVacationAllowance] = useState<number>(10.65);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vacationAllowance');
      if (saved) setVacationAllowance(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [holidayAllowance, setHolidayAllowance] = useState<number>(2.27);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('holidayAllowance');
      if (saved) setHolidayAllowance(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [clothingAllocation, setClothingAllocation] = useState<number>(0.25);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('clothingAllocation');
      if (saved) setClothingAllocation(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [avsDeduction, setAvsDeduction] = useState<number>(5.300);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('avsDeduction');
      if (saved) setAvsDeduction(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [unemploymentDeduction, setUnemploymentDeduction] = useState<number>(1.100);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('unemploymentDeduction');
      if (saved) setUnemploymentDeduction(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [dailySicknessDeduction, setDailySicknessDeduction] = useState<number>(1.445);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('dailySicknessDeduction');
      if (saved) setDailySicknessDeduction(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [accidentDeduction, setAccidentDeduction] = useState<number>(1.672);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('accidentDeduction');
      if (saved) setAccidentDeduction(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [secondPillarDeduction, setSecondPillarDeduction] = useState<number>(1.000);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('secondPillarDeduction');
      if (saved) setSecondPillarDeduction(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [sourceTaxDeduction, setSourceTaxDeduction] = useState<number>(3.000);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sourceTaxDeduction');
      if (saved) setSourceTaxDeduction(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [sundaySupplement, setSundaySupplement] = useState<number>(25);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sundaySupplement');
      if (saved) setSundaySupplement(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [nightSupplement, setNightSupplement] = useState<number>(10);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nightSupplement');
      if (saved) setNightSupplement(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [now, setNow] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);

  const [coordinationDeduction, setCoordinationDeduction] = useState<number>(2205);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('coordinationDeduction');
      if (saved) setCoordinationDeduction(parseFloat(saved));
    } catch (e) {}
  }, []);

  const [maxClothingAllocation, setMaxClothingAllocation] = useState<number>(154.5);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('maxClothingAllocation');
      if (saved) {
        let val = parseFloat(saved);
        if (val === 50) {
          val = 154.5;
          localStorage.setItem('maxClothingAllocation', val.toString());
        }
        setMaxClothingAllocation(val);
      }
    } catch (e) {}
  }, []);

  const [customCodes, setCustomCodes] = useState<Record<string, CustomShiftCode>>(() => {
    try {
      const saved = localStorage.getItem('customShiftCodes');
      const parsed = saved ? JSON.parse(saved) : {};
      const merged = { ...parsed };
      for (const [key, val] of Object.entries(SYSTEM_CODES)) {
        if (!merged[key]) {
          merged[key] = { code: key, status: val.status as 'Work' | 'Day off' | 'Vacation', shifts: val.shifts || [] };
        }
      }
      return merged;
    } catch (e) {
      console.error("Failed to parse customShiftCodes", e);
      const defaults: Record<string, CustomShiftCode> = {};
      for (const [key, val] of Object.entries(SYSTEM_CODES)) {
        defaults[key] = { code: key, status: val.status as 'Work' | 'Day off' | 'Vacation', shifts: val.shifts || [] };
      }
      return defaults;
    }
  });

  useEffect(() => {
    localStorage.setItem('customShiftCodes', JSON.stringify(customCodes));
  }, [customCodes]);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [enableHourTracking, setEnableHourTracking] = useState<boolean>(true);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('enableHourTracking');
      if (saved) setEnableHourTracking(JSON.parse(saved));
    } catch (e) {
      console.error("Failed to parse enableHourTracking, resetting.", e);
      localStorage.removeItem('enableHourTracking');
    }
  }, []);

  const [customStart1, setCustomStart1] = useState('');
  const [customEnd1, setCustomEnd1] = useState('');
  const [customStart2, setCustomStart2] = useState('');
  const [customEnd2, setCustomEnd2] = useState('');
  const [customIsDayOff, setCustomIsDayOff] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [targetEmployeeName, setTargetEmployeeName] = useState<string>('');
  useEffect(() => {
    const saved = localStorage.getItem('savedEmployeeName');
    if (saved) setTargetEmployeeName(saved);
  }, []);

  // Reset via URL: ?reset=true
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'true') {
      console.warn("Resetting all data via URL parameter.");
      localStorage.clear();
      window.location.href = window.location.pathname; // Reload without params
    }
  }, []);

  // Helper per validare i dati (esempio per globalHistory)
  const validateGlobalHistory = (data: any) => {
    if (typeof data !== 'object' || data === null) return false;
    // Aggiungi qui controlli più specifici se necessario
    return true;
  };

  const [globalHistory, setGlobalHistory] = useState<Record<string, Record<string, { code: string, isManuallyModified?: boolean, isAdded?: boolean, isUpdated?: boolean, note?: string }>>>({});
  useEffect(() => {
    try {
      const saved = localStorage.getItem('globalHistory');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (validateGlobalHistory(parsed)) {
          const migrated: Record<string, Record<string, { code: string, isManuallyModified?: boolean }>> = {};
          Object.entries(parsed).forEach(([emp, dates]) => {
            migrated[emp] = {};
            Object.entries(dates as Record<string, any>).forEach(([date, val]) => {
              if (typeof val === 'string') {
                migrated[emp][date] = { code: val, isManuallyModified: false };
              } else {
                migrated[emp][date] = val;
              }
            });
          });
          setGlobalHistory(migrated);
        } else {
          throw new Error("Invalid format");
        }
      }
    } catch (e) {
      console.error("Failed to parse globalHistory, resetting.", e);
      localStorage.removeItem('globalHistory');
    }
  }, []);

  // ... (rest of the component logic)
  
  const [editingShift, setEditingShift] = useState<EditingShift | null>(null);
  const [isImprovingNote, setIsImprovingNote] = useState(false);
  const [newShiftCode, setNewShiftCode] = useState('');
  const [manualPeriods, setManualPeriods] = useState<ShiftPeriod[]>([{ start: '', end: '' }]);
  const [printModal, setPrintModal] = useState<{ isOpen: boolean, startDate: string, endDate: string } | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [historyViewType, setHistoryViewType] = useState<'monthly' | 'yearly'>('monthly');
  
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDay = now.getDate();
  const todayStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(currentDay).padStart(2,'0')}`;
  const handleSaveCustomCode = () => {
    if (!editingCode) return;
    const normalizedCode = editingCode.trim().toUpperCase();
    let newCode: CustomShiftCode;
    
    if (customIsDayOff) {
      newCode = { code: normalizedCode, shifts: [], status: 'Day off' };
    } else {
      const shifts: ShiftPeriod[] = [];
      if (customStart1 && customEnd1) shifts.push({ start: customStart1, end: customEnd1 });
      if (customStart2 && customEnd2) shifts.push({ start: customStart2, end: customEnd2 });
      newCode = { code: normalizedCode, shifts, status: 'Work' };
    }
    
    const updatedCodes = { ...customCodes, [normalizedCode]: newCode };
    setCustomCodes(updatedCodes);
    localStorage.setItem('customShiftCodes', JSON.stringify(updatedCodes));
    setEditingCode(null);
    setCustomStart1('');
    setCustomEnd1('');
    setCustomStart2('');
    setCustomEnd2('');
    setCustomIsDayOff(false);
  };

  const setAndSaveResult = (newResult: ScheduleData | null, pushToHistory = true) => {
    if (pushToHistory && result) {
      setResultHistory(prev => [...prev, result]);
    }
    setResult(newResult);
    if (newResult) {
      localStorage.setItem('scheduleResult', JSON.stringify(newResult));
    } else {
      localStorage.removeItem('scheduleResult');
    }
  };

  const handleUndo = () => {
    if (resultHistory.length > 0) {
      const prevResult = resultHistory[resultHistory.length - 1];
      setResultHistory(prev => prev.slice(0, -1));
      setAndSaveResult(prevResult, false);
      if (selectedEmployee) {
        const emp = prevResult?.employees.find(e => e.name === selectedEmployee.name);
        if (emp) setSelectedEmployee(emp);
        else setSelectedEmployee(null);
      }
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const savedResult = localStorage.getItem('scheduleResult');
    const savedName = localStorage.getItem('savedEmployeeName');
    
    if (savedResult) {
      try {
        const parsed = JSON.parse(savedResult);
        setResult(parsed);
        if (savedName) {
          const found = parsed.employees.find((e: Employee) => e.name === savedName);
          if (found) {
            // Merge with global history
            const history = globalHistory[found.name] || {};
            const mergedSchedule = [...found.schedule];
            
            Object.entries(history).forEach(([date, data]) => {
              const historyData = data as { code: string, isManuallyModified?: boolean, isAdded?: boolean, isUpdated?: boolean, note?: string };
              const existing = mergedSchedule.find(s => s.date === date);
              if (existing) {
                existing.code = historyData.code;
                existing.isManuallyModified = historyData.isManuallyModified;
                existing.isAdded = historyData.isAdded;
                existing.isUpdated = historyData.isUpdated;
                existing.note = historyData.note;
              } else {
                mergedSchedule.push({ 
                  date, 
                  code: historyData.code, 
                  isManuallyModified: historyData.isManuallyModified,
                  isAdded: historyData.isAdded,
                  isUpdated: historyData.isUpdated,
                  note: historyData.note
                });
              }
            });
            
            const fullEmp = { ...found, schedule: mergedSchedule.sort((a, b) => b.date.localeCompare(a.date)) };
            setSelectedEmployee(fullEmp);
          }
        }
      } catch (e) {
        console.error("Failed to parse saved schedule", e);
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const preprocessImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Fallback if canvas fails
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(file);
          return;
        }
        
        // Max dimension to prevent huge memory usage while keeping high res for OCR
        const MAX_DIM = 2048;
        let width = img.width;
        let height = img.height;
        
        if (width > height && width > MAX_DIM) {
          height *= MAX_DIM / width;
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width *= MAX_DIM / height;
          height = MAX_DIM;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw original
        ctx.drawImage(img, 0, 0, width, height);
        
        // Apply contrast and grayscale filter to reduce noise and highlight lines
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        const contrast = 1.4; // Increase contrast by 40%
        const intercept = 128 * (1 - contrast);
        
        for (let i = 0; i < data.length; i += 4) {
          // Convert to grayscale for better text recognition
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          
          // Apply contrast
          let newVal = avg * contrast + intercept;
          newVal = Math.max(0, Math.min(255, newVal));
          
          data[i] = newVal;     // R
          data[i + 1] = newVal; // G
          data[i + 2] = newVal; // B
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Return base64
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        resolve(dataUrl.split(',')[1]);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const processImage = async () => {
    if (!imageFile) return;
    
    if (!process.env.GEMINI_API_KEY) {
      setError("Chiave API mancante. Per favore aggiungi GEMINI_API_KEY nei segreti (Secrets) di AI Studio.");
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Preprocess image (contrast, noise reduction, grayscale)
      const base64Data = await preprocessImage(imageFile);

      const timeToCodeMapping = JSON.stringify(
        Object.entries(customCodes)
          .filter(([_, v]: [string, CustomShiftCode]) => !v.deleted)
          .map(([k, v]: [string, CustomShiftCode]) => ({
          code: k,
          shifts: v.shifts
        }))
      );

      const promptText = `Analyze this work schedule table. First, internally process the image: 1. Detect the edges of the paper. 2. Correct the perspective if the image is tilted. 3. Enhance contrast and reduce noise. 4. Highlight the table lines to perfectly align rows and columns. Next, scan the entire document (especially the top) to identify the **Month and Year** of the schedule (e.g., 'aprile 2026', 'April 2026'). Then, look at the table headers. They often contain two rows: days of the week (e.g., lu, ma, me, gi, ve, sa, do) and day numbers (e.g., 01, 02, 03). Combine the day number from the column header with the detected Month and Year to generate a complete date in **YYYY-MM-DD** format (e.g., '2026-04-15'). 
      
      ${targetEmployeeName ? `IMPORTANT: Focus ONLY on the employee named "${targetEmployeeName}".` : "Extract the employee names from the first column, and the work codes (like P1, P2, MP1, R+P1, AN, GR, GV, ecc) from the intersecting cells."}
      
      CRITICAL RULE: Scan every single cell carefully. In some cases, the cell might contain the exact shift times (e.g., '08:00 - 12:00 / 12:30 - 17:18') instead of a code. If you find shift times, match them to the correct code using this JSON mapping: ${timeToCodeMapping}. If you cannot find a matching code for the shift times, try to output the closest code or output the time directly for now.
      
      If a cell contains handwritten text over or near the printed code, the handwritten text ALWAYS takes priority (e.g., if 'P1' is printed but 'GR' is written by hand on top, output 'GR'). ALSO DETECT ICONS/SYMBOLS: If you see a palm tree icon/drawing, output '🌴'. If you see a check mark, output '✅'. If you see any other unrecognized icon or drawing, output 'UNKNOWN_ICON: <description>'. If a cell is empty, omit it or use an empty string.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg'
            }
          },
          {
            text: promptText
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              employees: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Employee full name" },
                    schedule: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          date: { type: Type.STRING, description: "Complete date in YYYY-MM-DD format (e.g., '2026-04-15'). You MUST combine the day number from the column header with the month and year found elsewhere on the page." },
                          code: { type: Type.STRING, description: "Work code, e.g., P1, MP1, R+P1, AN, GR, GV, MP. If handwritten text overrides printed text, output the handwritten text." }
                        },
                        required: ["date", "code"]
                      }
                    }
                  },
                  required: ["name", "schedule"]
                }
              }
            },
            required: ["employees"]
          }
        }
      });

      if (response.text) {
        try {
          const data = JSON.parse(response.text) as ScheduleData;
          
          data.employees.forEach(emp => {
            if (emp.schedule.length === 0) return;
            emp.schedule.sort((a, b) => a.date.localeCompare(b.date));
            const minDateStr = emp.schedule[0].date;
            const maxDateStr = emp.schedule[emp.schedule.length - 1].date;
            
            const [minY, minM, minD] = minDateStr.split('-').map(Number);
            const startD = new Date(minY, minM - 1, minD);
            
            const [maxY, maxM, maxD] = maxDateStr.split('-').map(Number);
            const endD = new Date(maxY, maxM - 1, maxD);
            
            const filled = [];
            const curr = new Date(startD);
            while (curr <= endD) {
              const dStr = curr.getFullYear() + '-' + String(curr.getMonth() + 1).padStart(2, '0') + '-' + String(curr.getDate()).padStart(2, '0');
              const found = emp.schedule.find(s => s.date === dStr);
              if (found) {
                filled.push(found);
              } else {
                filled.push({ date: dStr, code: 'GR' });
              }
              curr.setDate(curr.getDate() + 1);
            }
            emp.schedule = filled;
          });

          let finalData = data;
          
          if (result) {
            const mergedResult = { ...result };
            
            data.employees.forEach(newEmp => {
              const existingEmpIndex = mergedResult.employees.findIndex(e => e.name === newEmp.name);
              
              if (existingEmpIndex !== -1) {
                const existingEmp = mergedResult.employees[existingEmpIndex];
                
                if (newEmp.schedule.length > 0) {
                  const newMinStr = newEmp.schedule[0].date;
                  const newMaxStr = newEmp.schedule[newEmp.schedule.length - 1].date;
                  
                  // Filter out future days in salire past the new document's end date
                  const mergedSchedule = existingEmp.schedule.filter(s => s.date <= newMaxStr);
                  
                  newEmp.schedule.forEach(newShift => {
                    const existingShiftIndex = mergedSchedule.findIndex(s => s.date === newShift.date);
                    
                    if (existingShiftIndex !== -1) {
                      const existingShift = mergedSchedule[existingShiftIndex];
                      
                      // Preserve manual modifications and additions
                      if (existingShift.isManuallyModified || existingShift.isAdded) {
                        return; // Skip overwriting this shift
                      }
                      
                      if (existingShift.code !== newShift.code) {
                        mergedSchedule[existingShiftIndex] = {
                          ...existingShift,
                          code: newShift.code,
                          isUpdated: true,
                          isManuallyModified: false,
                          isAdded: false
                        };
                      } else {
                        // If the code matches the new scan, clear any manual/added/updated flags
                        mergedSchedule[existingShiftIndex] = {
                          ...existingShift,
                          isManuallyModified: false,
                          isAdded: false,
                          isUpdated: false
                        };
                      }
                    } else {
                      mergedSchedule.push({
                        ...newShift,
                        isAdded: true
                      });
                    }
                  });
                  
                  mergedSchedule.sort((a, b) => a.date.localeCompare(b.date));
                  
                  mergedResult.employees[existingEmpIndex] = {
                    ...existingEmp,
                    schedule: mergedSchedule
                  };
                }
              } else {
                mergedResult.employees.push(newEmp);
              }
            });
            
            finalData = mergedResult;
          }
          
          setAndSaveResult(finalData);
          
          // Merge into global history
          const newHistory = { ...globalHistory };
          finalData.employees.forEach(emp => {
            if (!newHistory[emp.name]) newHistory[emp.name] = {};
            emp.schedule.forEach(entry => {
              const hasFlags = entry.isUpdated || entry.isAdded || entry.isManuallyModified || entry.note;
              if (hasFlags) {
                newHistory[emp.name][entry.date] = { 
                  code: entry.code, 
                  isManuallyModified: entry.isManuallyModified || false,
                  isAdded: entry.isAdded || false,
                  isUpdated: entry.isUpdated || false,
                  note: entry.note
                };
              } else if (newHistory[emp.name][entry.date]) {
                delete newHistory[emp.name][entry.date];
              }
            });
          });
          setGlobalHistory(newHistory);
          try {
            localStorage.setItem('globalHistory', JSON.stringify(newHistory));
          } catch (e) {
            console.error("Failed to save globalHistory to localStorage, possibly quota exceeded.", e);
          }
          
          setImagePreview(null);
          setImageFile(null);
          
          const savedName = localStorage.getItem('savedEmployeeName');
          if (savedName) {
            const found = finalData.employees.find(e => e.name === savedName);
            if (found) {
              // Merge scan results with global history for this employee immediately
              const history = newHistory[found.name] || {};
              const mergedSchedule = [...found.schedule];
              
              Object.entries(history).forEach(([date, histData]) => {
                const historyData = histData as { code: string, isManuallyModified?: boolean, isAdded?: boolean, isUpdated?: boolean, note?: string };
                const existing = mergedSchedule.find(s => s.date === date);
                if (existing) {
                  existing.code = historyData.code;
                  existing.isManuallyModified = historyData.isManuallyModified;
                  existing.isAdded = historyData.isAdded;
                  existing.isUpdated = historyData.isUpdated;
                  existing.note = historyData.note;
                } else {
                  mergedSchedule.push({ 
                    date, 
                    code: historyData.code, 
                    isManuallyModified: historyData.isManuallyModified,
                    isAdded: historyData.isAdded,
                    isUpdated: historyData.isUpdated,
                    note: historyData.note
                  });
                }
              });
              
              const fullEmp = { ...found, schedule: mergedSchedule.sort((a, b) => b.date.localeCompare(a.date)) };
              setSelectedEmployee(fullEmp);
              setViewMode('employees');
            }
          }
        } catch (parseErr) {
          console.error("Errore durante il parsing del JSON:", parseErr, "Response text:", response.text);
          throw new Error("Il modello ha restituito un formato non valido. Riprova.");
        }
      } else {
        throw new Error("Nessun dato restituito dal modello.");
      }
      
    } catch (err) {
      console.error("Errore durante l'elaborazione dell'immagine:", err);
      setError(err instanceof Error ? err.message : "Si è verificato un errore sconosciuto durante l'elaborazione dell'immagine.");
    } finally {
      setIsProcessing(false);
    }
  };

  const startNewScan = () => {
    setImageFile(null);
    setImagePreview(null);
    setError(null);
  };

  const handleSelectEmployee = (emp: Employee) => {
    // Merge scan results with global history for this employee
    const history = globalHistory[emp.name] || {};
    const mergedSchedule = [...emp.schedule];
    
    // Ensure all history dates are included
    Object.entries(history).forEach(([date, entry]) => {
      const entryObj = entry as { code: string, isManuallyModified?: boolean, isAdded?: boolean, isUpdated?: boolean, note?: string };
      const existingIndex = mergedSchedule.findIndex(s => s.date === date);
      if (existingIndex !== -1) {
        mergedSchedule[existingIndex] = { 
          ...mergedSchedule[existingIndex], 
          code: entryObj.code, 
          isManuallyModified: entryObj.isManuallyModified,
          isAdded: entryObj.isAdded,
          isUpdated: entryObj.isUpdated,
          note: entryObj.note
        };
      } else {
        mergedSchedule.push({ 
          date, 
          code: entryObj.code, 
          isManuallyModified: entryObj.isManuallyModified,
          isAdded: entryObj.isAdded,
          isUpdated: entryObj.isUpdated,
          note: entryObj.note
        });
      }
    });
    
    const fullEmp = { ...emp, schedule: mergedSchedule.sort((a, b) => b.date.localeCompare(a.date)) };
    setSelectedEmployee(fullEmp);
    localStorage.setItem('savedEmployeeName', emp.name);
  };



  const improveTechnicalText = async (text: string): Promise<string> => {
    if (!text.trim()) return text;
    if (!process.env.GEMINI_API_KEY) {
      setError("Chiave API mancante.");
      return text;
    }
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Sei un assistente tecnico per la manutenzione.
Il tuo compito è migliorare leggermente il testo fornito, senza cambiarne il significato.

Regole obbligatorie:
- NON aggiungere informazioni che non sono presenti
- NON inventare dettagli
- NON usare linguaggio troppo formale
- NON allungare il testo inutilmente
- Mantieni lo stile tecnico e semplice
- Correggi solo grammatica e chiarezza
- Se il testo è già chiaro, restituiscilo quasi identico

Output richiesto (JSON):
{
  "testo_migliorato": "..."
}

Testo input:
"${text}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{ text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              testo_migliorato: { type: Type.STRING }
            },
            required: ["testo_migliorato"]
          }
        }
      });

      if (response.text) {
        const data = JSON.parse(response.text);
        return data.testo_migliorato;
      }
      return text;
    } catch (err) {
      console.error(err);
      return text;
    }
  };

  const handleImproveNote = async () => {
    if (!editingShift || !editingShift.note) return;
    setIsImprovingNote(true);
    const improved = await improveTechnicalText(editingShift.note);
    setEditingShift({ ...editingShift, note: improved, isManuallyModified: true });
    setIsImprovingNote(false);
  };

  const openEditShiftModal = (date: string, code: string) => {
    if (!selectedEmployee) return;
    const entry = selectedEmployee.schedule.find(s => s.date === date);
    setEditingShift({ 
      employeeName: selectedEmployee.name, 
      date, 
      code, 
      isManuallyModified: entry?.isManuallyModified,
      isAdded: entry?.isAdded,
      isUpdated: entry?.isUpdated,
      note: entry?.note || '',
      manualShifts: entry?.manualShifts
    });
    setNewShiftCode(code);
    
    const interpreted = interpretShift(date, code, customCodes, entry?.manualShifts);
    if (interpreted.status === 'Work' && interpreted.shifts.length > 0) {
      setManualPeriods(interpreted.shifts.map(s => ({ ...s })));
    } else {
      setManualPeriods([{ start: '', end: '' }]);
    }
  };

  const handleUpdateShiftCode = () => {
    if (!editingShift || !selectedEmployee) return;
    
    const { date, note } = editingShift;
    let code = newShiftCode.trim().toUpperCase();
    
    const validPeriods = manualPeriods.filter(p => p.start && p.end);
    let isModified = editingShift.isManuallyModified || false;
    let finalManualShifts: ShiftPeriod[] | undefined = undefined;

    if (isModified) {
      if (validPeriods.length > 0) {
        finalManualShifts = validPeriods;
      }
      if (code === '' && finalManualShifts) {
        code = 'MODIFICATO';
      }
    }

    // Determine if it's a new entry (not in original schedule)
    const wasInOriginal = result?.employees
      .find(e => e.name === selectedEmployee.name)
      ?.schedule.some(s => s.date === date);
    
    const isAdded = editingShift.isAdded !== undefined ? editingShift.isAdded : !wasInOriginal;
    
    // Always clear isUpdated when manually saving via modal, so that the isManuallyModified switch takes full control of the visual state
    let isUpdated = false;
    
    // Update global history
    const newHistory = { ...globalHistory };
    const empHistory = newHistory[selectedEmployee.name] ? { ...newHistory[selectedEmployee.name] } : {};
    newHistory[selectedEmployee.name] = empHistory;
    
    if (code === '' && !note && !isModified && !isAdded && !finalManualShifts) {
      delete empHistory[date];
    } else {
      empHistory[date] = { code, isManuallyModified: isModified, isAdded, isUpdated, note, manualShifts: finalManualShifts };
    }
    
    setGlobalHistory(newHistory);
    localStorage.setItem('globalHistory', JSON.stringify(newHistory));
    
    // Update current view
    const updatedSchedule = selectedEmployee.schedule.map(s => {
      if (s.date === date) {
        return { ...s, code, isManuallyModified: isModified, isAdded, isUpdated, note, manualShifts: finalManualShifts };
      }
      return s;
    });
    
    setSelectedEmployee({ ...selectedEmployee, schedule: updatedSchedule });
    
    // Update main result state to keep everything in sync
    if (result) {
      const newResult = { ...result };
      const empIdx = newResult.employees.findIndex(e => e.name === selectedEmployee.name);
      if (empIdx >= 0) {
        newResult.employees[empIdx] = { 
          ...newResult.employees[empIdx], 
          schedule: newResult.employees[empIdx].schedule.map(s => {
            if (s.date === date) {
              return { ...s, code, isManuallyModified: isModified, isAdded, isUpdated, note, manualShifts: finalManualShifts };
            }
            return s;
          })
        };
        setAndSaveResult(newResult);
        setSelectedEmployee(newResult.employees[empIdx]);
      }
    }
    
    setEditingShift(null);
    setNewShiftCode('');
    setManualPeriods([{ start: '', end: '' }]);
  };

  const handleAddShift = (date: string, code: string) => {
    if (!selectedEmployee) return;

    const normalizedCode = code.trim().toUpperCase();

    // Update global history
    const newHistory = { ...globalHistory };
    const empHistory = newHistory[selectedEmployee.name] ? { ...newHistory[selectedEmployee.name] } : {};
    newHistory[selectedEmployee.name] = empHistory;

    // Behave like scanned: no flags
    empHistory[date] = { code: normalizedCode, isManuallyModified: false, isAdded: false, isUpdated: false };

    setGlobalHistory(newHistory);
    localStorage.setItem('globalHistory', JSON.stringify(newHistory));

    // Update current view
    const mergedSchedule = [...selectedEmployee.schedule];
    const existingIndex = mergedSchedule.findIndex(s => s.date === date);
    if (existingIndex !== -1) {
      mergedSchedule[existingIndex] = { ...mergedSchedule[existingIndex], code: normalizedCode, isManuallyModified: false, isAdded: false, isUpdated: false };
    } else {
      mergedSchedule.push({ date, code: normalizedCode, isManuallyModified: false, isAdded: false, isUpdated: false });
    }
    mergedSchedule.sort((a, b) => a.date.localeCompare(b.date));

    setSelectedEmployee({ ...selectedEmployee, schedule: mergedSchedule });

    // Update main result state
    if (result) {
      const newResult = { ...result };
      const empIdx = newResult.employees.findIndex(e => e.name === selectedEmployee.name);
      if (empIdx >= 0) {
        newResult.employees[empIdx] = { ...newResult.employees[empIdx], schedule: mergedSchedule };
        setAndSaveResult(newResult);
        setSelectedEmployee(newResult.employees[empIdx]);
      }
    }
  };

  const handleAddToCalendar = (dateStr: string, shifts: ShiftPeriod[], note?: string, code?: string) => {
    if (shifts.length === 0) return;
    
    // Format date for ICS: YYYYMMDD
    const formattedDate = dateStr.replace(/-/g, '');
    
    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ScattaTurni//EN\r\n";
    
    const firstShift = shifts[0];
    const lastShift = shifts[shifts.length - 1];
    
    let endHrMin = lastShift.end;
    let crossMidnight = false;
    
    if (endHrMin < firstShift.start && endHrMin !== '24:00') {
      crossMidnight = true;
    } else if (endHrMin === '24:00' || endHrMin === '00:00') {
      crossMidnight = true;
      endHrMin = '00:00';
    }

    const startTime = firstShift.start.replace(':', '') + '00';
    const endTime = endHrMin.replace(':', '') + '00';

    let endDateStr = formattedDate;
    if (crossMidnight) {
      const dateObj = new Date(dateStr);
      dateObj.setDate(dateObj.getDate() + 1);
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      endDateStr = `${dateObj.getFullYear()}${m}${d}`;
    }

    const summary = code ? code : 'Turno di Lavoro';

    icsContent += "BEGIN:VEVENT\r\n";
    icsContent += `SUMMARY:${summary}${note ? ` - ${note}` : ''}\r\n`;
    if (note) {
      icsContent += `DESCRIPTION:${note}\r\n`;
    }
    // Using floating time (no 'Z' at the end) so it applies to the user's local timezone
    icsContent += `DTSTART:${formattedDate}T${startTime}\r\n`;
    icsContent += `DTEND:${endDateStr}T${endTime}\r\n`;
    icsContent += "END:VEVENT\r\n";
    
    icsContent += "END:VCALENDAR\r\n";
    
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', `shift_${dateStr}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 print:hidden">
      <Header 
        onReset={() => {
          if (confirm("Sei sicuro di voler resettare tutti i dati?")) {
            localStorage.clear();
            window.location.reload();
          }
        }}
        onOpenSettings={() => setShowSettings(true)}
        onUndo={handleUndo}
        canUndo={resultHistory.length > 0}
      />

      {/* Main Content */}
      <main className="flex-1 p-4 flex flex-col max-w-3xl mx-auto w-full">
        
        {/* State 1: Upload / Camera (Empty State when no results) */}
        {!imagePreview && !result && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 mt-12 text-center animate-in fade-in duration-700">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 mb-6 w-full max-w-sm">
              <div className="bg-indigo-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-indigo-600">
                  <path d="M4 6C4 4.89543 4.89543 4 6 4H8C8.55228 4 9 3.55228 9 3C9 2.44772 8.55228 2 8 2H6C3.79086 2 2 3.79086 2 6V8C2 8.55228 2.44772 9 3 9C3.55228 9 4 8.55228 4 8V6Z" fill="currentColor"/>
                  <path d="M20 6C20 4.89543 19.1046 4 18 4H16C15.4477 4 15 3.55228 15 3C15 2.44772 15.4477 2 16 2H18C20.2091 2 22 3.79086 22 6V8C22 8.55228 21.5523 9 21 9C20.4477 9 20 8.55228 20 8V6Z" fill="currentColor"/>
                  <path d="M4 18C4 19.1046 4.89543 20 6 20H8C8.55228 20 9 20.4477 9 21C9 21.5523 8.55228 22 8 22H6C3.79086 22 2 20.2091 2 18V16C2 15.4477 2.44772 15 3 15C3.55228 15 4 15.4477 4 16V18Z" fill="currentColor"/>
                  <path d="M20 18C20 19.1046 19.1046 20 18 20H16C15.4477 20 15 20.4477 15 21C15 21.5523 15.4477 22 16 22H18C20.2091 22 22 20.2091 22 18V16C22 15.4477 21.5523 15 21 15C20.4477 15 20 15.4477 20 16V18Z" fill="currentColor"/>
                  <circle cx="12" cy="12" r="5" fill="currentColor"/>
                </svg>
              </div>
              <h2 className="text-xl font-black text-slate-800 mb-2">Inizia ora</h2>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                Carica una foto del piano turni per estrarre automaticamente la tabella e gli orari. 
              </p>
              <button 
                onClick={() => setIsUploadModalOpen(true)}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Scansiona Orario
              </button>
            </div>
          </div>
        )}

        {/* State 2: Preview & Processing */}
        {imagePreview && (
          <PreviewPanel
            imagePreview={imagePreview}
            isProcessing={isProcessing}
            error={error}
            targetEmployeeName={targetEmployeeName}
            setTargetEmployeeName={setTargetEmployeeName}
            processImage={processImage}
          />
        )}

        {/* State 3: Results */}
        {result && !imagePreview && (
          <ResultsPanel
            result={result}
            viewMode={viewMode}
            selectedEmployee={selectedEmployee}
            targetEmployeeName={targetEmployeeName}
            handleSelectEmployee={handleSelectEmployee}
            setConfirmModal={setConfirmModal}
            setResult={setResult}
            setPrintModal={setPrintModal}
            customCodes={customCodes}
            setCustomCodes={setCustomCodes}
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
            setIsAddShiftModalOpen={setIsAddShiftModalOpen}
            handleAddToCalendar={handleAddToCalendar}
            currentDay={currentDay}
            currentMonth={currentMonth}
            currentYear={currentYear}
            payday={payday}
            now={now}
            onOpenScanner={() => setIsUploadModalOpen(true)}
          />
        )}
      </main>

        {/* Upload Modal */ }
        <UploadModal 
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          targetEmployeeName={targetEmployeeName}
          onEmployeeNameChange={setTargetEmployeeName}
          onFileChange={handleFileChange}
        />

      {/* Confirmation Modal */}
      <ConfirmModal 
        isOpen={!!confirmModal?.isOpen}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        enableHourTracking={enableHourTracking}
        setEnableHourTracking={setEnableHourTracking}
        viewMode={viewMode}
        setViewMode={setViewMode}
        hourlyWage={hourlyWage}
        setHourlyWage={setHourlyWage}
        thirteenthAllowance={thirteenthAllowance}
        setThirteenthAllowance={setThirteenthAllowance}
        vacationAllowance={vacationAllowance}
        setVacationAllowance={setVacationAllowance}
        holidayAllowance={holidayAllowance}
        setHolidayAllowance={setHolidayAllowance}
        clothingAllocation={clothingAllocation}
        setClothingAllocation={setClothingAllocation}
        avsDeduction={avsDeduction}
        setAvsDeduction={setAvsDeduction}
        unemploymentDeduction={unemploymentDeduction}
        setUnemploymentDeduction={setUnemploymentDeduction}
        dailySicknessDeduction={dailySicknessDeduction}
        setDailySicknessDeduction={setDailySicknessDeduction}
        accidentDeduction={accidentDeduction}
        setAccidentDeduction={setAccidentDeduction}
        secondPillarDeduction={secondPillarDeduction}
        setSecondPillarDeduction={setSecondPillarDeduction}
        sourceTaxDeduction={sourceTaxDeduction}
        setSourceTaxDeduction={setSourceTaxDeduction}
        coordinationDeduction={coordinationDeduction}
        setCoordinationDeduction={setCoordinationDeduction}
        maxClothingAllocation={maxClothingAllocation}
        setMaxClothingAllocation={setMaxClothingAllocation}
        sundaySupplement={sundaySupplement}
        setSundaySupplement={setSundaySupplement}
        nightSupplement={nightSupplement}
        setNightSupplement={setNightSupplement}
        targetEmployeeName={targetEmployeeName}
        setTargetEmployeeName={setTargetEmployeeName}
        payday={payday}
        setPayday={setPayday}
        customCodes={customCodes}
        setCustomCodes={setCustomCodes}
        setConfirmModal={setConfirmModal}
        setGlobalHistory={setGlobalHistory}
        setResult={setResult}
        setSelectedEmployee={setSelectedEmployee}
      />

      {/* Custom Code Modal */}
      <CustomCodeModal
        editingCode={editingCode}
        setEditingCode={setEditingCode}
        customIsDayOff={customIsDayOff}
        setCustomIsDayOff={setCustomIsDayOff}
        customStart1={customStart1}
        setCustomStart1={setCustomStart1}
        customEnd1={customEnd1}
        setCustomEnd1={setCustomEnd1}
        customStart2={customStart2}
        setCustomStart2={setCustomStart2}
        customEnd2={customEnd2}
        setCustomEnd2={setCustomEnd2}
        handleSaveCustomCode={handleSaveCustomCode}
      />

      {/* Edit Shift Code Modal */}
      <EditShiftModal
        editingShift={editingShift}
        setEditingShift={setEditingShift}
        manualPeriods={manualPeriods}
        setManualPeriods={setManualPeriods}
        newShiftCode={newShiftCode}
        setNewShiftCode={setNewShiftCode}
        isImprovingNote={isImprovingNote}
        handleImproveNote={handleImproveNote}
        handleUpdateShiftCode={handleUpdateShiftCode}
        customCodes={customCodes}
      />

      {/* Add Shift Modal */}
      <AddShiftModal
        isOpen={isAddShiftModalOpen}
        onClose={() => setIsAddShiftModalOpen(false)}
        onAdd={handleAddShift}
      />
    </div>

      {/* Print Modal */}
      <PrintModal 
        isOpen={!!printModal}
        startDate={printModal?.startDate || ''}
        endDate={printModal?.endDate || ''}
        selectedEmployee={selectedEmployee}
        customCodes={customCodes}
        onClose={() => setPrintModal(null)}
        onStartDateChange={(date) => printModal && setPrintModal({ ...printModal, startDate: date })}
        onEndDateChange={(date) => printModal && setPrintModal({ ...printModal, endDate: date })}
      />
    </>
  );
}
