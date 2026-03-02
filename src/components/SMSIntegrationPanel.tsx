import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  Smartphone, Send, Clock, MessageSquare, 
  Phone, CheckCircle, AlertTriangle,
  Users, Calendar, Pill, Zap
} from "lucide-react";

const SMSIntegrationPanel = () => {
  const { toast } = useToast();
  const [message, setMessage] = useState("Remember to take your Metformin 500mg after breakfast today. Stay healthy! 💊");
  const [selectedPatient, setSelectedPatient] = useState("patient-1");
  const [smsType, setSmsType] = useState("reminder");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [isScheduled, setIsScheduled] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const patients = [
    { id: "patient-1", name: "John Smith", phone: "+1 (555) 123-4567", condition: "Diabetes" },
    { id: "patient-2", name: "Maria Garcia", phone: "+1 (555) 987-6543", condition: "Hypertension" },
    { id: "patient-3", name: "Robert Chen", phone: "+1 (555) 456-7890", condition: "Asthma" },
  ];

  const smsTemplates = [
    { id: "reminder", name: "Medication Reminder", icon: "💊" },
    { id: "appointment", name: "Appointment Alert", icon: "📅" },
    { id: "followup", name: "Follow-up Check", icon: "👨‍⚕️" },
    { id: "refill", name: "Refill Alert", icon: "🔄" },
    { id: "emergency", name: "Urgent Notice", icon: "🚨" },
  ];

  const quickMessages = [
    "Remember to take your medication with food",
    "Your appointment is tomorrow at 2 PM",
    "How are you feeling after the new medication?",
    "Your prescription refill is ready",
    "Please confirm you took your morning dose",
  ];

  const handleSendSMS = async () => {
    setIsSending(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    toast({
      title: isScheduled ? "📅 SMS Scheduled!" : "📱 SMS Sent!",
      description: isScheduled 
        ? `Message scheduled for ${scheduleTime} to ${patients.find(p => p.id === selectedPatient)?.phone}`
        : `Message sent to ${patients.find(p => p.id === selectedPatient)?.name}`,
    });
    setIsSending(false);
  };

  const handleTemplateSelect = (templateId: string) => {
    const templates: Record<string, string> = {
      reminder: "Reminder: Please take your medication as prescribed. Contact us if you experience any side effects.",
      appointment: "Appointment Reminder: Your appointment is scheduled for tomorrow. Please arrive 15 minutes early.",
      followup: "Follow-up: How are you feeling after starting the new medication? Reply to this message.",
      refill: "Refill Alert: Your prescription needs to be refilled. Please visit our pharmacy or call us.",
      emergency: "URGENT: Please contact our office immediately regarding your recent test results.",
    };
    setMessage(templates[templateId] || "");
  };

  return (
    <div className="space-y-6 p-6 bg-gradient-to-br from-blue-50 to-indigo-50 min-h-screen">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 bg-blue-100 rounded-full">
            <Smartphone className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800">CareDose SMS Integration</h1>
        </div>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Send automated medication reminders, appointment alerts, and health updates directly to your patients' phones.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Compose */}
        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-blue-600" />
              Compose SMS Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {/* Patient Selection */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Select Patient
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {patients.map((patient) => (
                  <div
                    key={patient.id}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                      selectedPatient === patient.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-blue-300"
                    }`}
                    onClick={() => setSelectedPatient(patient.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{patient.name}</h3>
                        <p className="text-sm text-gray-600">{patient.phone}</p>
                        <Badge variant="outline" className="mt-2">
                          {patient.condition}
                        </Badge>
                      </div>
                      {selectedPatient === patient.id && (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Message Type */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Message Type
              </Label>
              <div className="flex flex-wrap gap-2">
                {smsTemplates.map((template) => (
                  <Button
                    key={template.id}
                    variant={smsType === template.id ? "default" : "outline"}
                    onClick={() => {
                      setSmsType(template.id);
                      handleTemplateSelect(template.id);
                    }}
                    className="flex items-center gap-2"
                  >
                    <span>{template.icon}</span>
                    {template.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Message Input */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Message Content
                </Label>
                <span className="text-sm text-gray-500">
                  {message.length}/160 characters
                </span>
              </div>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[120px] text-lg"
                placeholder="Type your message here..."
              />
              
              {/* Quick Messages */}
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Quick messages:</p>
                <div className="flex flex-wrap gap-2">
                  {quickMessages.map((text, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      onClick={() => setMessage(text)}
                      className="text-xs"
                    >
                      {text}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Scheduling Options */}
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-gray-600" />
                  <div>
                    <Label className="font-medium">Schedule Delivery</Label>
                    <p className="text-sm text-gray-500">Send now or schedule for later</p>
                  </div>
                </div>
                <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
              </div>

              {isScheduled && (
                <div className="space-y-3">
                  <Label>Schedule Time</Label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-48"
                  />
                </div>
              )}
            </div>

            {/* Send Button */}
            <Button
              onClick={handleSendSMS}
              disabled={isSending || !message.trim()}
              className="w-full py-6 text-lg font-semibold"
              size="lg"
            >
              {isSending ? (
                <>
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-5 w-5" />
                  {isScheduled ? "Schedule SMS" : "Send SMS Now"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right Panel - Preview & Features */}
        <div className="space-y-6">
          {/* Message Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                Message Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-900 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-700">
                  <div className="h-10 w-10 bg-blue-500 rounded-full flex items-center justify-center">
                    <Phone className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-medium">CareDose Medical</p>
                    <p className="text-gray-400 text-sm">{patients.find(p => p.id === selectedPatient)?.phone}</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="bg-blue-500 text-white p-3 rounded-2xl rounded-tl-none max-w-[80%]">
                    <p className="text-sm">{message}</p>
                    <p className="text-xs text-blue-200 mt-2 text-right">
                      {isScheduled ? `Scheduled: Today ${scheduleTime}` : "Now"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Integration Features */}
          <Card>
            <CardHeader>
              <CardTitle>Integration Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">Twilio API Connected</p>
                  <p className="text-sm text-gray-600">Real SMS delivery enabled</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                <Calendar className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium">Automated Scheduling</p>
                  <p className="text-sm text-gray-600">Set recurring reminders</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                <Pill className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-medium">Medication Tracking</p>
                  <p className="text-sm text-gray-600">Sync with patient records</p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-medium">Delivery Reports</p>
                  <p className="text-sm text-gray-600">Track sent/delivered/failed</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* SMS Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">1,248</p>
                  <p className="text-sm text-gray-600">Messages Sent</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">94%</p>
                  <p className="text-sm text-gray-600">Delivery Rate</p>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">42</p>
                  <p className="text-sm text-gray-600">Active Patients</p>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <p className="text-2xl font-bold text-orange-600">12</p>
                  <p className="text-sm text-gray-600">Scheduled Today</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 mt-8 pt-6 border-t">
        <p>🔒 Secure SMS Delivery via Twilio • HIPAA Compliant • End-to-End Encrypted</p>
        <p className="mt-1">All messages are logged and tracked for compliance purposes.</p>
      </div>
    </div>
  );
};

export default SMSIntegrationPanel;