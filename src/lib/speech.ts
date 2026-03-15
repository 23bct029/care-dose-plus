// src/lib/speech.ts - Voice assistant with 25+ commands, reliable recognition

declare global {
  interface Window { SpeechRecognition: any; webkitSpeechRecognition: any; }
}

class SpeechService {
  private synthesis: SpeechSynthesis | null = null;
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
    }
  }

  isSupported(): boolean {
    return !!this.synthesis && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  async speak(text: string, rate = 0.92): Promise<void> {
    if (!this.synthesis || !text) return;
    this.synthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate; u.pitch = 1.05; u.volume = 1;
      // Pick a good English voice
      const voices = this.synthesis!.getVoices();
      const preferred = voices.find(v =>
        v.lang.startsWith('en') &&
        (v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Google UK') || v.name.includes('Google US'))
      ) || voices.find(v => v.lang.startsWith('en'));
      if (preferred) u.voice = preferred;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      this.synthesis!.speak(u);
    });
  }

  // Create a fresh SpeechRecognition instance each call (fixes "already started" errors)
  private createRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = 'en-IN'; // Better for Indian English accents
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 3;
    return r;
  }

  async listenForResponse(timeout = 8000): Promise<string> {
    if (!this.isSupported()) return 'not_supported';
    if (this.isListening) return 'busy';
    const recognition = this.createRecognition();
    if (!recognition) return 'not_supported';

    return new Promise((resolve) => {
      this.isListening = true;
      const timer = setTimeout(() => {
        this.isListening = false;
        try { recognition.stop(); } catch {}
        resolve('timeout');
      }, timeout);

      recognition.onresult = (e: any) => {
        clearTimeout(timer);
        this.isListening = false;
        const transcript = e.results[0][0].transcript.trim();
        resolve(transcript);
      };
      recognition.onerror = (e: any) => {
        clearTimeout(timer);
        this.isListening = false;
        if (e.error === 'not-allowed' || e.error === 'permission-denied') resolve('permission_denied');
        else if (e.error === 'no-speech') resolve('timeout');
        else resolve('error');
      };
      recognition.onend = () => {
        clearTimeout(timer);
        this.isListening = false;
      };

      try { recognition.start(); }
      catch (err) {
        this.isListening = false;
        clearTimeout(timer);
        resolve('error');
      }
    });
  }

  async askAndListen(prompt: string, timeout = 8000): Promise<{ text: string; error?: string }> {
    await this.speak(prompt);
    await new Promise(r => setTimeout(r, 500));
    const result = await this.listenForResponse(timeout);
    if (result === 'not_supported') return { text: '', error: 'Speech not supported in this browser.' };
    if (result === 'permission_denied') return { text: '', error: 'Microphone permission denied. Please allow it in browser settings.' };
    if (result === 'timeout') return { text: '', error: 'I did not hear anything. Please speak clearly and try again.' };
    if (result === 'error') return { text: '', error: 'Could not hear clearly. Please try again.' };
    return { text: result };
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
    if (/stroke|paralysis|face drop/.test(lq)) return 'emergency_stroke';
    if (/emergency|help me|sos|urgent/.test(lq)) return 'emergency';

    // Calls
    if (/video.*caregiver|caregiver.*video/.test(lq)) return 'video_caregiver';
    if (/video.*doctor|doctor.*video/.test(lq)) return 'video_doctor';
    if (/call.*caregiver|caregiver.*call|ring.*caregiver/.test(lq)) return 'call_caregiver';
    if (/call.*doctor|doctor.*call|ring.*doctor/.test(lq)) return 'call_doctor';
    if (/call 911|ambulance|police/.test(lq)) return 'call_911';
    if (/call family|call son|call daughter|call relative/.test(lq)) return 'call_family';

    // Medicines
    if (/next medicine|next dose|next pill/.test(lq)) return 'next_medicine';
    if (/took|take|taken|mark taken|already took|i took/.test(lq) && /medicine|pill|tablet/.test(lq)) return 'mark_taken';
    if (/skip/.test(lq) && /medicine|dose|pill/.test(lq)) return 'mark_skipped';
    if (/missed/.test(lq) && /dose|medicine/.test(lq)) return 'missed_medicines';
    if (/all medicines|my medicines|medicine list|what medicine|list medicine/.test(lq)) return 'list_medicines';
    if (/refill|running out|low stock|need more medicine/.test(lq)) return 'refill_reminder';
    if (/instruction|how to take|dosage/.test(lq)) return 'medicine_instructions';
    if (/side effect|reaction/.test(lq)) return 'side_effects';
    if (/restock|order medicine|buy medicine/.test(lq)) return 'restock_medicine';
    if (/medicine|pill|tablet|medication/.test(lq)) return 'today_schedule';

    // Appointments
    if (/book appointment|schedule appointment|make appointment|fix appointment|set appointment/.test(lq)) return 'book_appointment_flow';
    if (/cancel appointment|reschedule/.test(lq)) return 'cancel_appointment';
    if (/all appointment|upcoming appointment|my appointment/.test(lq)) return 'list_appointments';
    if (/appointment|doctor visit|clinic|checkup/.test(lq)) return 'next_appointment';

    // Health info
    if (/my doctor|doctor info|doctor detail/.test(lq)) return 'doctor_info';
    if (/caregiver|nurse|helper/.test(lq)) return 'caregiver_info';
    if (/wellness|health score|my score|how am i doing/.test(lq)) return 'wellness_score';
    if (/adherence|compliance|how many did i take/.test(lq)) return 'adherence_rate';

    // Symptoms
    if (/pain|ache|hurt|sore/.test(lq)) return 'report_pain';
    if (/fever|temperature|hot/.test(lq)) return 'report_fever';
    if (/sad|lonely|depress|unhappy|not feeling well/.test(lq)) return 'emotional_support';
    if (/stress|anxious|worried|nervous/.test(lq)) return 'stress_support';

    // Health tips
    if (/blood pressure|hypertension|\bbp\b/.test(lq)) return 'health_tip_bp';
    if (/blood sugar|sugar|diabetes|glucose/.test(lq)) return 'health_tip_sugar';
    if (/water|drink|hydrat|thirsty/.test(lq)) return 'health_tip_water';
    if (/exercise|walk|physio|yoga/.test(lq)) return 'health_tip_exercise';
    if (/sleep|rest|tired|fatigue/.test(lq)) return 'health_tip_sleep';
    if (/eat|food|meal|diet/.test(lq)) return 'health_tip_diet';

    // Schedule / time
    if (/schedule|timetable|today plan/.test(lq)) return 'read_schedule';
    if (/remind|reminder|alert/.test(lq)) return 'set_reminder';
    if (/time/.test(lq) && !/medicine|dose/.test(lq)) return 'current_time';
    if (/date|today is|what day|which day/.test(lq)) return 'current_date';
    if (/weather/.test(lq)) return 'weather_tip';

    // Conversation
    if (/hello|hi\b|hey|good morning|good afternoon|good evening|namaste/.test(lq)) return 'greeting';
    if (/thank/.test(lq)) return 'thanks';
    if (/bye|goodbye|see you|good night/.test(lq)) return 'goodbye';
    if (/how are you|are you okay/.test(lq)) return 'how_are_you';
    if (/who are you|your name|what are you/.test(lq)) return 'who_am_i';
    if (/joke|funny|laugh/.test(lq)) return 'tell_joke';
    if (/help|what can you|commands|what do you know/.test(lq)) return 'help';

    return 'unknown';
  }

  async handleIntent(intent: string, context: any): Promise<string> {
    const hour = new Date().getHours();
    const g = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = context.profileName?.split(' ')[0] || 'friend';

    switch (intent) {
      case 'greeting': return `${g}, ${name}! I'm Cara, your health assistant. How can I help you?`;
      case 'who_am_i': return `I'm Cara, your CareDose health assistant. I can help with medicines, appointments, emergency alerts, and much more. Say "help" to hear all commands.`;
      case 'thanks': return `You're very welcome, ${name}! I'm always here for you.`;
      case 'goodbye': return `Take care, ${name}! Remember your medicines. Goodbye!`;
      case 'how_are_you': return `I'm ready to help, ${name}! How are you feeling today?`;
      case 'tell_joke': return `Why do nurses carry red crayons? In case they need to draw blood! 😄 Stay cheerful!`;

      case 'next_medicine':
        if (context.nextDose) return `Next medicine: ${context.nextDose.name}, ${context.nextDose.dosage}, at ${context.nextDose.time}.${context.nextDose.foodTiming ? ` Take ${context.nextDose.foodTiming} food.` : ''}`;
        return 'No more medicines today. Well done!';

      case 'list_medicines': case 'today_schedule': {
        if (!context.medicines?.length) return 'No medicines scheduled today.';
        const pending = context.medicines.filter((m: any) => !m.taken);
        const taken = context.medicines.filter((m: any) => m.taken);
        return `${context.medicines.length} medicines today. ${taken.length} taken, ${pending.length} remaining.${pending.length ? ` Remaining: ${pending.slice(0, 3).map((m: any) => m.name).join(', ')}.` : ''}`;
      }

      case 'missed_medicines':
        if (context.missedDoses?.length > 0) {
          const names = context.medicines?.filter((m: any) => context.missedDoses.includes(m.id)).map((m: any) => m.name).join(', ') || 'some medicines';
          return `${context.missedDoses.length} missed dose${context.missedDoses.length > 1 ? 's' : ''}: ${names}. Contact your doctor if needed.`;
        }
        return `No missed medicines today. Great job, ${name}!`;

      case 'read_schedule':
        if (context.medicines?.length > 0) return `Your medicines: ${context.medicines.map((m: any) => `${m.name} ${m.dosage} at ${m.schedule?.join(' and ')}`).join(', ')}.`;
        return 'No medicines scheduled.';

      case 'medicine_instructions':
        if (context.nextDose) return `For ${context.nextDose.name}: ${context.nextDose.dosage}${context.nextDose.foodTiming ? ` ${context.nextDose.foodTiming} food` : ''}${context.nextDose.instructions ? `. ${context.nextDose.instructions}` : ''}.`;
        return 'Check your medicine list for instructions.';

      case 'side_effects': return `Ask your doctor or pharmacist about side effects for your specific medicines.`;
      case 'restock_medicine': return `RESTOCK_MEDICINE`;

      case 'refill_reminder': {
        const low = context.medicines?.filter((m: any) => m.currentQuantity != null && m.currentQuantity <= (m.schedule?.length || 1) * 5);
        if (low?.length > 0) return `Refill needed: ${low.map((m: any) => `${m.name} (${m.currentQuantity} tablets left)`).join(', ')}. Contact your caregiver or pharmacy.`;
        return 'Medicine stock is good. No refills needed now.';
      }

      case 'next_appointment':
        if (context.appointments?.length > 0) {
          const a = context.appointments[0];
          const d = new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          return `Next appointment: ${d} at ${a.time}${a.doctor ? ` with Dr. ${a.doctor}` : ''}.`;
        }
        return 'No upcoming appointments. Say "book appointment" to schedule one.';

      case 'list_appointments':
        if (context.appointments?.length > 0) {
          const list = context.appointments.slice(0, 3).map((a: any) => `${a.doctor ? 'Dr. ' + a.doctor : 'Doctor'} on ${new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${a.time}`).join(', ');
          return `${context.appointments.length} appointment${context.appointments.length > 1 ? 's' : ''}: ${list}.`;
        }
        return 'No upcoming appointments.';

      case 'book_appointment_flow': return 'BOOK_APPOINTMENT';
      case 'cancel_appointment': return 'To cancel an appointment, please open the Schedule page or ask your caregiver.';

      case 'caregiver_info':
        if (context.caregivers?.length > 0) return `Your caregiver${context.caregivers.length > 1 ? 's' : ''}: ${context.caregivers.map((c: any) => c.name).join(', ')}. Say "call caregiver" to call them.`;
        return 'No caregivers connected yet.';

      case 'doctor_info':
        if (context.doctors?.length > 0) return `Your doctor${context.doctors.length > 1 ? 's' : ''}: Dr. ${context.doctors.map((d: any) => d.name).join(', Dr. ')}. Say "call doctor" to reach them.`;
        return 'No doctors connected yet.';

      case 'call_caregiver':
        if (context.caregivers?.length > 0) return `CALL_CAREGIVER:${context.caregivers[0].phone || context.caregivers[0].name}`;
        return 'No caregivers connected.';

      case 'video_caregiver':
        if (context.caregivers?.length > 0) return `VIDEO_CAREGIVER:${context.caregivers[0].id}`;
        return 'No caregivers to video call.';

      case 'call_doctor':
        if (context.doctors?.length > 0) return `CALL_DOCTOR:${context.doctors[0].phone || context.doctors[0].name}`;
        return 'No doctors connected.';

      case 'video_doctor':
        if (context.doctors?.length > 0) return `VIDEO_DOCTOR:${context.doctors[0].id}`;
        return 'No doctors to video call.';

      case 'call_911': return 'CALL_911';
      case 'call_family': return 'Please use the caregivers section to call a family member.';

      case 'mark_taken':
        if (context.nextDose) return `MARK_TAKEN:${context.nextDose.id}:${context.nextDose.time}`;
        return 'No pending dose found. All medicines are taken!';

      case 'mark_skipped':
        if (context.nextDose) return `MARK_SKIPPED:${context.nextDose.id}:${context.nextDose.time}`;
        return 'No current dose to skip.';

      case 'wellness_score': {
        const s = context.adherenceRate || 0;
        return `Wellness score: ${s} out of 100. ${s >= 80 ? 'Excellent!' : s >= 60 ? 'Good. Keep it up!' : 'Let\'s improve together!'}`;
      }

      case 'adherence_rate': {
        const r = context.adherenceRate || 0;
        return `Medicine adherence: ${r}%. ${r >= 90 ? 'Outstanding!' : r >= 70 ? 'Good job!' : 'Try not to miss doses.'}`;
      }

      case 'current_time': return `It is ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.`;
      case 'current_date': return `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
      case 'set_reminder': return 'Your medicine reminders are set automatically. I will alert you when it is time for each dose.';

      case 'report_pain': return `Sorry to hear you are in pain, ${name}. Rest and contact your caregiver or doctor. Say "call caregiver" for immediate help.`;
      case 'report_fever': return `A fever needs attention. Please check your temperature and contact your doctor. Say "call doctor" to reach them.`;
      case 'emotional_support': return `I hear you, ${name}. You are not alone — your caregivers and family are here for you. Would you like me to call someone?`;
      case 'stress_support': return `Take a slow breath: in for 4, hold for 4, out for 4. Your health team is here to support you.`;
      case 'weather_tip': return 'Check your weather app. Remember to take medicines regardless of the weather!';

      case 'health_tip_bp': return 'For blood pressure: take medicines daily, reduce salt, eat vegetables, and walk gently 20 minutes.';
      case 'health_tip_sugar': return 'For blood sugar: take medicines on time, eat regular small meals, and avoid sweets.';
      case 'health_tip_water': return 'Drink 6 to 8 glasses of water daily. Hydration helps medicines work properly!';
      case 'health_tip_exercise': return 'A 20-minute gentle walk daily improves strength, mood, and heart health.';
      case 'health_tip_sleep': return 'Aim for 7 to 8 hours of sleep. A regular bedtime helps your health greatly.';
      case 'health_tip_diet': return 'Eat vegetables, fruits, and whole grains. Avoid excess salt, sugar, and processed food.';

      case 'emergency': return 'EMERGENCY_MODAL';
      case 'emergency_fall': return 'EMERGENCY_FALL';
      case 'emergency_pain': return 'EMERGENCY_PAIN';
      case 'emergency_confusion': return 'EMERGENCY_CONFUSION';
      case 'emergency_bleeding': return 'EMERGENCY_BLEEDING';
      case 'emergency_breathing': return 'EMERGENCY_BREATHING';
      case 'emergency_stroke': return 'EMERGENCY_STROKE';

      case 'help': return `I'm Cara! I can: check your medicines and next dose, mark medicine as taken, tell your appointments, book appointments, call or video your caregiver or doctor, send emergency alerts, give health tips, track adherence, remind about refills, and much more! Just speak naturally.`;

      default: return `I didn't catch that, ${name}. Try asking about your medicines, appointments, or say "help" for all commands.`;
    }
  }

  async remindWithConfirmation(medicineName: string, dosage: string): Promise<'taken'|'snooze'|'skip'|'no-response'> {
    await this.speak(`Time to take ${medicineName}, ${dosage}. Did you take it? Say yes, snooze, or skip.`);
    const r = await this.listenForResponse(8000);
    if (r === 'timeout' || r === 'error' || r === 'not_supported') return 'no-response';
    const lq = r.toLowerCase();
    if (/yes|took|taken|done/.test(lq)) return 'taken';
    if (/snooze|later|wait|few minutes/.test(lq)) return 'snooze';
    if (/skip|no\b|not now|cannot/.test(lq)) return 'skip';
    return 'no-response';
  }
}

export const speechService = new SpeechService();
