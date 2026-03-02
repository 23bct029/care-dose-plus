// src/lib/speech.ts
class SpeechService {
  private synthesis: SpeechSynthesis;
  private recognition: any;
  private isListening = false;
  private voices: SpeechSynthesisVoice[] = [];
  private preferredVoice: SpeechSynthesisVoice | null = null;

  constructor() {
    this.synthesis = window.speechSynthesis;
    
    // Load voices
    if (this.synthesis) {
      if (this.synthesis.getVoices().length > 0) {
        this.voices = this.synthesis.getVoices();
        this.setPreferredVoice();
      } else {
        this.synthesis.addEventListener('voiceschanged', () => {
          this.voices = this.synthesis.getVoices();
          this.setPreferredVoice();
        });
      }
    }
    
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window) {
      this.recognition = new (window as any).webkitSpeechRecognition();
      this.setupRecognition();
    } else if ('SpeechRecognition' in window) {
      this.recognition = new (window as any).SpeechRecognition();
      this.setupRecognition();
    }
  }

  private setupRecognition() {
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 3;
  }

  private setPreferredVoice() {
    // Prefer female voices for elderly (clearer, more comforting)
    this.preferredVoice = this.voices.find(v => 
      (v.name.includes('Google UK') || 
       v.name.includes('Samantha') || 
       v.name.includes('Female') ||
       v.name.includes('Moira') ||
       v.name.includes('Tessa') ||
       v.name.includes('Veena') ||
       v.name.includes('Zira')) &&
      v.lang.startsWith('en')
    ) || null;

    // If no female voice, use any clear English voice
    if (!this.preferredVoice) {
      this.preferredVoice = this.voices.find(v => 
        (v.name.includes('Google') || 
         v.name.includes('Microsoft')) &&
        v.lang.startsWith('en')
      ) || this.voices[0] || null;
    }
  }

  // Speak text with elderly-friendly settings
  speak(text: string, rate: number = 0.85, pitch: number = 1.1): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synthesis) {
        console.log('Speech synthesis not supported. Would say:', text);
        resolve();
        return;
      }

      // Cancel any ongoing speech
      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate; // Slower for elderly
      utterance.pitch = pitch; // Slightly higher pitch for clarity
      utterance.volume = 1;
      utterance.lang = 'en-US';
      
      if (this.preferredVoice) {
        utterance.voice = this.preferredVoice;
      }
      
      utterance.onend = () => resolve();
      utterance.onerror = (event) => {
        console.error('Speech error:', event.error);
        reject(event.error);
      };
      
      this.synthesis.speak(utterance);
    });
  }

  // Medicine reminder with confirmation
  async remindWithConfirmation(medicineName: string, dosage: string): Promise<'taken' | 'snooze' | 'skip' | 'no-response'> {
    const reminder = `Hello! It's time to take your medicine: ${medicineName}, ${dosage}. Please take it now.`;
    await this.speak(reminder, 0.85, 1.1);
    
    // Wait a moment then ask for confirmation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const question = 'Have you taken your medicine? Please say yes, snooze, or skip.';
    await this.speak(question, 0.9, 1.1);
    
    // Listen for response
    const response = await this.listenForResponse(10000); // 10 second timeout
    
    if (response.includes('yes') || response.includes('taken') || response.includes('took')) {
      await this.speak('Thank you for taking your medicine. Stay healthy!', 0.9, 1.1);
      return 'taken';
    } else if (response.includes('snooze') || response.includes('later')) {
      await this.speak("I'll remind you again in 10 minutes.", 0.9, 1.1);
      return 'snooze';
    } else if (response.includes('skip')) {
      await this.speak("I'll mark this dose as skipped. Please contact your doctor if you have concerns.", 0.9, 1.1);
      return 'skip';
    }
    
    await this.speak("I didn't catch that. Please use the app to mark your medicine.", 0.9, 1.1);
    return 'no-response';
  }

  // Simple reminder
  remind(medicineName: string, dosage: string) {
    const message = `Hello! It's time to take your medicine: ${medicineName}, ${dosage}. Please take it now.`;
    return this.speak(message, 0.85, 1.1);
  }

  // Read today's schedule
  async readTodaysSchedule(schedule: Array<{name: string, dosage: string, time: string}>) {
    if (!schedule || schedule.length === 0) {
      await this.speak("You have no medicines scheduled for today.", 0.9, 1.1);
      return;
    }

    let message = "Here's your medicine schedule for today. ";
    schedule.forEach((item, index) => {
      const timeFormatted = new Date(`2000-01-01T${item.time}`).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        hour12: true 
      });
      message += `${item.name}, ${item.dosage} at ${timeFormatted}. `;
    });
    
    await this.speak(message, 0.9, 1.1);
  }

  // Listen for voice response with improved recognition
  listenForResponse(timeoutMs: number = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.recognition) {
        console.log('Speech recognition not supported');
        resolve('not_supported');
        return;
      }

      this.isListening = true;
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        this.isListening = false;
        this.recognition.stop();
        resolve('timeout');
      }, timeoutMs);

      this.recognition.onresult = (event: any) => {
        clearTimeout(timeoutId);
        const results = [];
        for (let i = 0; i < event.results.length; i++) {
          results.push(event.results[i][0].transcript.toLowerCase().trim());
        }
        const text = results.join(' ');
        this.isListening = false;
        console.log('Recognized:', text);
        
        resolve(text);
      };

      this.recognition.onerror = (event: any) => {
        clearTimeout(timeoutId);
        console.error('Recognition error:', event.error);
        this.isListening = false;
        resolve('error');
      };

      this.recognition.onend = () => {
        clearTimeout(timeoutId);
        this.isListening = false;
      };

      this.recognition.start();
    });
  }

  // Enhanced question answering with context
  async processQuery(query: string): Promise<string> {
    const lowerQuery = query.toLowerCase();
    
    // Medication related queries
    if (lowerQuery.includes('medicine') || lowerQuery.includes('medication') || lowerQuery.includes('pill')) {
      if (lowerQuery.includes('next')) {
        return 'next_medicine';
      } else if (lowerQuery.includes('today')) {
        return 'today_schedule';
      } else if (lowerQuery.includes('take') || lowerQuery.includes('when')) {
        return 'when_to_take';
      }
    }
    
    // Appointment related queries
    if (lowerQuery.includes('appointment') || lowerQuery.includes('doctor')) {
      if (lowerQuery.includes('next')) {
        return 'next_appointment';
      } else if (lowerQuery.includes('schedule') || lowerQuery.includes('book') || lowerQuery.includes('fix')) {
        return 'schedule_appointment';
      }
    }
    
    // Emergency related queries
    if (lowerQuery.includes('pain') || lowerQuery.includes('hurt') || 
        lowerQuery.includes('emergency') || lowerQuery.includes('help')) {
      return 'emergency';
    }
    
    // General queries
    if (lowerQuery.includes('how are you')) {
      return 'greeting';
    }
    
    return 'unknown';
  }

  // Ask a question and process response
  async askQuestion(question: string): Promise<{text: string, intent: string}> {
    await this.speak(question, 0.9, 1.1);
    const response = await this.listenForResponse(8000);
    const intent = await this.processQuery(response);
    return { text: response, intent };
  }

  // Handle different intents with appropriate responses
  async handleIntent(intent: string, context: any): Promise<string> {
    switch(intent) {
      case 'next_medicine':
        if (context.nextDose) {
          return `Your next medicine is ${context.nextDose.name}, ${context.nextDose.dosage} at ${context.nextDose.time}.`;
        } else {
          return "You have no upcoming medicines scheduled.";
        }
      
      case 'today_schedule':
        if (context.todayMeds && context.todayMeds.length > 0) {
          const count = context.todayMeds.length;
          return `You have ${count} medicine${count > 1 ? 's' : ''} scheduled for today. Say 'read schedule' to hear them.`;
        } else {
          return "You have no medicines scheduled for today.";
        }
      
      case 'next_appointment':
        if (context.nextAppointment) {
          const date = new Date(context.nextAppointment.date).toLocaleDateString();
          return `Your next appointment is on ${date} at ${context.nextAppointment.time} with Dr. ${context.nextAppointment.doctor}.`;
        } else {
          return "You have no upcoming appointments.";
        }
      
      case 'schedule_appointment':
        return "I can help you schedule an appointment. Please use the appointments section in the app.";
      
      case 'emergency':
        return "emergency_triggered";
      
      case 'greeting':
        return "I'm here to help you manage your health. You can ask me about your medicines, appointments, or if you need emergency assistance.";
      
      default:
        return "I'm not sure I understood. You can ask me about your medicines, appointments, or say 'emergency' if you need immediate help.";
    }
  }

  // Emergency alert
  async triggerEmergency() {
    const message = "Emergency alert triggered. Help is being notified. Please stay calm.";
    await this.speak(message, 0.85, 1.1);
  }

  // Stop speaking
  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }

  // Stop listening
  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  // Check if speaking
  isSpeaking(): boolean {
    return this.synthesis ? this.synthesis.speaking : false;
  }
}

export const speechService = new SpeechService();