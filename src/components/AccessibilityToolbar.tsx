// src/components/AccessibilityToolbar.tsx - Enhanced with more options
import React, { useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, Sun, Eye, Settings, X, Type, Monitor, Volume2, VolumeX, Palette, Layout } from 'lucide-react';

interface A11ySettings {
  fontSize: number;
  highContrast: boolean;
  reducedAnimation: boolean;
  largeButtons: boolean;
  dyslexiaFont: boolean;
  darkMode: boolean;
  lineSpacing: boolean;
  colorBlindMode: boolean;
  simplifiedUI: boolean;
}

const DEFAULTS: A11ySettings = {
  fontSize: 100, highContrast: false, reducedAnimation: false,
  largeButtons: false, dyslexiaFont: false, darkMode: false, lineSpacing: false,
  colorBlindMode: false, simplifiedUI: false,
};

const AccessibilityToolbar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<A11ySettings>(() => {
    try { const s = sessionStorage.getItem('a11y'); return s ? JSON.parse(s) : DEFAULTS; } catch { return DEFAULTS; }
  });

  useEffect(() => {
    apply(settings);
    try { sessionStorage.setItem('a11y', JSON.stringify(settings)); } catch {}
  }, [settings]);

  const apply = (s: A11ySettings) => {
    const r = document.documentElement;
    r.style.fontSize = `${s.fontSize}%`;
    r.classList.toggle('high-contrast', s.highContrast);
    r.classList.toggle('reduced-motion', s.reducedAnimation);
    r.classList.toggle('large-buttons', s.largeButtons);
    r.classList.toggle('dark', s.darkMode);
    if (s.dyslexiaFont) r.style.fontFamily = '"OpenDyslexic", "Comic Sans MS", cursive';
    else r.style.fontFamily = '';
    if (s.lineSpacing) r.style.lineHeight = '2';
    else r.style.lineHeight = '';
  };

  const set = <K extends keyof A11ySettings>(k: K, v: A11ySettings[K]) =>
    setSettings(p => ({ ...p, [k]: v }));

  const reset = () => setSettings(DEFAULTS);

  const Toggle = ({ label, desc, k }: { label: string; desc: string; k: keyof A11ySettings }) => (
    <label className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
      <div className="flex-shrink-0 mt-0.5">
        <div className={`w-11 h-6 rounded-full transition-colors relative ${settings[k] ? 'bg-teal-600' : 'bg-gray-200'}`}>
          <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform ${settings[k] ? 'translate-x-5' : 'translate-x-0.5'}`}/>
        </div>
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
      <input type="checkbox" className="sr-only" checked={!!settings[k]}
        onChange={e => set(k, e.target.checked as any)} aria-label={label}/>
    </label>
  );

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-teal-600 hover:bg-teal-700 text-white rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 focus:outline-none focus:ring-4 focus:ring-teal-300"
        aria-label="Accessibility & Display Settings"
        title="Accessibility Settings"
      >
        <Settings className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 w-80 max-h-[80vh] overflow-y-auto"
          role="dialog" aria-label="Accessibility Settings">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-teal-50 rounded-lg flex items-center justify-center"><Eye className="h-4 w-4 text-teal-600"/></div>
              <h3 className="font-bold text-gray-900">Display Settings</h3>
            </div>
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4"/>
            </button>
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* Font Size */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Type className="h-4 w-4 text-teal-600"/>
                <span className="text-sm font-semibold text-gray-800">Text Size</span>
                <span className="ml-auto text-sm font-bold text-teal-600">{settings.fontSize}%</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => set('fontSize', Math.max(80, settings.fontSize-10))}
                  className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-700 font-bold disabled:opacity-40 shrink-0"
                  disabled={settings.fontSize<=80}>A-</button>
                <input type="range" min={80} max={150} step={10} value={settings.fontSize}
                  onChange={e=>set('fontSize',parseInt(e.target.value))}
                  className="flex-1 accent-teal-600" aria-label="Font size"/>
                <button onClick={() => set('fontSize', Math.min(150, settings.fontSize+10))}
                  className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 text-gray-700 font-bold disabled:opacity-40 shrink-0"
                  disabled={settings.fontSize>=150}>A+</button>
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                <span>Smaller</span><span>Default</span><span>Larger</span>
              </div>
            </div>

            {/* Toggle options */}
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Visual Options</p>
              <Toggle k="highContrast" label="High Contrast" desc="Increases text and border contrast"/>
              <Toggle k="darkMode" label="Dark Mode" desc="Dark background, light text"/>
              <Toggle k="largeButtons" label="Larger Buttons" desc="Bigger touch targets for easier tapping"/>
              <Toggle k="lineSpacing" label="Extra Line Spacing" desc="More space between lines of text"/>
              <Toggle k="dyslexiaFont" label="Dyslexia-Friendly Font" desc="Easier-to-read font for dyslexia"/>
              <Toggle k="reducedAnimation" label="Reduce Animations" desc="Fewer moving elements on screen"/>
            </div>

            {/* Quick presets */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Presets</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label:'Elderly Mode', action:()=>setSettings({...DEFAULTS,fontSize:130,largeButtons:true,lineSpacing:true}), color:'bg-amber-600' },
                  { label:'Low Vision',   action:()=>setSettings({...DEFAULTS,fontSize:150,highContrast:true,largeButtons:true}), color:'bg-blue-600' },
                  { label:'Night Mode',   action:()=>setSettings({...DEFAULTS,darkMode:true}), color:'bg-gray-800' },
                  { label:'Reset All',    action:reset, color:'bg-gray-500' },
                ].map(p=>(
                  <button key={p.label} onClick={p.action}
                    className={`${p.color} hover:opacity-90 text-white text-xs font-semibold py-2 px-3 rounded-lg transition-opacity`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AccessibilityToolbar;
