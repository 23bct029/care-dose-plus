// src/lib/pharmacy.ts - Pharmacy integration
// Uses NLM RxNorm API for drug info + mock pharmacy data

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  phone: string;
  distance?: number;
  open24h?: boolean;
  deliveryAvailable?: boolean;
}

export interface RefillRequest {
  id?: string;
  prescriptionId: string;
  patientId: string;
  patientName: string;
  medicineName: string;
  pharmacyId: string;
  pharmacyName: string;
  status: 'pending' | 'processing' | 'ready' | 'delivered';
  requestedAt: string;
  notes?: string;
  deliveryAddress?: string;
}

// Mock pharmacies (real implementation would use Google Places API)
export const NEARBY_PHARMACIES: Pharmacy[] = [
  { id:'p1', name:'Apollo Pharmacy', address:'Near Main Road, Sector 5', phone:'+91 98765 43210', distance:0.3, open24h:true, deliveryAvailable:true },
  { id:'p2', name:'MedPlus Pharmacy', address:'City Center Mall, Ground Floor', phone:'+91 98765 43211', distance:0.8, open24h:false, deliveryAvailable:true },
  { id:'p3', name:'Fortis Hospital Pharmacy', address:'Fortis Hospital Campus', phone:'+91 98765 43212', distance:1.2, open24h:true, deliveryAvailable:false },
  { id:'p4', name:'NetMeds Online', address:'Online Delivery', phone:'+91 1800 103 0006', distance:0, open24h:true, deliveryAvailable:true },
  { id:'p5', name:'PharmEasy', address:'Online Delivery', phone:'+91 1800 102 9644', distance:0, open24h:true, deliveryAvailable:true },
];

export async function getDrugInfo(drugName: string): Promise<{ rxcui?: string; fullName?: string; description?: string } | null> {
  try {
    const res = await fetch(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(drugName)}&search=1`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const rxcui = data.idGroup?.rxnormId?.[0];
    if (!rxcui) return null;
    return { rxcui, fullName: data.idGroup?.name };
  } catch { return null; }
}

export function createRefillRequest(data: Omit<RefillRequest, 'id' | 'requestedAt' | 'status'>): RefillRequest {
  const request: RefillRequest = {
    ...data,
    id: `refill_${Date.now()}`,
    status: 'pending',
    requestedAt: new Date().toISOString()
  };
  // Save locally
  const existing = JSON.parse(localStorage.getItem('refill_requests') || '[]');
  existing.push(request);
  localStorage.setItem('refill_requests', JSON.stringify(existing));
  return request;
}

export function getRefillRequests(patientId: string): RefillRequest[] {
  const all: RefillRequest[] = JSON.parse(localStorage.getItem('refill_requests') || '[]');
  return all.filter(r => r.patientId === patientId);
}

export function formatPrescriptionForPharmacy(prescription: any, patient: any, doctor: any): string {
  const meds = (prescription.medicines || []).map((m: any) =>
    `• ${m.name} ${m.dosage} — ${m.frequency}, ${m.timing} — ${m.duration}`
  ).join('\n');

  return `
PRESCRIPTION
============
Patient: ${patient.name} | Age: ${patient.age || 'N/A'}
Doctor: Dr. ${doctor.name}
Date: ${new Date().toLocaleDateString()}

MEDICINES:
${meds}

Notes: ${prescription.generalNotes || 'None'}
Duration: ${prescription.totalDuration}
============
  `.trim();
}
