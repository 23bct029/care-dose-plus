// src/lib/drug-interactions.ts
// Drug interaction checker using OpenFDA API + local database
// Structured for easy React Native migration

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'mild' | 'moderate' | 'severe' | 'contraindicated';
  description: string;
  recommendation: string;
}

// Local curated database (works offline)
const LOCAL_DB: DrugInteraction[] = [
  { drug1:'warfarin',     drug2:'aspirin',        severity:'severe',         description:'Significantly increased bleeding risk.',         recommendation:'Avoid combination. Monitor INR closely if unavoidable.' },
  { drug1:'warfarin',     drug2:'ibuprofen',       severity:'severe',         description:'Increased anticoagulant effect and GI bleeding.', recommendation:'Use paracetamol instead. Monitor INR.' },
  { drug1:'warfarin',     drug2:'naproxen',        severity:'severe',         description:'Increased bleeding risk.',                        recommendation:'Avoid. Use safer alternative.' },
  { drug1:'metformin',    drug2:'alcohol',         severity:'moderate',       description:'Risk of lactic acidosis.',                        recommendation:'Advise patient to avoid alcohol.' },
  { drug1:'atorvastatin', drug2:'clarithromycin',  severity:'severe',         description:'Risk of myopathy and rhabdomyolysis.',            recommendation:'Temporarily suspend statin during antibiotic course.' },
  { drug1:'simvastatin',  drug2:'amlodipine',      severity:'moderate',       description:'Increased statin levels; myopathy risk.',         recommendation:'Limit simvastatin dose. Monitor for muscle pain.' },
  { drug1:'lisinopril',   drug2:'potassium',       severity:'moderate',       description:'Risk of hyperkalemia.',                           recommendation:'Monitor serum potassium levels regularly.' },
  { drug1:'digoxin',      drug2:'amiodarone',      severity:'severe',         description:'Digoxin toxicity risk.',                          recommendation:'Reduce digoxin dose by 50%. Monitor levels.' },
  { drug1:'metoprolol',   drug2:'verapamil',       severity:'severe',         description:'Risk of bradycardia and AV block.',               recommendation:'Avoid combination.' },
  { drug1:'clopidogrel',  drug2:'omeprazole',      severity:'moderate',       description:'Reduced antiplatelet efficacy.',                   recommendation:'Use pantoprazole instead.' },
  { drug1:'fluoxetine',   drug2:'tramadol',        severity:'contraindicated',description:'Serotonin syndrome risk.',                         recommendation:'Do not combine. Use alternative analgesic.' },
  { drug1:'ssri',         drug2:'tramadol',        severity:'contraindicated',description:'Serotonin syndrome risk.',                         recommendation:'Avoid combination. Choose different pain relief.' },
  { drug1:'ciprofloxacin',drug2:'antacid',         severity:'mild',           description:'Reduced antibiotic absorption.',                   recommendation:'Take ciprofloxacin 2 hours before or 6 hours after antacid.' },
  { drug1:'metformin',    drug2:'contrast',        severity:'severe',         description:'Risk of contrast-induced nephropathy and lactic acidosis.', recommendation:'Stop metformin 48h before contrast procedures.' },
  { drug1:'lithium',      drug2:'ibuprofen',       severity:'severe',         description:'NSAIDs increase lithium levels to toxic range.',   recommendation:'Avoid NSAIDs. Use paracetamol.' },
  { drug1:'sildenafil',   drug2:'nitrate',         severity:'contraindicated',description:'Severe hypotension risk.',                         recommendation:'Absolutely contraindicated.' },
  { drug1:'levodopa',     drug2:'metoclopramide',  severity:'moderate',       description:'Reduced levodopa efficacy.',                       recommendation:'Avoid domperidone is preferred alternative.' },
  { drug1:'theophylline', drug2:'ciprofloxacin',   severity:'moderate',       description:'Increased theophylline levels, toxicity risk.',    recommendation:'Monitor theophylline levels. Reduce dose if needed.' },
];

export function checkLocalInteractions(medicines: string[]): DrugInteraction[] {
  const found: DrugInteraction[] = [];
  const lower = medicines.map(m => m.toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    for (let j = i + 1; j < lower.length; j++) {
      const a = lower[i], b = lower[j];
      for (const ix of LOCAL_DB) {
        const d1 = ix.drug1.toLowerCase(), d2 = ix.drug2.toLowerCase();
        if ((a.includes(d1) && b.includes(d2)) || (a.includes(d2) && b.includes(d1))) {
          if (!found.find(f => f.drug1 === ix.drug1 && f.drug2 === ix.drug2)) found.push(ix);
        }
      }
    }
  }
  return found;
}

// OpenFDA drug interaction API (online check)
export async function checkFDAInteractions(drug1: string, drug2: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(`"${drug1}" AND "${drug2}"`);
    const url = `https://api.fda.gov/drug/label.json?search=drug_interactions:${encoded}&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const interaction = data.results?.[0]?.drug_interactions?.[0];
    return interaction ? interaction.slice(0, 300) : null;
  } catch {
    return null; // Gracefully fall back to local DB
  }
}

// RxNorm concept lookup (for drug name normalization)
export async function getRxNormCUI(drugName: string): Promise<string | null> {
  try {
    const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(drugName)}&search=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.idGroup?.rxnormId?.[0] || null;
  } catch {
    return null;
  }
}

export const SEVERITY_CONFIG = {
  mild:            { color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300', label: 'Mild Interaction' },
  moderate:        { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300', label: 'Moderate Interaction' },
  severe:          { color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300',    label: 'Severe Interaction' },
  contraindicated: { color: 'text-red-900',    bg: 'bg-red-100',   border: 'border-red-500',    label: 'CONTRAINDICATED' },
};
