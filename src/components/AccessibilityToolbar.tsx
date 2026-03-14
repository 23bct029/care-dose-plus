// src/components/AccessibilityToolbar.tsx - Accessibility toolbar for elderly users
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  ZoomIn, ZoomOut, Sun, Eye, Settings, X, Minus, Plus,
  Type, Monitor
} from 'lucide-react';

interface AccessibilitySettings {
  fontSize: number;
  highContrast: boolean;
  reducedAnimation: boolean;
  largeButtons: boolean;
  simplifiedUI: boolean;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  fontSize: 100,
  highContrast: false,
  reducedAnimation: false,
  largeButtons: false,
  simplifiedUI: false,
};

const AccessibilityToolbar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    try {
      const saved = sessionStorage.getItem('a11y');
      return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  useEffect(() => {
    applySettings(settings);
    try { sessionStorage.setItem('a11y', JSON.stringify(settings)); } catch {}
  }, [settings]);

  const applySettings = (s: AccessibilitySettings) => {
    const root = document.documentElement;
    root.style.fontSize = `${s.fontSize}%`;
    if (s.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    if (s.reducedAnimation) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }
    if (s.largeButtons) {
      root.classList.add('large-buttons');
    } else {
      root.classList.remove('large-buttons');
    }
  };

  const updateSetting = <K extends keyof AccessibilitySettings>(key: K, value: AccessibilitySettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetSettings = () => setSettings(DEFAULT_SETTINGS);

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all focus:outline-none focus:ring-4 focus:ring-blue-300"
        aria-label="Accessibility Settings"
        title="Accessibility Settings"
      >
        <Settings className="h-6 w-6" />
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 p-5 w-72"
          role="dialog"
          aria-label="Accessibility Settings Panel"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Eye className="h-5 w-5 text-blue-600" />
              Accessibility
            </h3>
            <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-500">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Font Size */}
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-2">
              <Type className="h-4 w-4 text-blue-500" />
              Font Size ({settings.fontSize}%)
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateSetting('fontSize', Math.max(80, settings.fontSize - 10))}
                className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-40 text-gray-700 font-bold"
                disabled={settings.fontSize <= 80}
                aria-label="Decrease font size"
              >A-</button>
              <div className="flex-1">
                <input type="range" min={80} max={150} step={10} value={settings.fontSize}
                  onChange={e => updateSetting('fontSize', parseInt(e.target.value))}
                  className="w-full accent-blue-600" aria-label="Font size" />
              </div>
              <button
                onClick={() => updateSetting('fontSize', Math.min(150, settings.fontSize + 10))}
                className="w-9 h-9 rounded-lg border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-40 text-gray-700 font-bold"
                disabled={settings.fontSize >= 150}
                aria-label="Increase font size"
              >A+</button>
            </div>
          </div>

          {/* Toggle Options */}
          <div className="space-y-3">
            {[
              { key: 'highContrast', label: 'High Contrast Mode', icon: Sun, desc: 'Increases color contrast' },
              { key: 'reducedAnimation', label: 'Reduce Animations', icon: Monitor, desc: 'Fewer moving elements' },
              { key: 'largeButtons', label: 'Larger Buttons', icon: ZoomIn, desc: 'Bigger touch targets' },
            ].map(({ key, label, icon: Icon, desc }) => (
              <label key={key} className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                <div className="flex-shrink-0 mt-0.5">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    settings[key as keyof AccessibilitySettings] ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                  }`}>
                    {settings[key as keyof AccessibilitySettings] && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-800">{label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
                <input type="checkbox" className="sr-only"
                  checked={!!settings[key as keyof AccessibilitySettings]}
                  onChange={e => updateSetting(key as keyof AccessibilitySettings, e.target.checked as any)}
                  aria-label={label}
                />
              </label>
            ))}
          </div>

          <button
            onClick={resetSettings}
            className="w-full mt-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
            aria-label="Reset accessibility settings"
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </>
  );
};

export default AccessibilityToolbar;
