// src/lib/ai-insights.ts - AI health insights (client-side analysis, no API key needed)

export interface AdherenceInsight {
  score: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  riskLevel: 'low' | 'medium' | 'high';
  insights: string[];
  recommendations: string[];
  weeklyChart: { day: string; taken: number; missed: number; skipped: number }[];
}

export interface HealthSummary {
  period: string;
  adherenceRate: number;
  totalDoses: number;
  takenDoses: number;
  missedDoses: number;
  skippedDoses: number;
  mostMissedMedicine: string | null;
  bestDay: string | null;
  worstDay: string | null;
  streakDays: number;
  insights: string[];
  nextSteps: string[];
}

export function analyzeAdherence(records: any[], medicines: any[]): AdherenceInsight {
  const last7 = getLast7Days();
  const weeklyChart = last7.map(day => {
    const dayRecs = records.filter(r => r.date === day);
    return {
      day: new Date(day).toLocaleDateString('en-US', { weekday: 'short' }),
      taken: dayRecs.filter(r => r.status === 'taken').length,
      missed: dayRecs.filter(r => r.status === 'missed').length,
      skipped: dayRecs.filter(r => r.status === 'skipped').length,
    };
  });

  const total = records.length || 1;
  const taken = records.filter(r => r.status === 'taken').length;
  const score = Math.round((taken / total) * 100);

  // Trend: compare last 7 days vs prior 7 days
  const last7Recs = records.filter(r => r.date >= last7[0]);
  const prior7Start = getPriorPeriod(14, 7);
  const prior7Recs = records.filter(r => r.date >= prior7Start && r.date < last7[0]);
  const lastRate = last7Recs.length > 0 ? (last7Recs.filter(r=>r.status==='taken').length / last7Recs.length) : 0;
  const priorRate = prior7Recs.length > 0 ? (prior7Recs.filter(r=>r.status==='taken').length / prior7Recs.length) : lastRate;
  const trend = lastRate > priorRate + 0.05 ? 'improving' : lastRate < priorRate - 0.05 ? 'declining' : 'stable';

  const riskLevel = score >= 80 ? 'low' : score >= 60 ? 'medium' : 'high';

  const insights: string[] = [];
  const recommendations: string[] = [];

  if (score >= 90) { insights.push('Excellent adherence! You are taking your medicines consistently.'); }
  else if (score >= 75) { insights.push('Good adherence overall. Minor improvements possible.'); }
  else if (score >= 60) { insights.push('Moderate adherence. Missing doses may reduce treatment effectiveness.'); recommendations.push('Set phone alarms 15 minutes before each scheduled dose.'); }
  else { insights.push('Low adherence detected. This may affect your health outcomes significantly.'); recommendations.push('Talk to your caregiver or doctor about a simpler medicine schedule.'); recommendations.push('Use the voice assistant to remind you of doses.'); }

  if (trend === 'improving') insights.push('Your adherence is improving compared to last week. Keep it up!');
  if (trend === 'declining') { insights.push('Adherence has dropped compared to last week.'); recommendations.push('Ask your caregiver to check in daily until adherence improves.'); }

  const missedByMed: Record<string,number> = {};
  records.filter(r=>r.status==='missed'||r.status==='skipped').forEach(r => { missedByMed[r.medicineId] = (missedByMed[r.medicineId]||0) + 1; });
  const mostMissedId = Object.entries(missedByMed).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const mostMissed = medicines.find(m=>m.id===mostMissedId);
  if (mostMissed) { insights.push(`${mostMissed.name} is missed most often. Consider adjusting its schedule.`); }

  return { score, trend, riskLevel, insights, recommendations, weeklyChart };
}

export function generateWeeklySummary(records: any[], medicines: any[], userName: string): HealthSummary {
  const last7 = getLast7Days();
  const weekRecs = records.filter(r => last7.includes(r.date));
  const total = weekRecs.length;
  const taken = weekRecs.filter(r=>r.status==='taken').length;
  const missed = weekRecs.filter(r=>r.status==='missed').length;
  const skipped = weekRecs.filter(r=>r.status==='skipped').length;
  const adherenceRate = total > 0 ? Math.round((taken/total)*100) : 100;

  // Most missed medicine
  const missedMap: Record<string,{count:number;name:string}> = {};
  weekRecs.filter(r=>r.status!=='taken').forEach(r => {
    const med = medicines.find(m=>m.id===r.medicineId);
    const name = med?.name || r.medicineId;
    missedMap[r.medicineId] = { count: (missedMap[r.medicineId]?.count||0)+1, name };
  });
  const mostMissed = Object.values(missedMap).sort((a,b)=>b.count-a.count)[0]?.name || null;

  // Best/worst day
  const dayStats = last7.map(d => ({ day:d, taken: weekRecs.filter(r=>r.date===d&&r.status==='taken').length, total: weekRecs.filter(r=>r.date===d).length }));
  const bestDay = dayStats.filter(d=>d.total>0).sort((a,b)=>(b.taken/b.total)-(a.taken/a.total))[0]?.day || null;
  const worstDay = dayStats.filter(d=>d.total>0).sort((a,b)=>(a.taken/a.total)-(b.taken/b.total))[0]?.day || null;

  // Streak
  let streak = 0;
  for (let i = last7.length-1; i >= 0; i--) {
    const dayRecs = weekRecs.filter(r=>r.date===last7[i]);
    const allTaken = dayRecs.length > 0 && dayRecs.every(r=>r.status==='taken');
    if (allTaken) streak++; else break;
  }

  const insights: string[] = [];
  const nextSteps: string[] = [];

  insights.push(`${userName}, here is your weekly health summary.`);
  insights.push(`You took ${taken} out of ${total} scheduled doses (${adherenceRate}% adherence).`);
  if (streak > 0) insights.push(`You have a ${streak}-day streak of perfect adherence!`);
  if (missed > 0) { insights.push(`You missed ${missed} dose${missed>1?'s':''}. Consistency is key to effective treatment.`); nextSteps.push('Review your medicine schedule with your doctor at the next appointment.'); }
  if (adherenceRate >= 90) { nextSteps.push('Keep up the excellent routine! Share your progress with your doctor.'); }
  else { nextSteps.push('Try setting reminders 10 minutes before each dose time.'); nextSteps.push('Ask your caregiver to assist with the medicines you miss most.'); }

  return { period:'Last 7 days', adherenceRate, totalDoses:total, takenDoses:taken, missedDoses:missed, skippedDoses:skipped, mostMissedMedicine:mostMissed, bestDay, worstDay, streakDays:streak, insights, nextSteps };
}

function getLast7Days(): string[] {
  return Array.from({length:7}).map((_,i) => {
    const d = new Date(); d.setDate(d.getDate()-6+i);
    return d.toISOString().split('T')[0];
  });
}

function getPriorPeriod(daysAgo: number, length: number): string {
  const d = new Date(); d.setDate(d.getDate()-daysAgo);
  return d.toISOString().split('T')[0];
}
