// src/lib/speech.ts - Enhanced voice assistant with 25+ intelligent commands

declare global {
  interface Window { SpeechRecognition: any; webkitSpeechRecognition: any; }
}

class SpeechService {
  private synthesis: SpeechSynthesis | null = null;
  private recognition: any = null;
  private isListening = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.synthesis = window.speechSynthesis;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) { this.recognition = new SR(); this.recognition.lang = 'en-US'; this.recognition.continuous = false; this.recognition.interimResults = false; }
    }
  }

  isSupported(): boolean { return !!this.synthesis && !!this.recognition; }

  async speak(text: string, rate = 0.9): Promise<void> {
    if (!this.synthesis || !text) return;
    this.synthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate; u.pitch = 1.05; u.volume = 1;
      const voices = this.synthesis!.getVoices();
      const preferred = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Samantha') || v.name.includes('Google US English')));
      if (preferred) u.voice = preferred;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      this.synthesis!.speak(u);
    });
  }

  async listenForResponse(timeout = 8000): Promise<string> {
    if (!this.recognition) return 'not_supported';
    if (this.isListening) return 'busy';
    return new Promise((resolve) => {
      this.isListening = true;
      const timer = setTimeout(() => { try { this.recognition.stop(); } catch {} resolve('timeout'); }, timeout);
      this.recognition.onresult = (e: any) => { clearTimeout(timer); this.isListening = false; resolve(e.results[0][0].transcript.trim()); };
      this.recognition.onerror = (e: any) => { clearTimeout(timer); this.isListening = false; resolve(e.error === 'not-allowed' ? 'permission_denied' : 'error'); };
      this.recognition.onend = () => { clearTimeout(timer); this.isListening = false; };
      try { this.recognition.start(); } catch { this.isListening = false; resolve('error'); }
    });
  }

  async askAndListen(prompt: string, timeout = 8000): Promise<{ text: string; error?: string }> {
    await this.speak(prompt);
    await new Promise(r => setTimeout(r, 400));
    const result = await this.listenForResponse(timeout);
    if (result === 'not_supported') return { text: '', error: 'Speech not supported in this browser.' };
    if (result === 'permission_denied') return { text: '', error: 'Microphone permission denied.' };
    if (result === 'timeout' || result === 'error') return { text: '', error: 'I did not catch that. Please try again.' };
    return { text: result };
  }

  processQuery(query: string): string {
    const lq = query.toLowerCase().trim();
    if (!lq) return 'unknown';

    // Emergency
    if (lq.includes('fall') || lq.includes('fell') || lq.includes('fallen')) return 'emergency_fall';
    if (lq.includes('chest pain') || lq.includes('heart attack') || lq.includes('cardiac')) return 'emergency_pain';
    if (lq.includes('confusion') || lq.includes('confused') || lq.includes('dizzy') || lq.includes('faint')) return 'emergency_confusion';
    if (lq.includes('bleeding') || lq.includes('bleed') || lq.includes('blood')) return 'emergency_bleeding';
    if (lq.includes('breath') || lq.includes('choking') || lq.includes('suffocating')) return 'emergency_breathing';
    if (lq.includes('stroke') || lq.includes('paralysis') || lq.includes('face drooping')) return 'emergency_stroke';
    if (lq.includes('emergency') || lq.includes('help me') || lq.includes('sos') || lq.includes('urgent help')) return 'emergency';

    // Calls
    if (lq.includes('call caregiver') || lq.includes('call my caregiver') || lq.includes('ring caregiver')) return 'call_caregiver';
    if (lq.includes('video caregiver') || lq.includes('video call caregiver')) return 'video_caregiver';
    if (lq.includes('call doctor') || lq.includes('call my doctor') || lq.includes('ring doctor')) return 'call_doctor';
    if (lq.includes('video doctor') || lq.includes('video call doctor')) return 'video_doctor';
    if (lq.includes('call 911') || lq.includes('call ambulance') || lq.includes('call police')) return 'call_911';
    if (lq.includes('call family') || lq.includes('call relative') || lq.includes('call son') || lq.includes('call daughter')) return 'call_family';

    // Medicines
    if (lq.includes('next medicine') || lq.includes('next dose') || lq.includes('next pill')) return 'next_medicine';
    if (lq.includes('take medicine') || lq.includes('took my') || lq.includes('mark taken') || lq.includes('i took') || lq.includes('already took')) return 'mark_taken';
    if (lq.includes('skip') && (lq.includes('medicine') || lq.includes('dose') || lq.includes('pill'))) return 'mark_skipped';
    if (lq.includes('missed') && (lq.includes('dose') || lq.includes('medicine'))) return 'missed_medicines';
    if (lq.includes('all medicines') || lq.includes('my medicines') || lq.includes('medicine list') || lq.includes('what medicines') || lq.includes('list my')) return 'list_medicines';
    if (lq.includes('medicine') || lq.includes('pill') || lq.includes('tablet') || lq.includes('medication') || lq.includes('drug')) return 'today_schedule';
    if (lq.includes('refill') || lq.includes('running out') || lq.includes('low stock') || lq.includes('need more medicine')) return 'refill_reminder';
    if (lq.includes('instruction') || lq.includes('how to take') || lq.includes('dosage')) return 'medicine_instructions';
    if (lq.includes('side effect') || lq.includes('reaction')) return 'side_effects';
    if (lq.includes('restock') || lq.includes('order medicine') || lq.includes('buy medicine')) return 'restock_medicine';

    // Appointments
    if (lq.includes('book appointment') || lq.includes('schedule appointment') || lq.includes('make appointment') || lq.includes('fix appointment')) return 'book_appointment_flow';
    if (lq.includes('cancel appointment') || lq.includes('reschedule')) return 'cancel_appointment';
    if (lq.includes('appointment') || lq.includes('doctor visit') || lq.includes('clinic') || lq.includes('checkup')) return 'next_appointment';
    if (lq.includes('all appointments') || lq.includes('upcoming appointments') || lq.includes('my appointments')) return 'list_appointments';

    // Health info
    if (lq.includes('caregiver') || lq.includes('nurse') || lq.includes('helper')) return 'caregiver_info';
    if (lq.includes('doctor info') || lq.includes('my doctor') || lq.includes('doctor details')) return 'doctor_info';
    if (lq.includes('wellness') || lq.includes('health score') || lq.includes('my score') || lq.includes('how am i doing')) return 'wellness_score';
    if (lq.includes('adherence') || lq.includes('compliance') || lq.includes('how many did i take')) return 'adherence_rate';

    // Time / Date
    if (lq.includes('time') && !lq.includes('medicine') && !lq.includes('dose')) return 'current_time';
    if (lq.includes('date') || lq.includes('today is') || lq.includes('what day') || lq.includes('which day')) return 'current_date';
    if (lq.includes('weather')) return 'weather_tip';

    // Health tips
    if (lq.includes('blood pressure') || lq.includes('hypertension') || lq.includes('bp')) return 'health_tip_bp';
    if (lq.includes('blood sugar') || lq.includes('sugar') || lq.includes('diabetes') || lq.includes('glucose')) return 'health_tip_sugar';
    if (lq.includes('water') || lq.includes('drink') || lq.includes('hydrat') || lq.includes('thirsty')) return 'health_tip_water';
    if (lq.includes('exercise') || lq.includes('walk') || lq.includes('physio') || lq.includes('yoga')) return 'health_tip_exercise';
    if (lq.includes('sleep') || lq.includes('rest') || lq.includes('tired') || lq.includes('fatigue')) return 'health_tip_sleep';
    if (lq.includes('eat') || lq.includes('food') || lq.includes('meal') || lq.includes('diet')) return 'health_tip_diet';
    if (lq.includes('pain') || lq.includes('ache') || lq.includes('hurt') || lq.includes('sore')) return 'report_pain';
    if (lq.includes('fever') || lq.includes('temperature') || lq.includes('hot')) return 'report_fever';
    if (lq.includes('sad') || lq.includes('lonely') || lq.includes('depressed') || lq.includes('unhappy') || lq.includes('not feeling well')) return 'emotional_support';
    if (lq.includes('stress') || lq.includes('anxious') || lq.includes('worried') || lq.includes('nervous')) return 'stress_support';

    // Conversational
    if (lq.includes('schedule') || lq.includes('timetable') || lq.includes('today plan')) return 'read_schedule';
    if (lq.includes('remind') || lq.includes('reminder') || lq.includes('alert')) return 'set_reminder';
    if (lq.includes('hello') || lq.includes('hi') || lq.includes('hey') || lq.includes('good morning') || lq.includes('good afternoon') || lq.includes('good evening') || lq.includes('namaste')) return 'greeting';
    if (lq.includes('thank') || lq.includes('thanks') || lq.includes('thank you')) return 'thanks';
    if (lq.includes('bye') || lq.includes('goodbye') || lq.includes('see you') || lq.includes('good night')) return 'goodbye';
    if (lq.includes('how are you') || lq.includes('are you okay')) return 'how_are_you';
    if (lq.includes('who are you') || lq.includes('your name') || lq.includes('what are you')) return 'who_am_i';
    if (lq.includes('joke') || lq.includes('funny') || lq.includes('laugh')) return 'tell_joke';
    if (lq.includes('help') || lq.includes('what can you do') || lq.includes('commands') || lq.includes('what do you know')) return 'help';

    return 'unknown';
  }

  async handleIntent(intent: string, context: any): Promise<string> {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const name = context.profileName?.split(' ')[0] || 'friend';

    switch (intent) {
      case 'greeting': return `${greeting} ${name}! I'm Cara, your personal health assistant. How can I help you today?`;
      case 'who_am_i': return `I'm Cara, your CareDose health assistant! I can help you with medicines, appointments, emergency alerts, and much more. Say "help" to hear everything I can do.`;
      case 'thanks': return `You're very welcome, ${name}! I'm always here for you. Take care!`;
      case 'goodbye': return `Take good care, ${name}! Remember to take your medicines on time. Goodbye and stay healthy!`;
      case 'how_are_you': return `I'm doing great and ready to help, ${name}! More importantly, how are you feeling today?`;
      case 'tell_joke': return `Here's one for you: Why did the medicine go to school? Because it wanted to improve its dose! 😄 Stay cheerful, ${name}!`;

      case 'next_medicine':
        if (context.nextDose) {
          return `Your next medicine is ${context.nextDose.name}, ${context.nextDose.dosage}, scheduled at ${context.nextDose.time}.${context.nextDose.foodTiming ? ` Take it ${context.nextDose.foodTiming} food.` : ''}`;
        }
        return 'You have no more medicines scheduled for today. Great job staying on track!';

      case 'list_medicines':
      case 'today_schedule': {
        if (!context.medicines?.length) return 'You have no medicines scheduled for today.';
        const pending = context.medicines.filter((m: any) => !m.taken);
        const taken = context.medicines.filter((m: any) => m.taken);
        let resp = `You have ${context.medicines.length} medicines today. ${taken.length} taken, ${pending.length} still needed.`;
        if (pending.length > 0) resp += ` Remaining medicines: ${pending.slice(0, 4).map((m: any) => m.name).join(', ')}.`;
        return resp;
      }

      case 'missed_medicines':
        if (context.missedDoses?.length > 0) {
          const names = context.medicines?.filter((m: any) => context.missedDoses.includes(m.id)).map((m: any) => m.name).join(', ') || 'some medicines';
          return `You have ${context.missedDoses.length} missed dose${context.missedDoses.length > 1 ? 's' : ''}: ${names}. Please take them now if it's not too late, or contact your doctor.`;
        }
        return `Great news! You haven't missed any medicines today. Keep it up, ${name}!`;

      case 'read_schedule':
        if (context.medicines?.length > 0) {
          const schedule = context.medicines.map((m: any) => `${m.name} ${m.dosage} at ${m.schedule?.join(' and ')}`).join('. ');
          return `Your medicine schedule today: ${schedule}.`;
        }
        return 'No medicines scheduled for today.';

      case 'medicine_instructions':
        if (context.nextDose) return `For ${context.nextDose.name}: take ${context.nextDose.dosage}${context.nextDose.foodTiming ? ` ${context.nextDose.foodTiming} food` : ''}${context.nextDose.instructions ? `. ${context.nextDose.instructions}` : ''}.`;
        return 'Please check your medicine list for detailed instructions on each medicine.';

      case 'side_effects': return `For information about side effects, please ask your doctor or pharmacist. They know your specific medicines best.`;

      case 'refill_reminder': {
        const lowStock = context.medicines?.filter((m: any) => m.currentQuantity != null && m.currentQuantity <= (m.schedule?.length || 1) * 5);
        if (lowStock?.length > 0) return `You need to refill: ${lowStock.map((m: any) => `${m.name} (${m.currentQuantity} tablets left)`).join(', ')}. Please contact your caregiver or pharmacy.`;
        return 'Your medicine stock looks good! No refills needed right now.';
      }

      case 'restock_medicine': return `RESTOCK_MEDICINE`;

      case 'next_appointment':
        if (context.appointments?.length > 0) {
          const a = context.appointments[0];
          const d = new Date(a.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          return `Your next appointment is on ${d} at ${a.time}${a.doctor ? ` with Dr. ${a.doctor}` : ''}${a.location ? ` at ${a.location}` : ''}.`;
        }
        return 'You have no upcoming appointments. Would you like to schedule one?';

      case 'list_appointments':
        if (context.appointments?.length > 0) {
          const apts = context.appointments.slice(0, 3).map((a: any) => `${a.doctor || 'Doctor'} on ${new Date(a.date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})} at ${a.time}`).join(', ');
          return `You have ${context.appointments.length} upcoming appointment${context.appointments.length > 1 ? 's' : ''}: ${apts}.`;
        }
        return 'No upcoming appointments. Would you like to book one?';

      case 'book_appointment_flow': return 'BOOK_APPOINTMENT';
      case 'cancel_appointment': return 'CANCEL_APPOINTMENT';

      case 'caregiver_info':
        if (context.caregivers?.length > 0) {
          const names = context.caregivers.map((c: any) => c.name).join(' and ');
          return `Your caregiver${context.caregivers.length > 1 ? 's are' : ' is'}: ${names}. Say "call caregiver" to call them or "video caregiver" for a video call.`;
        }
        return 'You have no caregivers connected yet. Please ask someone to connect with you through the app.';

      case 'doctor_info':
        if (context.doctors?.length > 0) {
          return `Your doctor${context.doctors.length > 1 ? 's are' : ' is'} Dr. ${context.doctors.map((d: any) => d.name).join(' and Dr. ')}. Say "call doctor" or "video doctor" to reach them.`;
        }
        return 'No doctors connected yet.';

      case 'call_caregiver':
        if (context.caregivers?.length > 0) return `CALL_CAREGIVER:${context.caregivers[0].phone || context.caregivers[0].name}`;
        return 'You have no caregivers connected to call.';

      case 'video_caregiver':
        if (context.caregivers?.length > 0) return `VIDEO_CAREGIVER:${context.caregivers[0].id}`;
        return 'You have no caregivers connected for a video call.';

      case 'call_doctor':
        if (context.doctors?.length > 0) return `CALL_DOCTOR:${context.doctors[0].phone || context.doctors[0].name}`;
        return 'You have no doctors connected to call.';

      case 'video_doctor':
        if (context.doctors?.length > 0) return `VIDEO_DOCTOR:${context.doctors[0].id}`;
        return 'You have no doctors connected for a video call.';

      case 'call_911': return 'CALL_911';
      case 'call_family': return 'CALL_FAMILY';

      case 'mark_taken':
        if (context.nextDose) return `MARK_TAKEN:${context.nextDose.id}:${context.nextDose.time}`;
        return 'No pending medicine dose found. All medicines for now are taken!';

      case 'mark_skipped':
        if (context.nextDose) return `MARK_SKIPPED:${context.nextDose.id}:${context.nextDose.time}`;
        return 'No current dose to skip.';

      case 'wellness_score': {
        const score = Math.round((context.adherenceRate || 0) * 0.6 + (context.missedDoses?.length === 0 ? 40 : 20));
        return `Your wellness score is ${score} out of 100. ${score >= 80 ? 'Excellent work!' : score >= 60 ? 'You\'re doing well. Keep it up!' : 'Let\'s work on improving together!'}`;
      }

      case 'adherence_rate': {
        const rate = context.adherenceRate || 0;
        return `Your medicine adherence rate is ${rate}%. ${rate >= 90 ? 'Outstanding!' : rate >= 70 ? 'Good. Try not to miss doses.' : 'You have room to improve. Set reminders to help!'}`;
      }

      case 'current_time': return `The current time is ${new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}.`;
      case 'current_date': return `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
      case 'set_reminder': return 'Your medicine reminders are set automatically based on your schedule. I will alert you when it is time to take each dose.';

      case 'report_pain': return `I'm sorry you're in pain, ${name}. Please rest and contact your caregiver or doctor. Say "call caregiver" if you need immediate help.`;
      case 'report_fever': return `A fever needs attention. Please check your temperature and contact your doctor or caregiver. Say "call doctor" to reach them now.`;
      case 'emotional_support': return `I hear you, ${name}. It's okay to feel that way. You are not alone — your caregivers and family are here for you. Would you like me to call someone?`;
      case 'stress_support': return `Take a slow, deep breath with me. Breathe in for 4 counts, hold for 4, breathe out for 4. Your health team is here to support you, ${name}.`;
      case 'weather_tip': return 'Please check a weather app or ask someone nearby. Remember to dress appropriately and take your medicines even on bad weather days!';

      case 'health_tip_bp': return 'For healthy blood pressure: take your medicines every day, reduce salt, eat vegetables, avoid stress, and walk gently for 20 minutes.';
      case 'health_tip_sugar': return 'For blood sugar: take medicines on time, eat regular small meals, avoid sweets and white rice, and check your sugar as your doctor advises.';
      case 'health_tip_water': return `Drinking 6 to 8 glasses of water daily is very important, ${name}. Staying hydrated helps your medicines work properly!`;
      case 'health_tip_exercise': return 'Light exercise like a 20-minute walk daily improves strength, mood, and heart health. Start slowly and listen to your body.';
      case 'health_tip_sleep': return 'Good sleep is medicine! Try to sleep 7 to 8 hours at the same time each night. Avoid screens before bedtime.';
      case 'health_tip_diet': return 'Eat plenty of vegetables, fruits, and whole grains. Avoid processed food, excess salt, and sugar. Eat on time and in moderate amounts.';

      case 'emergency': return 'EMERGENCY_MODAL';
      case 'emergency_fall': return 'EMERGENCY_FALL';
      case 'emergency_pain': return 'EMERGENCY_PAIN';
      case 'emergency_confusion': return 'EMERGENCY_CONFUSION';
      case 'emergency_bleeding': return 'EMERGENCY_BLEEDING';
      case 'emergency_breathing': return 'EMERGENCY_BREATHING';
      case 'emergency_stroke': return 'EMERGENCY_STROKE';

      case 'help': return `I'm Cara, your health assistant! I can: check medicines and doses, mark medicine as taken, tell your next appointment, call your caregiver or doctor, start a video call, send an emergency alert, give health tips, track adherence, remind about refills, answer health questions, and much more! Just talk to me naturally.`;

      default: return `I didn't quite understand that, ${name}. You can ask me about your medicines, appointments, or say "help" for a full list of things I can do!`;
    }
  }

  async remindWithConfirmation(medicineName: string, dosage: string): Promise<'taken' | 'snooze' | 'skip' | 'no-response'> {
    await this.speak(`${medicineName}, ${dosage}. Did you take it? Say yes, snooze, or skip.`);
    const response = await this.listenForResponse(8000);
    if (response === 'timeout' || response === 'error') return 'no-response';
    const lq = response.toLowerCase();
    if (lq.includes('yes') || lq.includes('took') || lq.includes('taken') || lq.includes('done')) return 'taken';
    if (lq.includes('snooze') || lq.includes('later') || lq.includes('wait') || lq.includes('few minutes')) return 'snooze';
    if (lq.includes('skip') || lq.includes('no') || lq.includes('not now') || lq.includes('cannot')) return 'skip';
    return 'no-response';
  }
}

export const speechService = new SpeechService();
