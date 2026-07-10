import React from 'react';
import { motion } from 'motion/react';
import { BarChart3, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { Employee, CustomShiftCode } from '../types';
import { interpretShift, calculateShiftHours, formatHoursDisplay } from '../utils/shiftUtils';
import { getWeekNumber } from '../utils/dateUtils';

interface StatisticsPanelProps {
  selectedEmployee: Employee | null;
  customCodes: CustomShiftCode[];
  payday: number;
  hourlyWage: number;
  thirteenthAllowance: number;
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({
  selectedEmployee,
  customCodes,
  payday,
  hourlyWage,
  thirteenthAllowance
}) => {
  if (!selectedEmployee) return (
    <div className="p-12 text-center flex flex-col items-center gap-4">
      <div className="h-20 w-20 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-300">
        <BarChart3 size={40} />
      </div>
      <p className="text-slate-500 font-medium max-w-xs">
        Seleziona un dipendente dalla scheda Personale per visualizzare le statistiche.
      </p>
    </div>
  );

  const weeklyDataMap: Record<string, number> = {};
  const monthlyDataMap: Record<string, { hours: number, salary: number }> = {};

  selectedEmployee.schedule.forEach(entry => {
    const interpreted = interpretShift(entry.date, entry.code, customCodes, entry.manualShifts);
    if (interpreted.status !== 'Work') return;

    let dailyHours = 0;
    interpreted.shifts.forEach(s => {
      dailyHours += calculateShiftHours(s.start, s.end);
    });

    const parts = entry.date.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1;
      const d = parseInt(parts[2]);
      const date = new Date(y, m, d);
      if (!isNaN(date.getTime())) {
        // Accounting month logic: if d >= payday, it belongs to the next month. If d < payday, it belongs to the current month.
        let accMonth = m;
        let accYear = y;
        if (d >= payday) {
          accMonth = m + 1;
          if (accMonth > 11) {
            accMonth = 0;
            accYear = y + 1;
          }
        }
        const accDate = new Date(accYear, accMonth, 1);
        const monthKey = accDate.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
        const weekKey = `Sett ${getWeekNumber(date)}`;

        weeklyDataMap[weekKey] = (weeklyDataMap[weekKey] || 0) + dailyHours;

        if (!monthlyDataMap[monthKey]) {
          monthlyDataMap[monthKey] = { hours: 0, salary: 0 };
        }
        monthlyDataMap[monthKey].hours += dailyHours;
        monthlyDataMap[monthKey].salary += dailyHours * hourlyWage * (1 + thirteenthAllowance / 100);
      }
    }
  });

  const weeklyData = Object.keys(weeklyDataMap).map(key => ({ name: key, hours: Number(weeklyDataMap[key]) }));
  const monthlyData = Object.keys(monthlyDataMap).map(key => ({
    name: key,
    hours: Number(monthlyDataMap[key].hours),
    salary: Number(monthlyDataMap[key].salary.toFixed(2))
  })).sort((a, b) => {
    const parseDate = (str: string) => {
      const [m, y] = str.split(' ');
      const months: Record<string, number> = {
        'gen': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'mag': 4, 'giu': 5,
        'lug': 6, 'ago': 7, 'set': 8, 'ott': 9, 'nov': 10, 'dic': 11
      };
      return new Date(parseInt(y), months[m.toLowerCase()] || 0, 1);
    };
    return parseDate(a.name).getTime() - parseDate(b.name).getTime();
  });

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-8 p-6"
    >
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <BarChart3 size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Ore Settimanali</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Distribuzione del carico</p>
            </div>
          </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#4f46e5" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
              <Tooltip 
                cursor={{fill: '#f8fafc', radius: 12}}
                contentStyle={{ borderRadius: '20px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)', padding: '12px 16px' }}
                itemStyle={{ fontWeight: 800, color: '#1e293b' }}
                labelStyle={{ fontWeight: 900, color: '#6366f1', marginBottom: '4px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                formatter={(value: any, name: string) => [name === 'Ore Lavorate' || name === 'Ore' ? formatHoursDisplay(Number(value)) : value, name]}
              />
              <Bar dataKey="hours" fill="url(#barGradient)" radius={[10, 10, 10, 10]} name="Ore Lavorate" maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight">Trend Mensile</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ore e Guadagni nel tempo</p>
            </div>
          </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
              <Tooltip 
                contentStyle={{ borderRadius: '20px', border: '1px solid #f1f5f9', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.05)', padding: '12px 16px' }}
                itemStyle={{ fontWeight: 800 }}
                labelStyle={{ fontWeight: 900, color: '#6366f1', marginBottom: '4px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                formatter={(value: any, name: string) => [name === 'Ore Lavorate' || name === 'Ore' ? formatHoursDisplay(Number(value)) : value + ' CHF', name]}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '30px' }} 
                iconType="circle"
                formatter={(value) => <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{value}</span>}
              />
              <Line yAxisId="left" type="monotone" dataKey="hours" stroke="#6366f1" strokeWidth={4} name="Ore" dot={{ r: 6, fill: '#fff', strokeWidth: 3 }} activeDot={{ r: 8, strokeWidth: 0 }} />
              <Line yAxisId="right" type="monotone" dataKey="salary" stroke="#10b981" strokeWidth={4} name="CHF" dot={{ r: 6, fill: '#fff', strokeWidth: 3 }} activeDot={{ r: 8, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
};
