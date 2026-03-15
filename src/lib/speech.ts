// src/lib/speech.ts - Fixed: stops on refresh, mute works, recognition re-created each time

declare global {
  interface Window { SpeechRecognition: any; webkitSpeechRecognition: any; }
}

class SpeechService {
  private synthesis: SpeechSynthesis | null = null;
  private isListening = false;
  private activeRecognition: any = null;
  private muted = false; // internal mute state

  constructor() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
      // Stop speech on page hide / refresh / navigation
      window.addEventListener('beforeunload', () => this.stopAll());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.stopAll();
      });
    }
  }

  /** Stop all speech immediately */
  stopAll() {
    try { this.synthesis?.cancel(); } catch {}
    try { this.activeRecognition?.abort(); } catch {}
    this.isListening = false;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) {
      try { this.synthesis?.cancel(); } catch {}
    }
  }

  isSupported(): boolean {
    return !!this.synthesis && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  async speak(text: string, rate = 0.92): Promise<void> {
    if (!this.synthesis || !text || this.muted) return;
    // Cancel any in-progress speech first
    try { this.synthesis.cancel(); } catch {}
    
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      u.pitch = 1.0;
      u.volume = 1;

      // Try to get a good voice
      const trySpeak = () => {
        const voices = this.synthesis!.getVoices();
        if (voices.length > 0) {
          const preferred = voices.find(v =>
            v.lang.startsWith('en') && !v.localService === false // prefer online voices
          ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
          if (preferred) u.voice = preferred;
        }
        u.onend = () => resolve();
        u.onerror = () => resolve();
        try { this.synthesis!.speak(u); } catch { resolve(); }
      };

      // If voices not loaded yet, wait
      if (this.synthesis!.getVoices().length === 0) {
        const onVoicesChanged = () => {
          window.speechSynthesis.onvoiceschanged = null;
          trySpeak();
        };
        window.speechSynthesis.onvoiceschanged = onVoicesChanged;
        // Fallback: try after 500ms anyway
        setTimeout(() => { 
          window.speechSynthesis.onvoiceschanged = null;
          trySpeak(); 
        }, 500);
      } else {
        trySpeak();
      }
    });
  }

  /** Create a brand new SpeechRecognition each time (required — can't reuse) */
  private createRecognition(): any {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    // Use multiple langs for better Indian English support
    r.lang = 'en-US'; // en-US is most reliable; also works for Indian speakers
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 3;
    return r;
  }

  async listenForResponse(timeout = 8000): Promise<string> {
    if (!this.isSupported()) return 'not_supported';
    if (this.isListening) {
      // Abort previous if stuck
      try { this.activeRecognition?.abort(); } catch {}
      this.isListening = false;
      await new Promise(r => setTimeout(r, 300));
    }

    const recognition = this.createRecognition();
    if (!recognition) return 'not_supported';
    this.activeRecognition = recognition;

    return new Promise((resolve) => {
      this.isListening = true;
      let resolved = false;

      const done = (result: string) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        this.isListening = false;
        this.activeRecognition = null;
        resolve(result);
      };

      const timer = setTimeout(() => {
        try { recognition.abort(); } catch {}
        done('timeout');
      }, timeout);

      recognition.onresult = (e: any) => {
        // Take highest confidence result
        let best = '';
        let bestConf = 0;
        for (let i = 0; i < (e.results[0]?.length || 0); i++) {
          const alt = e.results[0][i];
          if (alt.confidence > bestConf) { bestConf = alt.confidence; best = alt.transcript.trim(); }
        }
        done(best || e.results[0][0].transcript.trim());
      };

      recognition.onerror = (e: any) => {
        if (e.error === 'not-allowed' || e.error === 'permission-denied') done('permission_denied');
        else if (e.error === 'no-speech') done('timeout');
        else if (e.error === 'aborted') done('aborted');
        else done('error');
      };

      recognition.onend = () => done('timeout');

      try {
        recognition.start();
      } catch (err: any) {
        if (err.name === 'InvalidStateError') {
          // Already started somehow — abort and retry after short delay
          done('error');
        } else {
          done('error');
        }
      }
    });
  }

  processQuery(query: string): string {
    const lq = query.toLowerCase().trim();
    if (!lq) return 'unknown';
    // Emergencies
    if (/fall|fell|fallen/.test(lq)) return 'emergency_fall';
    if (/chest pain|heart attack|cardiac/.test(lq)) return 'emergency_pain';
    if (/confus|dizzy|faint/.test(lq)) return 'emergency_confusion';
    if (/bleed/.test(lq)) return 'emergency_bleeding';
    if (/breath|chok|suffocating/.test(lq)) return 'emergency_breathing';
    if (/stroke|paralysis/.test(lq)) return 'emergency_stroke';
    if (/\bsos\b|help me|emergency|urgent help/.test(lq)) return 'emergency';
    // Calls
    if (/video.*caregiver|caregiver.*video/.test(lq)) return 'video_caregiver';
    if (/video.*doctor|doctor.*video/.test(lq)) return 'video_doctor';
    if (/call.*caregiver|caregiver.*call|ring.*caregiver/.test(lq)) return 'call_caregiver';
    if (/call.*doctor|doctor.*call|ring.*doctor/.test(lq)) return 'call_doctor';
    if (/call 911|call ambulance|call police/.test(lq)) return 'call_911';
    // Medicines
    if (/next medicine|next dose|next pill/.test(lq)) return 'next_medicine';
    if (/\btake\b|\btook\b|mark taken|already took/.test(lq) && /medicine|pill|tablet/.test(lq)) return 'mark_taken';
    if (/skip/.test(lq) && /medicine|dose|pill/.test(lq)) return 'mark_skipped';
    if (/missed/.test(lq) && /dose|medicine/.test(lq)) return 'missed_medicines';
    if (/all medicines|my medicines|medicine list|what medicine|list medicine|show medicine/.test(lq)) return 'list_medicines';
    if (/refill|running out|low stock|need more medicine/.test(lq)) return 'refill_reminder';
    if (/instruction|how to take/.test(lq)) return 'medicine_instructions';
    if (/side effect/.test(lq)) return 'side_effects';
    if (/restock|order medicine|buy medicine/.test(lq)) return 'restock_medicine';
    if (/medicine|pill|tablet|medication/.test(lq)) return 'today_schedule';
    // Appointments
    if (/book appointment|schedule appointment|make appointment|fix appointment|set appointment/.test(lq)) return 'book_appointment_flow';
    if (/all appointment|upcoming appointment|my appointment|show appointment/.test(lq)) return 'list_appointments';
    if (/appointment|doctor visit|clinic|checkup/.test(lq)) return 'next_appointment';
    // Info
    if (/my doctor|doctor info/.test(lq)) return 'doctor_info';
    if (/caregiver|nurse|helper/.test(lq)) return 'caregiver_info';
    if (/wellness|health score|how am i doing/.test(lq)) return 'wellness_score';
    if (/adherence|compliance/.test(lq)) return 'adherence_rate';
    // Symptoms
    if (/\bpain\b|\bache\b|\bhurt\b|\bsore\b/.test(lq)) return 'report_pain';
    if (/fever|temperature|\bhot\b/.test(lq)) return 'report_fever';
    if (/sad|lonely|depress|unhappy|not feeling well/.test(lq)) return 'emotional_support';
    if (/stress|anxious|worried|nervous/.test(lq)) return 'stress_support';
    // Health tips
    if (/blood pressure|hypertension|\bbp\b/.test(lq)) return 'health_tip_bp';
    if (/blood sugar|\bsugar\b|diabetes|glucose/.test(lq)) return 'health_tip_sugar';
    if (/water|drink|hydrat/.test(lq)) return 'health_tip_water';
    if (/exercise|walk|physio|yoga/.test(lq)) return 'health_tip_exercise';
    if (/sleep|rest|\btired\b|fatigue/.test(lq)) return 'health_tip_sleep';
    if (/\beat\b|food|meal|diet/.test(lq)) return 'health_tip_diet';
    // Time
    if (/schedule|timetable|today plan/.test(lq)) return 'read_schedule';
    if (/\btime\b/.test(lq) && !/medicine|dose/.test(lq)) return 'current_time';
    if (/date|what day|which day/.test(lq)) return 'current_date';
    if (/weather/.test(lq)) return 'weather_tip';
    // Conversation
    if (/\bhello\b|\bhi\b|\bhey\b|good morning|good afternoon|good evening|namaste/.test(lq)) return 'greeting';
    if (/thank/.test(lq)) return 'thanks';
    if (/\bbye\b|goodbye|good night/.test(lq)) return 'goodbye';
    if (/how are you/.test(lq)) return 'how_are_you';
    if (/who are you|your name|what are you/.test(lq)) return 'who_am_i';
    if (/joke|funny/.test(lq)) return 'tell_joke';
    if (/\bhelp\b|what can you|commands|what do you know/.test(lq)) return 'help';
    return 'unknown';
  }

  async handleIntent(intent: string, context: any): Promise<string> {
    const hour = new Date().getHours();
    const g = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = context.profileName?.split(' ')[0] || 'friend';

    switch (intent) {
      case 'greeting': return `${g}, ${name}! I am Cara, your CareDose health assistant. How can I help you today?`;
      case 'who_am_i': return `I am Cara, your CareDose health assistant. I can help with medicines, appointments, emergency alerts, calling caregivers, and much more. Say help to hear all commands.`;
      case 'thanks': return `You are very welcome, ${name}! I am always here for you.`;
      case 'goodbye': return `Take care, ${name}! Remember your medicines. Goodbye!`;
      case 'how_are_you': return `I am ready to help, ${name}! How are you feeling today?`;
      case 'tell_joke': return `Here is a health joke for you: Why did the doctor carry a red pen? In case they needed to draw blood! Stay cheerful, ${name}!`;

      case 'help': return `SHOW_HELP`;

      case 'next_medicine':
        if (context.nextDose) return `Your next medicine is ${context.nextDose.name}, ${context.nextDose.dosage}, at ${context.nextDose.time}.${context.nextDose.foodTiming ? ` Take it ${context.nextDose.foodTiming} food.` : ''}`;
        return 'You have no more medicines today. Well done!';

      case 'list_medicines': case 'today_schedule': {
        if (!context.medicines?.length) return 'No medicines scheduled for today.';
        const pending = context.medicines.filter((m: any) => !m.taken);
        const taken = context.medicines.filter((m: any) => m.taken);
        let r = `You have ${context.medicines.length} medicines today. ${taken.length} taken, ${pending.length} remaining.`;
        if (pending.length) r += ` Still needed: ${pending.slice(0, 3).map((m: any) => m.name).join(', ')}.`;
        return r;
      }

      case 'missed_medicines':
        if (context.missedDoses?.length > 0) {
          const names = context.medicines?.filter((m: any) => context.missedDoses.includes(m.id)).map((m: any) => m.name).join(', ') || 'some medicines';
          return `You missed ${context.missedDoses.length} dose${context.missedDoses.length > 1 ? 's' : ''}: ${names}. Please take them or contact your doctor.`;
        }
        return `No missed medicines today. Great job, ${name}!`;

      case 'read_schedule':
        if (context.medicines?.length > 0) return `Your medicines: ${context.medicines.map((m: any) => `${m.name} ${m.dosage} at ${m.schedule?.join(' and ')}`).join('. ')}.`;
        return 'No medicines scheduled.';

      case 'medicine_instructions':
        if (context.nextDose) return `For ${context.nextDose.name}: take ${context.nextDose.dosage}${context.nextDose.foodTiming ? ` ${context.nextDose.foodTiming} food` : ''}${context.nextDose.instructions ? `. ${context.nextDose.instructions}` : ''}.`;
        return 'Check your medicine list for instructions.';

      case 'side_effects': return `Ask your doctor or pharmacist about side effects for your specific medicines.`;
      case 'restock_medicine': return `RESTOCK_MEDICINE`;

      case 'refill_reminder': {
        const low = context.medicines?.filter((m: any) => m.currentQuantity != null && m.currentQuantity <= (m.schedule?.length || 1) * 5);
        if (low?.length > 0) return `Refill needed: ${low.map((m: any) => `${m.name}, ${m.currentQuantity} tablets left`).join('. ')}. Please contact your caregiver or pharmacy.`;
        return 'Your medicine stock is good. No refills needed right now.';
      }

      case 'next_appointment':
        if (context.appointments?.length > 0) {
          const a = context.appointments[0];
          const d = new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          return `Next appointment: ${d} at ${a.time}${a.doctor ? ` with Dr. ${a.doctor}` : ''}.`;
        }
        return 'No upcoming appointments. Say book appointment to schedule one.';

      case 'list_appointments':
        if (context.appointments?.length > 0) {
          const list = context.appointments.slice(0, 3).map((a: any) =>
            `${a.doctor ? 'Dr. ' + a.doctor : 'Doctor'} on ${new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${a.time}`
          ).join('. ');
          return `${context.appointments.length} upcoming appointment${context.appointments.length > 1 ? 's' : ''}: ${list}.`;
        }
        return 'No upcoming appointments.';

      case 'book_appointment_flow': return 'BOOK_APPOINTMENT_FLOW';

      case 'caregiver_info':
        if (context.caregivers?.length > 0) return `Your caregiver${context.caregivers.length > 1 ? 's' : ''}: ${context.caregivers.map((c: any) => c.name).join(', ')}. Say call caregiver or video caregiver to reach them.`;
        return 'No caregivers connected yet.';

      case 'doctor_info':
        if (context.doctors?.length > 0) return `Your doctor${context.doctors.length > 1 ? 's' : ''}: Dr. ${context.doctors.map((d: any) => d.name).join(', Dr. ')}. Say call doctor or video doctor to reach them.`;
        return 'No doctors connected yet.';

      case 'call_caregiver':
        if (context.caregivers?.length > 0) return `CALL_CAREGIVER:${context.caregivers[0].phone || context.caregivers[0].name}:${context.caregivers[0].name}`;
        return 'No caregivers connected.';

      case 'video_caregiver':
        if (context.caregivers?.length > 0) return `VIDEO_CAREGIVER:${context.caregivers[0].id}:${context.caregivers[0].name}`;
        return 'No caregivers available for video call.';

      case 'call_doctor':
        if (context.doctors?.length > 0) return `CALL_DOCTOR:${context.doctors[0].phone || context.doctors[0].name}:${context.doctors[0].name}`;
        return 'No doctors connected.';

      case 'video_doctor':
        if (context.doctors?.length > 0) return `VIDEO_DOCTOR:${context.doctors[0].id}:${context.doctors[0].name}`;
        return 'No doctors available for video call.';

      case 'call_911': return 'CALL_911';

      case 'mark_taken':
        if (context.nextDose) return `MARK_TAKEN:${context.nextDose.id}:${context.nextDose.time}:${context.nextDose.name}`;
        return 'No pending dose to mark. All medicines for now are done!';

      case 'mark_skipped':
        if (context.nextDose) return `MARK_SKIPPED:${context.nextDose.id}:${context.nextDose.time}:${context.nextDose.name}`;
        return 'No current dose to skip.';

      case 'wellness_score': {
        const s = context.adherenceRate || 0;
        return `Your wellness score is ${s} out of 100. ${s >= 80 ? 'Excellent work!' : s >= 60 ? 'Good. Keep it up!' : 'Let us improve together!'}`;
      }

      case 'adherence_rate': {
        const r = context.adherenceRate || 0;
        return `Your medicine adherence is ${r} percent. ${r >= 90 ? 'Outstanding!' : r >= 70 ? 'Good job!' : 'Try not to miss doses.'}`;
      }

      case 'current_time': return `It is ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.`;
      case 'current_date': return `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;

      case 'report_pain': return `Sorry to hear you are in pain, ${name}. Please rest and contact your caregiver or doctor. Say call caregiver for immediate help.`;
      case 'report_fever': return `A fever needs attention. Please contact your doctor. Say call doctor to reach them now.`;
      case 'emotional_support': return `I hear you, ${name}. You are not alone. Your caregivers and family are here for you. Would you like me to call someone?`;
      case 'stress_support': return `Take a slow breath. Breathe in for 4, hold for 4, out for 4. Your health team is here to support you.`;
      case 'weather_tip': return 'Please check your weather app. Remember to take medicines regardless of the weather!';
      case 'health_tip_bp': return 'For blood pressure: take medicines daily, reduce salt, eat vegetables, and walk gently for 20 minutes.';
      case 'health_tip_sugar': return 'For blood sugar: take medicines on time, eat regular small meals, and avoid sweets.';
      case 'health_tip_water': return 'Drink 6 to 8 glasses of water daily. This helps your medicines work properly!';
      case 'health_tip_exercise': return 'A 20 minute gentle walk daily improves strength, mood, and heart health.';
      case 'health_tip_sleep': return 'Aim for 7 to 8 hours of sleep. A regular bedtime helps your health greatly.';
      case 'health_tip_diet': return 'Eat vegetables, fruits, and whole grains. Avoid excess salt, sugar, and processed food.';

      case 'emergency': return 'EMERGENCY_MODAL';
      case 'emergency_fall': return 'EMERGENCY:fall';
      case 'emergency_pain': return 'EMERGENCY:pain';
      case 'emergency_confusion': return 'EMERGENCY:confusion';
      case 'emergency_bleeding': return 'EMERGENCY:bleeding';
      case 'emergency_breathing': return 'EMERGENCY:breathing';
      case 'emergency_stroke': return 'EMERGENCY:stroke';

      default: return `I did not understand that, ${name}. Say help to hear all the things I can do for you.`;
    }
  }

  async remindWithConfirmation(medicineName: string, dosage: string): Promise<'taken'|'snooze'|'skip'|'no-response'> {
    await this.speak(`Time to take ${medicineName}, ${dosage}. Say yes when done, snooze to remind later, or skip.`);
    const r = await this.listenForResponse(8000);
    if (r === 'timeout' || r === 'error' || r === 'not_supported') return 'no-response';
    const lq = r.toLowerCase();
    if (/yes|took|taken|done/.test(lq)) return 'taken';
    if (/snooze|later|wait/.test(lq)) return 'snooze';
    if (/skip|no\b|not now/.test(lq)) return 'skip';
    return 'no-response';
  }
}

export const speechService = new SpeechService();
