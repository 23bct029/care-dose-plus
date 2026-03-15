// src/components/AIInsightsPanel.tsx - AI health insights panel
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, Brain, Calendar, Award, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { analyzeAdherence, generateWeeklySummary } from '@/lib/ai-insights';

interface AIInsightsPanelProps {
  records: any[];
  medicines: any[];
  userName: string;
  compact?: boolean;
}

const AIInsightsPanel = ({ records, medicines, userName, compact = false }: AIInsightsPanelProps) => {
  const [expanded, setExpanded] = useState(!compact);
  const [showSummary, setShowSummary] = useState(false);
  const [insight, setInsight] = useState<ReturnType<typeof analyzeAdherence> | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof generateWeeklySummary> | null>(null);

  useEffect(() => {
    if (records.length > 0 || medicines.length > 0) {
      setInsight(analyzeAdherence(records, medicines));
      setSummary(generateWeeklySummary(records, medicines, userName));
    }
  }, [records, medicines, userName]);

  if (!insight) return null;

  const TrendIcon = insight.trend === 'improving' ? TrendingUp : insight.trend === 'declining' ? TrendingDown : Minus;
  const trendColor = insight.trend === 'improving' ? 'text-green-600' : insight.trend === 'declining' ? 'text-red-600' : 'text-gray-500';
  const riskColor = insight.riskLevel === 'low' ? 'bg-green-100 text-green-700' : insight.riskLevel === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';

  return (
    <Card className="border border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
            <Brain className="h-4 w-4 text-indigo-600"/>
            AI Health Insights
            <Badge className={`${riskColor} text-xs ml-1`}>
              {insight.riskLevel === 'low' ? '✓ Good' : insight.riskLevel === 'medium' ? '⚠ Monitor' : '⚡ Attention'}
            </Badge>
          </CardTitle>
          {compact && (
            <button onClick={() => setExpanded(e => !e)} className="text-indigo-500 hover:text-indigo-700">
              {expanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}
            </button>
          )}
        </div>
      </CardHeader>

      {(!compact || expanded) && (
        <CardContent className="px-4 pb-4 space-y-4">
          {/* Score + Trend */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-3 border border-indigo-100">
              <p className="text-xs text-gray-500 mb-1">Adherence Score</p>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-indigo-700">{insight.score}%</span>
                <TrendIcon className={`h-4 w-4 mb-1 ${trendColor}`}/>
              </div>
              <Progress value={insight.score} className="h-1.5 mt-2"/>
            </div>
            <div className="bg-white rounded-xl p-3 border border-indigo-100">
              <p className="text-xs text-gray-500 mb-1">7-Day Trend</p>
              <div className="flex items-end gap-2">
                <span className={`text-lg font-semibold capitalize ${trendColor}`}>{insight.trend}</span>
              </div>
              <div className="flex gap-1 mt-2">
                {insight.weeklyChart.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full bg-gray-100 rounded-sm overflow-hidden" style={{height:'24px'}}>
                      {(d.taken + d.missed) > 0 && (
                        <div className={`w-full rounded-sm ${d.missed > 0 ? 'bg-red-400' : 'bg-emerald-400'}`}
                          style={{height:`${(d.taken/(d.taken+d.missed+d.skipped||1))*24}px`, marginTop:`${24-(d.taken/(d.taken+d.missed+d.skipped||1))*24}px`}}/>
                      )}
                    </div>
                    <span className="text-[9px] text-gray-400">{d.day.charAt(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Insights */}
          {insight.insights.length > 0 && (
            <div className="space-y-1.5">
              {insight.insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-indigo-500 mt-0.5 shrink-0">💡</span>
                  <span>{ins}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {insight.recommendations.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700 mb-1">Recommendations</p>
              {insight.recommendations.map((r, i) => (
                <p key={i} className="text-xs text-amber-800">→ {r}</p>
              ))}
            </div>
          )}

          {/* Weekly summary toggle */}
          <Button size="sm" variant="outline" className="w-full border-indigo-300 text-indigo-700 hover:bg-indigo-100 h-8 text-xs"
            onClick={() => setShowSummary(s => !s)}>
            <Calendar className="h-3.5 w-3.5 mr-1.5"/>{showSummary ? 'Hide' : 'View'} Weekly Summary
          </Button>

          {showSummary && summary && (
            <div className="bg-white rounded-xl border border-indigo-100 p-4 space-y-3">
              <p className="font-semibold text-gray-900 text-sm">Weekly Health Summary</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  {v:summary.takenDoses, l:'Taken', c:'text-emerald-700'},
                  {v:summary.missedDoses, l:'Missed', c:'text-red-700'},
                  {v:summary.streakDays, l:'Day Streak', c:'text-indigo-700'},
                ].map((s,i) => <div key={i}><p className={`text-xl font-bold ${s.c}`}>{s.v}</p><p className="text-xs text-gray-400">{s.l}</p></div>)}
              </div>
              {summary.mostMissedMedicine && (
                <p className="text-xs text-gray-600"><span className="font-medium">Most missed:</span> {summary.mostMissedMedicine}</p>
              )}
              {summary.nextSteps.map((s,i) => (
                <p key={i} className="text-xs text-gray-700 flex items-start gap-1"><span className="text-green-500">✓</span>{s}</p>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default AIInsightsPanel;
