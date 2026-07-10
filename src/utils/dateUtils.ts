export function getWeekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export const formatCardDate = (dateStr: string) => {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      const weekday = date.toLocaleDateString('it-IT', { weekday: 'long' });
      const dayMonth = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'long' });
      return { 
        weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), 
        dayMonth: dayMonth.charAt(0).toUpperCase() + dayMonth.slice(1) 
      };
    }
  }
  return { weekday: '', dayMonth: dateStr };
};
