import React, { useState, useEffect, useMemo, useRef } from 'react';
import packageJson from '../../package.json';
import { analytics } from '../lib/analytics/analytics.service';
import { AboutSection } from './AboutSection';
import { HelpSettings } from './settings/HelpSettings';
import { AIProvidersSettings } from './settings/AIProvidersSettings';
import { WhisperSettings } from './settings/WhisperSettings';
import { NativelyApiSettings } from './settings/NativelyApiSettings';
import { NativelyProSettings } from './settings/NativelyProSettings';
import { PhoneMirrorSettings } from './settings/PhoneMirrorSettings';
import { ExecutionEnginesSettings } from './settings/ExecutionEnginesSettings';
import { LocalWhisperModelPanel } from './LocalWhisperModelPanel';
import { NativelyLogoMark } from './NativelyLogoMark';
import { motion, AnimatePresence } from 'framer-motion';
import { useShortcuts } from '../hooks/useShortcuts';
import { useResolvedTheme } from '../hooks/useResolvedTheme';
import {
  ChevronUp,
  ChevronDown,
  Settings,
  Mic,
  Keyboard,
  Smartphone,
  HelpCircle,
  Info,
  Power,
  X,
  Upload,
  Trash2,
  Check,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Shield,
  Eye,
  Cpu,
  MessageSquare,
  Zap,
  SlidersHorizontal,
  Monitor,
  FlaskConical,
  CheckCircle,
  Terminal,
  LogOut,
  Ghost,
  PointerOff,
  ArrowDown,
  Palette,
  Sun,
  Moon,
  Layout,
  Sparkles,
  Globe,
  BadgeCheck,
  Activity,
  RotateCcw,
  Camera,
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  MapPin,
  Speaker,
  Calendar,
} from 'lucide-react';

import {
  clampOverlayOpacity,
  getOverlayAppearance,
  OVERLAY_OPACITY_DEFAULT,
  OVERLAY_OPACITY_MIN,
  getDefaultOverlayOpacity,
} from '../lib/overlayAppearance';
import { getMeetingInterfaceTheme, setMeetingInterfaceTheme, type MeetingInterfaceTheme } from '../lib/meetingInterfaceTheme';
import { KeyRecorder } from './ui/KeyRecorder';
import icon from './icon.png';
import KnowledgeBaseTab from './KnowledgeBaseTab';

// ---------------------------------------------------------------------------
// MockupNativelyInterface
// ---------------------------------------------------------------------------
const MockupNativelyInterface = ({ opacity }: { opacity: number }) => {
  const resolvedTheme = useResolvedTheme();
  const appearance = useMemo(() => getOverlayAppearance(opacity, resolvedTheme), [opacity, resolvedTheme]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none bg-transparent">
      <div id="mockup-natively-interface" className="flex flex-col items-center pointer-events-none -mt-56">
        <div className="flex justify-center mb-2 select-none z-50">
          <div className="flex items-center gap-2 rounded-full overlay-pill-surface backdrop-blur-md pl-1.5 pr-1.5 py-1.5" style={appearance.pillStyle}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden overlay-icon-surface" style={appearance.iconStyle}>
              <img src={icon} alt="Natively" className="w-[24px] h-[24px] object-contain opacity-95 scale-105 force-black-icon" draggable="false" />
            </div>
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-medium border overlay-chip-surface overlay-text-interactive" style={appearance.chipStyle}>
              <ChevronUp className="w-3.5 h-3.5 opacity-70" />
              <span className="opacity-80 tracking-wide">Hide</span>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center overlay-icon-surface overlay-text-primary" style={appearance.iconStyle}>
              <div className="w-3.5 h-3.5 rounded-[3px] bg-red-400 opacity-80" />
            </div>
          </div>
        </div>

        <div className="relative w-[600px] max-w-full overlay-shell-surface overlay-text-primary backdrop-blur-2xl border rounded-[24px] overflow-hidden flex flex-col pt-2 pb-3" style={appearance.shellStyle}>
          <div className="w-full flex justify-center py-2 px-4 border-b mb-1 overlay-transcript-surface" style={appearance.transcriptStyle}>
            <p className="text-[13px] truncate max-w-[90%] font-medium overlay-text-primary">
              <span className={`${resolvedTheme === 'light' ? 'text-blue-700' : 'text-blue-400'} mr-2 font-semibold`}>Interviewer</span>
              <span className="opacity-95">So how would you optimize the current algorithm?</span>
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
            <div className="flex justify-start">
              <div className="max-w-[85%] px-4 py-3 text-[14px] leading-relaxed font-normal overlay-text-primary">
                <span className="font-semibold text-emerald-500 block mb-1">Suggestion</span>
                A good approach would be to use a hash map to cache intermediate results, lowering time complexity from O(n²) to O(n).
              </div>
            </div>
          </div>

          <div className="flex flex-nowrap justify-center items-center gap-1.5 px-4 pb-3 pt-3">
            {['What to answer?', 'Clarify', 'Recap', 'Follow Up Question', 'Answer'].map((action, i) => (
              <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border shrink-0 overlay-chip-surface overlay-text-interactive" style={appearance.chipStyle}>
                {action}
              </div>
            ))}
          </div>

          <div className="px-3">
            <div className="w-full border rounded-xl pl-3 pr-10 py-2.5 h-[38px] flex items-center overlay-input-surface" style={appearance.inputStyle}>
              <span className="text-[13px] overlay-text-muted">Ask anything on screen or conversation</span>
            </div>
            <div className="flex items-center justify-between mt-3 px-0.5">
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-2 px-3 py-1.5 border rounded-lg text-xs font-medium w-[140px] overlay-control-surface overlay-text-interactive" style={appearance.controlStyle}>
                  <span className="truncate min-w-0 flex-1">Gemini 3 Flash</span>
                  <ChevronDown size={14} className="shrink-0" />
                </div>
                <div className="w-px h-3 mx-1" style={appearance.dividerStyle} />
                <div className="w-7 h-7 flex items-center justify-center rounded-lg overlay-icon-surface overlay-text-muted" style={appearance.iconStyle}>
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CustomSelectProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  options: MediaDeviceInfo[];
  onChange: (value: string) => void;
  placeholder?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ label, icon, value, options, onChange, placeholder = 'Select device' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLabel = options.find((o) => o.deviceId === value)?.label || placeholder;

  return (
    <div className="bg-bg-card rounded-xl p-4 border border-border-subtle" ref={containerRef}>
      {label && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-text-secondary">{icon}</span>
          <label className="text-xs font-medium text-text-primary uppercase tracking-wide">{label}</label>
        </div>
      )}
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary flex items-center justify-between hover:bg-bg-elevated transition-colors"
        >
          <span className="truncate pr-4">{selectedLabel}</span>
          <ChevronDown size={14} className={`text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 w-full mt-1 bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
            <div className="p-1 space-y-0.5">
              {options.map((device) => (
                <button
                  key={device.deviceId}
                  onClick={() => {
                    onChange(device.deviceId);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between transition-colors ${
                    value === device.deviceId ? 'bg-bg-input text-text-primary' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'
                  }`}
                >
                  <span className="truncate">{device.label || `Device ${device.deviceId.slice(0, 5)}...`}</span>
                  {value === device.deviceId && <Check size={14} className="text-accent-primary" />}
                </button>
              ))}
              {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-500 italic">No devices found</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface ProviderOption {
  id: string;
  label: string;
  badge?: string | null;
  recommended?: boolean;
  desc: string;
  color: string;
  icon: React.ReactNode;
}

const ProviderSelect: React.FC<{ value: string; options: ProviderOption[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => {
  const isLight = useResolvedTheme() === 'light';
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selected = options.find((o) => o.id === value);
  const getBadgeStyle = (c?: string) => `bg-${c || 'gray'}-500/10 text-${c || 'gray'}-500 border-${c || 'gray'}-500/20`;

  return (
    <div ref={containerRef} className="relative z-20 font-sans">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-bg-input border border-border-subtle hover:border-border-muted shadow-sm rounded-xl p-2.5 pr-3.5 flex items-center justify-between transition-all outline-none focus:ring-2 focus:ring-accent-primary/20 ${
          isOpen ? 'ring-2 ring-accent-primary/20 border-accent-primary/50' : 'hover:shadow-md'
        }`}
      >
        {selected ? (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 bg-accent-primary/10 text-accent-primary">
              {selected.icon}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-text-primary truncate">{selected.label}</span>
                {selected.badge && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${getBadgeStyle(selected.badge === 'Saved' ? 'emerald' : selected.color)}`}>{selected.badge}</span>}
                {selected.recommended && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide bg-blue-500/10 text-blue-500 border border-blue-500/20">Recommended</span>}
              </div>
              <span className="text-[11px] text-text-tertiary truncate block leading-tight mt-0.5">{selected.desc}</span>
            </div>
          </div>
        ) : (
          <span className="text-text-secondary px-2 text-sm">Select Provider</span>
        )}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-text-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <ChevronDown size={14} strokeWidth={2.5} />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className={`absolute top-full left-0 w-full mt-2 backdrop-blur-xl rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/5 z-50 ${isLight ? 'bg-bg-elevated border border-border-subtle' : 'bg-bg-elevated/95 border border-white/5'}`}
          >
            <div className="max-h-[320px] overflow-y-auto p-1.5 space-y-0.5">
              {options.map((option) => {
                const isSelected = value === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => {
                      onChange(option.id);
                      setIsOpen(false);
                    }}
                    className={`w-full rounded-[10px] p-2 flex items-center gap-3 transition-colors ${isSelected ? (isLight ? 'bg-bg-item-active shadow-inner' : 'bg-white/10 shadow-inner') : isLight ? 'hover:bg-bg-item-surface' : 'hover:bg-white/5'}`}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent-primary/10 text-accent-primary">{option.icon}</div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[13px] font-medium text-text-primary">{option.label}</span>
                        {isSelected && <Check size={14} className="text-accent-primary" strokeWidth={3} />}
                      </div>
                      <span className="text-[11px] block truncate text-text-tertiary">{option.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export interface KnowledgeBaseSettings {
  enabled: boolean;
  confidenceThreshold: number;
  files: any[];
}

export interface SettingsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: string;
  currentSettings?: KnowledgeBaseSettings;
  onSettingsChange?: (settings: Partial<KnowledgeBaseSettings>) => void;
}

type SttProviderType = 'none' | 'google' | 'groq' | 'openai' | 'deepgram' | 'elevenlabs' | 'azure' | 'ibmwatson' | 'soniox' | 'natively' | 'local-whisper' | 'custom-stt' | 'sherpa';

export const SettingsOverlay: React.FC<SettingsOverlayProps> = ({
  isOpen,
  onClose,
  initialTab = 'general',
  currentSettings,
  onSettingsChange,
}) => {
  const isLight = useResolvedTheme() === 'light';
  const [activeTab, setActiveTab] = useState(initialTab);
  const { shortcuts, updateShortcut, resetShortcuts } = useShortcuts();

  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // General toggles & settings
  const [isUndetectable, setIsUndetectable] = useState(false);
  const [isMousePassthrough, setIsMousePassthrough] = useState(false);
  const [disguiseMode, setDisguiseMode] = useState<'terminal' | 'settings' | 'activity' | 'none'>('none');
  const [openOnLogin, setOpenOnLogin] = useState(false);
  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>('system');
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'uptodate' | 'error'>('idle');
  const [meetingInterfaceTheme, setMeetingInterfaceThemeState] = useState<MeetingInterfaceTheme>(getMeetingInterfaceTheme);
  const [isInterfaceThemeDropdownOpen, setIsInterfaceThemeDropdownOpen] = useState(false);

  const [verboseLogging, setVerboseLogging] = useState(false);
  const [meetingRetention, setMeetingRetention] = useState<'forever' | '7d' | '30d' | 'never'>('forever');
  const [providerDataScopes, setProviderDataScopes] = useState<Record<string, boolean>>({});
  const [screenUnderstandingMode, setScreenUnderstandingMode] = useState<'vision_first' | 'vision_only' | 'private_vision'>('vision_first');
  const [technicalInterviewVisionFirst, setTechnicalInterviewVisionFirst] = useState(true);
  const [showVerboseToast, setShowVerboseToast] = useState(false);

  const [showTranscript, setShowTranscript] = useState(() => localStorage.getItem('natively_interviewer_transcript') !== 'false');
  const [autoScroll, setAutoScroll] = useState(() => localStorage.getItem('natively_auto_scroll') === 'true');

  // Languages
  const [recognitionLanguage, setRecognitionLanguage] = useState('');
  const [selectedSttGroup, setSelectedSttGroup] = useState('');
  const [availableLanguages, setAvailableLanguages] = useState<Record<string, any>>({});
  const [autoDetectedLanguage, setAutoDetectedLanguage] = useState<string | null>(null);
  const [aiResponseLanguage, setAiResponseLanguage] = useState('English');
  const [availableAiLanguages, setAvailableAiLanguages] = useState<any[]>([]);

  // Overlay Opacity
  const [overlayOpacity, setOverlayOpacity] = useState<number>(() => {
    const stored = localStorage.getItem('natively_overlay_opacity');
    const parsed = stored ? parseFloat(stored) : NaN;
    return Number.isFinite(parsed) && parsed !== OVERLAY_OPACITY_DEFAULT ? clampOverlayOpacity(parsed) : getDefaultOverlayOpacity();
  });
  const [isPreviewingOpacity, setIsPreviewingOpacity] = useState(false);
  const [previewOverlayOpacity, setPreviewOverlayOpacity] = useState(overlayOpacity);
  const latestOpacityRef = useRef(overlayOpacity);

  // Audio & STT State
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [useExperimentalSck, setUseExperimentalSck] = useState(false);
  const [deviceFallbackNotice, setDeviceFallbackNotice] = useState<{ kind: 'input' | 'output'; requested: string | null; actual: string | null; reason?: string } | null>(null);

  const [onlyInterviewerMode, setOnlyInterviewerMode] = useState(false);
  const [noiseCancellationEnabled, setNoiseCancellationEnabled] = useState(false);
  const [mockInterviewMode, setMockInterviewMode] = useState(false);

  const [sttProvider, setSttProvider] = useState<SttProviderType>('sherpa');
  const [groqSttModel, setGroqSttModel] = useState('whisper-large-v3-turbo');
  const [sttKeys, setSttKeys] = useState<Record<string, string>>({
    groq: '', openai: '', deepgram: '', elevenlabs: '', azure: '', ibmwatson: '', soniox: '',
  });
  const [storedKeysStatus, setStoredKeysStatus] = useState<Record<string, boolean>>({});
  const [sttAzureRegion, setSttAzureRegion] = useState('eastus');
  const [sttOpenaiBaseUrl, setSttOpenaiBaseUrl] = useState('');
  const [googleServiceAccountPath, setGoogleServiceAccountPath] = useState<string | null>(null);
  const [hasNativelyKey, setHasNativelyKey] = useState(false);

  // Custom STT
  const [customSttApiKey, setCustomSttApiKey] = useState('');
  const [customSttEndpoint, setCustomSttEndpoint] = useState('');
  const [customSttModel, setCustomSttModel] = useState('');
  const [customSttPayloadType, setCustomSttPayloadType] = useState<'multipart' | 'binary'>('multipart');
  const [customSttResponsePath, setCustomSttResponsePath] = useState('');
  const [customSttApiKeyHeader, setCustomSttApiKeyHeader] = useState('Authorization');
  const [hasStoredCustomSttKey, setHasStoredCustomSttKey] = useState(false);

  const [sttTestStatus, setSttTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [sttTestError, setSttTestError] = useState('');
  const [sttSaving, setSttSaving] = useState(false);
  const [sttSaved, setSttSaved] = useState(false);

  // Calendar
  const [calendarStatus, setCalendarStatus] = useState<{ connected: boolean; email?: string }>({ connected: false });
  const [isCalendarsLoading, setIsCalendarsLoading] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<Array<{ id: string; title: string; startTime: string; endTime: string; link?: string }>>([]);
  const [isCalendarRefreshing, setIsCalendarRefreshing] = useState(false);

  const themeDropdownRef = useRef<HTMLDivElement>(null);
  const interfaceThemeDropdownRef = useRef<HTMLDivElement>(null);

  // Sync state with electron main process
  useEffect(() => {
    if (!isOpen) return;
    const api: any = window.electronAPI;
    api?.getUndetectable?.().then(setIsUndetectable).catch(() => {});
    api?.getOverlayMousePassthrough?.().then(setIsMousePassthrough).catch(() => {});
    api?.getDisguise?.().then(setDisguiseMode).catch(() => {});
    api?.getVerboseLogging?.().then(setVerboseLogging).catch(() => {});
    api?.getMeetingRetention?.().then(setMeetingRetention).catch(() => {});
    api?.getProviderDataScopes?.().then(setProviderDataScopes).catch(() => {});
    api?.getScreenUnderstandingMode?.().then(setScreenUnderstandingMode).catch(() => {});
    api?.getOpenAtLogin?.().then(setOpenOnLogin).catch(() => {});
    api?.getThemeMode?.().then(({ mode }: any) => setThemeMode(mode)).catch(() => {});
    api?.getCalendarStatus?.().then(setCalendarStatus).catch(() => {});
    api?.getOnlyInterviewerMode?.().then((value: any) => setOnlyInterviewerMode(!!value?.enabled)).catch(() => {});
    api?.getNoiseCancellationEnabled?.().then((value: any) => setNoiseCancellationEnabled(!!value?.enabled)).catch(() => {});
    api?.getMockInterviewMode?.().then((value: any) => setMockInterviewMode(!!value?.enabled)).catch(() => {});
    api?.getTechnicalInterviewVisionFirst?.().then(setTechnicalInterviewVisionFirst)
      .catch(() => api?.getTechnicalInterviewDirectVision?.().then(setTechnicalInterviewVisionFirst).catch(() => {}));

    const loadCreds = async () => {
      try {
        const creds = await api?.getStoredCredentials?.();
        if (!creds) return;
        const configuredSttProvider = creds.sttProvider || 'sherpa';
        if (configuredSttProvider === 'speechmatics') {
          // The current main-process runtime has no Speechmatics streaming adapter.
          // Migrate this legacy selection to the supported offline default.
          setSttProvider('sherpa');
          await api?.setSttProvider?.('sherpa');
        } else {
          setSttProvider(configuredSttProvider);
        }
        if (creds.groqSttModel) setGroqSttModel(creds.groqSttModel);
        setGoogleServiceAccountPath(creds.googleServiceAccountPath || null);
        setHasNativelyKey(!!creds.hasNativelyKey);
        setHasStoredCustomSttKey(!!creds.hasCustomSttKey);
        setCustomSttApiKey(creds.customSttApiKey || '');
        setCustomSttEndpoint(creds.customSttEndpoint || '');
        setCustomSttModel(creds.customSttModel || '');
        setCustomSttPayloadType(creds.customSttPayloadType || 'multipart');
        setCustomSttResponsePath(creds.customSttResponsePath || '');
        setCustomSttApiKeyHeader(creds.customSttApiKeyHeader || 'Authorization');
        if (creds.azureRegion) setSttAzureRegion(creds.azureRegion);
        if (typeof creds.openAiSttBaseUrl === 'string') setSttOpenaiBaseUrl(creds.openAiSttBaseUrl);

        setStoredKeysStatus({
          groq: !!creds.hasSttGroqKey,
          openai: !!creds.hasSttOpenaiKey,
          deepgram: !!creds.hasDeepgramKey,
          elevenlabs: !!creds.hasElevenLabsKey,
          azure: !!creds.hasAzureKey,
          ibmwatson: !!creds.hasIbmWatsonKey,
          soniox: !!creds.hasSonioxKey,
        });
        setSttKeys({
          groq: creds.sttGroqKey || '',
          openai: creds.sttOpenaiKey || '',
          deepgram: creds.sttDeepgramKey || '',
          elevenlabs: creds.sttElevenLabsKey || '',
          azure: creds.sttAzureKey || '',
          ibmwatson: creds.sttIbmKey || '',
          soniox: creds.sttSonioxKey || '',
        });
      } catch (err) {
        console.error('Failed to load STT credentials:', err);
      }
    };
    loadCreds();

    // Load devices
    Promise.all([api?.getInputDevices?.() || [], api?.getOutputDevices?.() || []]).then(([inputs, outputs]: [any[], any[]]) => {
      const format = (d: any[]) => d.map((x) => ({ deviceId: x.id, label: x.name, kind: 'audioinput' as MediaDeviceKind, groupId: '', toJSON: () => x }));
      setInputDevices(format(inputs));
      setOutputDevices(format(outputs));
      const sIn = localStorage.getItem('preferredInputDeviceId');
      const sOut = localStorage.getItem('preferredOutputDeviceId');
      if (sIn && inputs.some((x) => x.id === sIn)) setSelectedInput(sIn);
      else if (inputs.length > 0 && !selectedInput) setSelectedInput(inputs[0].id);
      if (sOut && outputs.some((x) => x.id === sOut)) setSelectedOutput(sOut);
      else if (outputs.length > 0 && !selectedOutput) setSelectedOutput(outputs[0].id);
    });

    setUseExperimentalSck(localStorage.getItem('useExperimentalSckBackend') === 'true');
  }, [isOpen]);

  // IPC Event listeners
  useEffect(() => {
    const api: any = window.electronAPI;
    if (!api) return;
    const unsub = [
      api.onUndetectableChanged?.(setIsUndetectable),
      api.onMeetingRetentionChanged?.(setMeetingRetention),
      api.onProviderDataScopesChanged?.(setProviderDataScopes),
      api.onDisguiseChanged?.(setDisguiseMode),
      api.onOverlayMousePassthroughChanged?.(setIsMousePassthrough),
      api.onSttLanguageAutoDetected?.(setAutoDetectedLanguage),
      api.onScreenUnderstandingModeChanged?.(setScreenUnderstandingMode),
      api.onDeviceSelectionApplied?.((payload: any) => {
        setDeviceFallbackNotice(payload.fellBack ? payload : null);
      }),
    ];
    return () => unsub.forEach((u) => u && typeof u === 'function' && u());
  }, []);

  // Update check subscriptions
  useEffect(() => {
    if (!isOpen) return;
    const api: any = window.electronAPI;
    const unsubs = [
      api?.onUpdateChecking?.(() => setUpdateStatus('checking')),
      api?.onUpdateAvailable?.(() => setUpdateStatus('available')),
      api?.onUpdateNotAvailable?.(() => {
        setUpdateStatus('uptodate');
        setTimeout(() => setUpdateStatus('idle'), 3000);
      }),
      api?.onUpdateError?.(() => {
        setUpdateStatus('error');
        setTimeout(() => setUpdateStatus('idle'), 3000);
      }),
    ];
    return () => unsubs.forEach((u) => u && typeof u === 'function' && u());
  }, [isOpen]);

  // Mic test loop
  useEffect(() => {
    const api: any = window.electronAPI;
    if (isOpen && activeTab === 'audio') {
      const unsub = api?.onAudioTestLevel?.((lvl: number) => setMicLevel(Math.max(0, Math.min(100, lvl * 100))));
      api?.startAudioTest?.(selectedInput || undefined).catch(() => setMicLevel(0));
      api?.getOnlyInterviewerMode?.().then((res: any) => res?.enabled !== undefined && setOnlyInterviewerMode(res.enabled));
      api?.getNoiseCancellationEnabled?.().then((res: any) => res?.enabled !== undefined && setNoiseCancellationEnabled(res.enabled));
      api?.getMockInterviewMode?.().then((res: any) => res?.enabled !== undefined && setMockInterviewMode(res.enabled));

      return () => {
        unsub?.();
        api?.stopAudioTest?.().catch(() => {});
        setMicLevel(0);
      };
    }
    setMicLevel(0);
    api?.stopAudioTest?.().catch(() => {});
  }, [isOpen, activeTab, selectedInput]);

  // Click outside dropdowns
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(e.target as Node)) setIsThemeDropdownOpen(false);
      if (interfaceThemeDropdownRef.current && !interfaceThemeDropdownRef.current.contains(e.target as Node)) setIsInterfaceThemeDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Language loaders
  useEffect(() => {
    const api: any = window.electronAPI;
    if (!api) return;
    api.getRecognitionLanguages?.().then(async (langs: Record<string, any>) => {
      setAvailableLanguages(langs);
      const stored = await api.getSttLanguage?.();
      const current = stored || 'english-us';
      setRecognitionLanguage(current);
      setSelectedSttGroup(langs[current]?.group || 'English');
    });
    api.getAiResponseLanguages?.().then(async (aiLangs: any[]) => {
      const sorted = [...aiLangs].sort((a, b) => (a.code === 'auto' ? -1 : b.code === 'auto' ? 1 : a.label.localeCompare(b.label)));
      setAvailableAiLanguages(sorted);
      setAiResponseLanguage((await api.getAiResponseLanguage?.()) || 'auto');
    });
  }, []);

  // Calendar polling
  useEffect(() => {
    if (!isOpen || activeTab !== 'calendar' || !calendarStatus.connected) return;
    const fetchEvents = () => {
      window.electronAPI?.getUpcomingEvents?.().then((ev: any) => setCalendarEvents(ev || [])).catch(() => {});
    };
    fetchEvents();
    const timer = setInterval(fetchEvents, 60_000);
    return () => clearInterval(timer);
  }, [isOpen, activeTab, calendarStatus.connected]);

  // Opacity slider handlers
  const handleOpacityChange = (val: number) => {
    document.querySelectorAll('.opacity-percent-label').forEach((el) => (el.textContent = `${Math.round(val * 100)}%`));
    setPreviewOverlayOpacity(val);
    latestOpacityRef.current = val;
    window.electronAPI?.setOverlayOpacity?.(val);
  };

  const startPreviewingOpacity = () => {
    if (isPreviewingOpacity) return;
    document.body.classList.add('disable-transitions');
    const toggleEl = (id: string, vis: string) => {
      const el = document.getElementById(id);
      if (el) el.style.visibility = vis;
    };
    toggleEl('settings-panel', 'hidden');
    toggleEl('launcher-container', 'hidden');
    const mockup = document.getElementById('settings-mockup-wrapper');
    if (mockup) mockup.style.opacity = '1';
    setPreviewOverlayOpacity(latestOpacityRef.current);
    setIsPreviewingOpacity(true);
  };

  const stopPreviewingOpacity = () => {
    document.body.classList.remove('disable-transitions');
    const toggleEl = (id: string, vis: string) => {
      const el = document.getElementById(id);
      if (el) el.style.visibility = vis;
    };
    toggleEl('settings-panel', '');
    toggleEl('launcher-container', '');
    const mockup = document.getElementById('settings-mockup-wrapper');
    if (mockup) mockup.style.opacity = '0';
    setIsPreviewingOpacity(false);
    setOverlayOpacity(latestOpacityRef.current);
    localStorage.setItem('natively_overlay_opacity', String(latestOpacityRef.current));
  };

  // Provider Handlers
  const handleSttProviderChange = async (prov: SttProviderType) => {
    setSttProvider(prov);
    setSttTestStatus('idle');
    setSttTestError('');
    await (window.electronAPI as any)?.setSttProvider?.(prov);
  };

  const handleSttKeySubmit = async (provider: string, key: string) => {
    if (!key.trim()) return;
    setSttSaving(true);
    setSttTestStatus('testing');
    setSttTestError('');
    try {
      const api: any = window.electronAPI;
      const testResult = await api?.testSttConnection?.(provider, key.trim(), provider === 'azure' ? sttAzureRegion : undefined);
      if (!testResult?.success) {
        setSttTestStatus('error');
        setSttTestError(testResult?.error || 'Validation failed. Key not saved.');
        setSttSaving(false);
        return;
      }
      setSttTestStatus('success');
      setTimeout(() => setSttTestStatus('idle'), 3000);

      const setterMap: Record<string, string> = {
        groq: 'setGroqSttApiKey',
        openai: 'setOpenAiSttApiKey',
        elevenlabs: 'setElevenLabsApiKey',
        azure: 'setAzureApiKey',
        ibmwatson: 'setIbmWatsonApiKey',
        soniox: 'setSonioxApiKey',
        deepgram: 'setDeepgramApiKey',
      };
      if (setterMap[provider] && api?.[setterMap[provider]]) {
        await api[setterMap[provider]](key.trim());
      }
      setStoredKeysStatus((prev) => ({ ...prev, [provider]: true }));
      setSttSaved(true);
      setTimeout(() => setSttSaved(false), 2000);
    } catch (e: any) {
      setSttTestStatus('error');
      setSttTestError(e.message || 'Validation failed');
    } finally {
      setSttSaving(false);
    }
  };

  const handleRemoveSttKey = async (provider: string) => {
    if (!confirm(`Are you sure you want to remove the ${provider} API key?`)) return;
    const api: any = window.electronAPI;
    const setterMap: Record<string, string> = {
      groq: 'setGroqSttApiKey',
      openai: 'setOpenAiSttApiKey',
      elevenlabs: 'setElevenLabsApiKey',
      azure: 'setAzureApiKey',
      ibmwatson: 'setIbmWatsonApiKey',
      soniox: 'setSonioxApiKey',
      deepgram: 'setDeepgramApiKey',
    };
    if (setterMap[provider] && api?.[setterMap[provider]]) {
      await api[setterMap[provider]]('');
    }
    setSttKeys((prev) => ({ ...prev, [provider]: '' }));
    setStoredKeysStatus((prev) => ({ ...prev, [provider]: false }));
  };

  const handleTestSttConnection = async () => {
    if (['none', 'google', 'natively', 'local-whisper', 'sherpa'].includes(sttProvider)) return;
    const keyToTest = sttProvider === 'custom-stt' ? customSttApiKey : sttKeys[sttProvider] || '';
    if (!keyToTest.trim() && sttProvider !== 'custom-stt') {
      setSttTestStatus('error');
      setSttTestError('Please enter an API key first');
      return;
    }
    setSttTestStatus('testing');
    setSttTestError('');
    try {
      const api: any = window.electronAPI;
      const res = await api?.testSttConnection?.(
        sttProvider,
        keyToTest.trim(),
        sttProvider === 'azure' ? sttAzureRegion : undefined,
        sttProvider === 'custom-stt'
          ? { endpoint: customSttEndpoint, model: customSttModel, payloadType: customSttPayloadType, apiKeyHeader: customSttApiKeyHeader }
          : undefined
      );
      if (res?.success) {
        setSttTestStatus('success');
        setTimeout(() => setSttTestStatus('idle'), 3000);
      } else {
        setSttTestStatus('error');
        setSttTestError(res?.error || 'Connection failed');
      }
    } catch (e: any) {
      setSttTestStatus('error');
      setSttTestError(e.message || 'Test failed');
    }
  };

  const handleCustomSttSave = async () => {
    setSttSaving(true);
    try {
      const res = await (window.electronAPI as any)?.setCustomSttConfig?.({
        apiKey: customSttApiKey.trim(),
        endpoint: customSttEndpoint.trim(),
        model: customSttModel.trim(),
        payloadType: customSttPayloadType,
        responsePath: customSttResponsePath.trim(),
        apiKeyHeader: customSttApiKeyHeader.trim(),
      });
      if (res?.success) {
        setSttSaved(true);
        setHasStoredCustomSttKey(!!customSttApiKey.trim());
        setTimeout(() => setSttSaved(false), 2000);
      } else {
        setSttTestStatus('error');
        setSttTestError(res?.error || 'Failed to save configuration');
      }
    } catch (e: any) {
      setSttTestStatus('error');
      setSttTestError(e.message || 'Save failed');
    } finally {
      setSttSaving(false);
    }
  };

  const languageGroups = useMemo(() => {
    return Array.from(new Set(Object.values(availableLanguages).map((l: any) => l.group))).sort((a, b) =>
      a === 'Auto' ? -1 : b === 'Auto' ? 1 : a === 'English' ? -1 : b === 'English' ? 1 : a.localeCompare(b)
    );
  }, [availableLanguages]);

  const currentGroupVariants = useMemo(() => {
    return Object.entries(availableLanguages)
      .filter(([_, lang]) => lang.group === selectedSttGroup)
      .map(([key, lang]) => ({ deviceId: key, label: lang.label, kind: 'audioinput' as MediaDeviceKind, groupId: '', toJSON: () => ({}) }));
  }, [availableLanguages, selectedSttGroup]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          id="settings-backdrop"
          className={`fixed inset-0 z-50 flex items-center justify-center p-8 transition-colors ${isPreviewingOpacity ? 'bg-transparent backdrop-blur-none' : 'bg-black/60 backdrop-blur-sm'}`}
        >
          <motion.div
            id="settings-panel-wrapper"
            initial={{ scale: 0.94, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 20 }}
            className="bg-bg-elevated w-full max-w-4xl h-[80vh] rounded-2xl border border-border-subtle shadow-2xl overflow-hidden relative"
          >
            <div id="settings-panel" className="flex w-full h-full" style={{ visibility: isPreviewingOpacity ? 'hidden' : 'visible' }}>
              {/* Sidebar */}
              <div className="w-64 bg-bg-sidebar flex flex-col border-r border-border-subtle">
                <div className="p-6">
                  <h2 className="font-semibold text-gray-400 text-xs uppercase tracking-wider mb-2">Settings</h2>
                  <nav className="space-y-1">
                    {[
                      { id: 'general', label: 'General', icon: <Monitor size={16} /> },
                      { id: 'natively-api', label: 'Natively API', icon: <NativelyLogoMark size={16} className={activeTab === 'natively-api' ? 'text-blue-500' : 'text-blue-500/70'} /> },
                      { id: 'natively-pro', label: 'Natively Pro', icon: <NativelyLogoMark size={16} /> },
                      { id: 'ai-providers', label: 'AI Providers', icon: <FlaskConical size={16} /> },
                      { id: 'calendar', label: 'Calendar', icon: <Calendar size={16} /> },
                      { id: 'knowledge', label: 'Knowledge Base', icon: <CheckCircle size={16} /> },
                      { id: 'audio', label: 'Audio', icon: <Mic size={16} /> },
                      { id: 'keybinds', label: 'Keybinds', icon: <Keyboard size={16} /> },
                      { id: 'code-execution', label: 'Code Execution', icon: <Terminal size={16} /> },
                      { id: 'phone-mirror', label: 'Phone Mirror', icon: <Smartphone size={16} /> },
                      { id: 'help', label: 'Setup & Help', icon: <HelpCircle size={16} /> },
                      { id: 'about', label: 'About', icon: <Info size={16} /> },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3 ${
                          activeTab === tab.id ? 'bg-bg-item-active text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50'
                        }`}
                      >
                        {tab.icon}
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="mt-auto p-6 border-t border-border-subtle">
                  <button onClick={() => window.electronAPI?.quitApp?.()} className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-3">
                    <LogOut size={16} /> Quit Natively
                  </button>
                  <button onClick={onClose} className="mt-2 w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-item-active/50 transition-colors flex items-center gap-3">
                    <X size={18} /> Close
                  </button>
                </div>
              </div>

              {/* Content Panel */}
              <div className="flex-1 bg-bg-main overflow-y-auto p-8 relative">
                {activeTab === 'general' && (
                  <div className="space-y-6">
                    {/* Undetectable Toggle */}
                    <div className={`${isLight ? 'bg-bg-card' : 'bg-bg-item-surface'} rounded-xl p-5 border border-border-subtle flex items-center justify-between`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <Ghost size={18} className="text-text-primary" />
                          <h3 className="text-lg font-bold text-text-primary">{isUndetectable ? 'Undetectable' : 'Detectable'}</h3>
                        </div>
                        <p className="text-xs text-text-secondary">Natively is currently {isUndetectable ? 'undetectable' : 'detectable'} by screen-sharing.</p>
                      </div>
                      <div
                        onClick={() => {
                          const next = !isUndetectable;
                          setIsUndetectable(next);
                          window.electronAPI?.setUndetectable?.(next);
                          analytics.trackModeSelected(next ? 'undetectable' : 'overlay');
                        }}
                        className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${isUndetectable ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isUndetectable ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                    </div>

                    {/* Mouse Passthrough */}
                    <div className={`${isLight ? 'bg-bg-card' : 'bg-bg-item-surface'} rounded-xl p-5 border border-border-subtle flex items-center justify-between`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <PointerOff size={18} className={isMousePassthrough ? 'text-sky-400' : 'text-text-primary'} />
                          <h3 className="text-lg font-bold text-text-primary">Mouse Passthrough</h3>
                        </div>
                        <p className="text-xs text-text-secondary">Overlay stays visible but passes all mouse clicks through.</p>
                      </div>
                      <div
                        onClick={() => {
                          const next = !isMousePassthrough;
                          setIsMousePassthrough(next);
                          window.electronAPI?.setOverlayMousePassthrough?.(next);
                        }}
                        className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${isMousePassthrough ? 'bg-sky-500' : 'bg-bg-toggle-switch border border-border-muted'}`}
                      >
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${isMousePassthrough ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                    </div>

                    {/* General Settings List */}
                    <div className={`rounded-xl border ${isLight ? 'bg-bg-card border-border-subtle divide-y divide-border-subtle' : 'bg-transparent border-transparent divide-y divide-border-subtle/20'}`}>
                      {/* Open at Login */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-bg-item-surface rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                            <Power size={20} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-text-primary">Open Natively on Login</h3>
                            <p className="text-xs text-text-secondary mt-0.5">Start automatically when logging into computer</p>
                          </div>
                        </div>
                        <div
                          onClick={() => {
                            const next = !openOnLogin;
                            setOpenOnLogin(next);
                            window.electronAPI?.setOpenAtLogin?.(next);
                          }}
                          className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${openOnLogin ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                        >
                          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${openOnLogin ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                      </div>

                      {/* Debug Logging */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-bg-item-surface rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                            <Terminal size={20} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-text-primary">Verbose Debug Logging</h3>
                            <p className="text-xs text-text-secondary mt-0.5">Print detailed STT and pipeline diagnostics</p>
                          </div>
                        </div>
                        <div
                          onClick={() => {
                            const next = !verboseLogging;
                            setVerboseLogging(next);
                            window.electronAPI?.setVerboseLogging?.(next);
                            if (next) {
                              setShowVerboseToast(true);
                              window.setTimeout(() => setShowVerboseToast(false), 4000);
                            } else {
                              setShowVerboseToast(false);
                            }
                          }}
                          className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${verboseLogging ? 'bg-amber-500' : 'bg-bg-toggle-switch border border-border-muted'}`}
                        >
                          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${verboseLogging ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                      </div>

                      {showVerboseToast && (
                        <div role="status" className="mx-4 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between gap-3">
                          <span>Verbose diagnostics are enabled. Detailed STT and pipeline information will be written to the app logs.</span>
                          <button onClick={() => setShowVerboseToast(false)} aria-label="Dismiss logging notice">×</button>
                        </div>
                      )}

                      {/* Interviewer Transcript */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-bg-item-surface rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                            <MessageSquare size={20} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-text-primary">Interviewer Transcript</h3>
                            <p className="text-xs text-text-secondary mt-0.5">Show real-time transcription overlay</p>
                          </div>
                        </div>
                        <div
                          onClick={() => {
                            const next = !showTranscript;
                            setShowTranscript(next);
                            localStorage.setItem('natively_interviewer_transcript', String(next));
                            window.dispatchEvent(new Event('storage'));
                          }}
                          className={`w-11 h-6 rounded-full relative transition-colors cursor-pointer ${showTranscript ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                        >
                          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${showTranscript ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                      </div>

                      {/* Theme */}
                      <div className="flex items-center justify-between px-4 py-3" ref={themeDropdownRef}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-bg-item-surface rounded-lg border border-border-subtle flex items-center justify-center text-text-tertiary">
                            <Palette size={20} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-text-primary">Theme</h3>
                            <p className="text-xs text-text-secondary mt-0.5">Customize appearance</p>
                          </div>
                        </div>
                        <div className="relative">
                          <button
                            onClick={() => setIsThemeDropdownOpen(!isThemeDropdownOpen)}
                            className="bg-bg-component border border-border-subtle px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2"
                          >
                            <span className="capitalize">{themeMode}</span>
                            <ChevronDown size={12} />
                          </button>
                          {isThemeDropdownOpen && (
                            <div className="absolute right-0 top-full mt-1 bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-20 p-1 w-28">
                              {(['system', 'light', 'dark'] as const).map((m) => (
                                <button
                                  key={m}
                                  onClick={() => {
                                    setThemeMode(m);
                                    window.electronAPI?.setThemeMode?.(m);
                                    setIsThemeDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-2 py-1.5 rounded text-xs capitalize hover:bg-bg-input"
                                >
                                  {m}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${isLight ? 'bg-bg-card border-border-subtle' : 'bg-bg-item-surface border-border-subtle'}`}>
                      <div>
                        <h3 className="text-sm font-bold text-text-primary">Meeting Interface Style</h3>
                        <p className="text-xs text-text-secondary mt-1">Choose the visual treatment used by the interview overlay.</p>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setIsInterfaceThemeDropdownOpen(!isInterfaceThemeDropdownOpen)}
                          className="min-w-[130px] rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-xs text-text-primary flex items-center justify-between gap-2"
                        >
                          {meetingInterfaceTheme === 'liquid-glass' ? 'Liquid Glass' : 'Classic'}
                          <ChevronDown size={12} />
                        </button>
                        {isInterfaceThemeDropdownOpen && (
                          <div className="absolute right-0 top-full mt-1 z-30 w-36 rounded-lg border border-border-subtle bg-bg-elevated p-1 shadow-xl">
                            {([
                              ['default', 'Classic'],
                              ['liquid-glass', 'Liquid Glass'],
                            ] as const).map(([value, label]) => (
                              <button
                                key={value}
                                onClick={() => {
                                  setMeetingInterfaceThemeState(value);
                                  setMeetingInterfaceTheme(value);
                                  setIsInterfaceThemeDropdownOpen(false);
                                }}
                                className="w-full rounded px-2 py-1.5 text-left text-xs text-text-primary hover:bg-bg-item-active"
                              >{label}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Restore the existing disguise, privacy, vision and retention controls. */}
                    <div className={`rounded-xl border p-5 space-y-5 ${isLight ? 'bg-bg-card border-border-subtle' : 'bg-bg-item-surface border-border-subtle'}`}>
                      <div>
                        <h3 className="text-sm font-bold text-text-primary">Disguise Mode</h3>
                        <p className="text-xs text-text-secondary mt-1">Choose the window identity used by Natively.</p>
                        <select
                          value={disguiseMode}
                          onChange={(e) => {
                            const mode = e.target.value as 'terminal' | 'settings' | 'activity' | 'none';
                            setDisguiseMode(mode);
                            void window.electronAPI?.setDisguise?.(mode);
                          }}
                          className="mt-3 w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary"
                        >
                          <option value="none">No disguise</option>
                          <option value="terminal">Terminal</option>
                          <option value="settings">System Settings</option>
                          <option value="activity">Activity Monitor</option>
                        </select>
                      </div>
                      <div className="border-t border-border-subtle pt-4">
                        <h3 className="text-sm font-bold text-text-primary">Screen Understanding</h3>
                        <p className="text-xs text-text-secondary mt-1">Control how screenshots are routed to vision providers.</p>
                        <select
                          value={screenUnderstandingMode}
                          onChange={(e) => {
                            const mode = e.target.value as 'vision_first' | 'vision_only' | 'private_vision';
                            setScreenUnderstandingMode(mode);
                            void window.electronAPI?.setScreenUnderstandingMode?.(mode);
                          }}
                          className="mt-3 w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary"
                        >
                          <option value="vision_first">Vision First — use available vision providers</option>
                          <option value="vision_only">Vision Only — require a vision-capable provider</option>
                          <option value="private_vision">Private Vision — local providers only</option>
                        </select>
                        <label className="mt-3 flex items-center gap-2 text-sm text-text-primary">
                          <input
                            type="checkbox"
                            checked={technicalInterviewVisionFirst}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              setTechnicalInterviewVisionFirst(enabled);
                              void window.electronAPI?.setTechnicalInterviewVisionFirst?.(enabled);
                            }}
                            className="accent-blue-500"
                          />
                          Prefer direct vision for technical interviews
                        </label>
                      </div>
                      <div className="border-t border-border-subtle pt-4">
                        <h3 className="text-sm font-bold text-text-primary">Meeting Data Retention</h3>
                        <p className="text-xs text-text-secondary mt-1">Choose how long meeting transcripts and related data are retained.</p>
                        <select
                          value={meetingRetention}
                          onChange={(e) => {
                            const retention = e.target.value as 'forever' | '7d' | '30d' | 'never';
                            setMeetingRetention(retention);
                            void window.electronAPI?.setMeetingRetention?.(retention);
                          }}
                          className="mt-3 w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary"
                        >
                          <option value="forever">Keep forever</option>
                          <option value="7d">Delete after 7 days</option>
                          <option value="30d">Delete after 30 days</option>
                          <option value="never">Do not retain meeting transcripts</option>
                        </select>
                      </div>
                      <div className="border-t border-border-subtle pt-4">
                        <h3 className="text-sm font-bold text-text-primary">Overlay Behavior</h3>
                        <label className="mt-3 flex items-center gap-2 text-sm text-text-primary">
                          <input
                            type="checkbox"
                            checked={autoScroll}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              setAutoScroll(enabled);
                              localStorage.setItem('natively_auto_scroll', String(enabled));
                              window.dispatchEvent(new Event('storage'));
                            }}
                            className="accent-blue-500"
                          />
                          Automatically scroll to the latest answer
                        </label>
                      </div>
                    </div>

                    <div className={`rounded-xl border p-5 ${isLight ? 'bg-bg-card border-border-subtle' : 'bg-bg-item-surface border-border-subtle'}`}>
                      <h3 className="text-sm font-bold text-text-primary">Provider Data Scopes</h3>
                      <p className="text-xs text-text-secondary mt-1 mb-4">Choose which local data categories may be included in provider requests.</p>
                      <div className="space-y-3">
                        {([
                          ['transcript', 'Interview transcript', 'Share transcript context with the active provider'],
                          ['screenshots', 'Screenshots', 'Allow screenshots to be sent to vision providers'],
                          ['reference_files', 'Reference files', 'Allow uploaded reference documents in provider context'],
                          ['profile_history', 'Profile history', 'Allow profile and interview history in requests'],
                          ['embeddings', 'Embeddings', 'Allow embedding providers to process local text chunks'],
                          ['post_call_summary', 'Post-call summary', 'Allow meeting summaries to be used as context'],
                        ] as const).map(([key, label, description]) => (
                          <label key={key} className="flex items-start gap-3 text-sm">
                            <input
                              type="checkbox"
                              checked={providerDataScopes[key] !== false}
                              onChange={(e) => {
                                const next = { ...providerDataScopes, [key]: e.target.checked };
                                setProviderDataScopes(next);
                                void window.electronAPI?.setProviderDataScopes?.(next);
                              }}
                              className="mt-0.5 accent-blue-500"
                            />
                            <span className="min-w-0">
                              <span className="block text-text-primary font-medium">{label}</span>
                              <span className="block text-xs text-text-secondary mt-0.5">{description}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Opacity Slider */}
                    <div id="opacity-slider-card" className={`${isLight ? 'bg-bg-card' : 'bg-bg-item-surface'} rounded-xl p-5 border border-border-subtle`}>
                      <div className="flex items-center justify-between mb-3">
                        <label className="flex items-center gap-2 text-xs font-medium text-text-secondary uppercase">
                          <Eye size={13} /> Interface Opacity
                        </label>
                        <span className="opacity-percent-label text-xs font-semibold tabular-nums">{Math.round(overlayOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min={OVERLAY_OPACITY_MIN}
                        max={1.0}
                        step={0.01}
                        defaultValue={overlayOpacity}
                        onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                        onPointerDown={startPreviewingOpacity}
                        onPointerUp={stopPreviewingOpacity}
                        onPointerCancel={stopPreviewingOpacity}
                        className="w-full h-1.5 rounded-full appearance-none bg-bg-input accent-accent-primary"
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'ai-providers' && (
                  <div className="space-y-6">
                    <AIProvidersSettings />
                    <WhisperSettings />
                  </div>
                )}

                {activeTab === 'natively-api' && <NativelyApiSettings />}
                {activeTab === 'natively-pro' && <NativelyProSettings />}
                {activeTab === 'knowledge' && <KnowledgeBaseTab currentSettings={currentSettings} onSettingsChange={onSettingsChange} />}

                {activeTab === 'calendar' && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-xl font-bold text-text-primary">Calendar</h2>
                      <p className="text-sm text-text-secondary mt-1">Connect Google Calendar to see your upcoming meetings inside Natively.</p>
                    </div>
                    <div className="rounded-xl border border-border-subtle bg-bg-card p-5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-semibold text-text-primary">Google Calendar</div>
                        <div className="text-sm text-text-secondary mt-1">
                          {calendarStatus.connected ? `Connected${calendarStatus.email ? ` as ${calendarStatus.email}` : ''}` : 'Not connected'}
                        </div>
                      </div>
                      {calendarStatus.connected ? (
                        <button
                          onClick={async () => {
                            setIsCalendarsLoading(true);
                            try {
                              const result = await window.electronAPI?.calendarDisconnect?.();
                              if (result?.success) { setCalendarStatus({ connected: false }); setCalendarEvents([]); }
                            } finally { setIsCalendarsLoading(false); }
                          }}
                          disabled={isCalendarsLoading}
                          className="px-4 py-2 rounded-lg border border-border-subtle text-sm text-text-primary hover:bg-bg-item-active disabled:opacity-50"
                        >Disconnect</button>
                      ) : (
                        <button
                          onClick={async () => {
                            setIsCalendarsLoading(true);
                            try {
                              const result = await window.electronAPI?.calendarConnect?.();
                              if (result?.success) {
                                const status = await window.electronAPI?.getCalendarStatus?.();
                                setCalendarStatus(status || { connected: false });
                              } else if (result?.error) setCalendarStatus({ connected: false, email: result.error });
                            } finally { setIsCalendarsLoading(false); }
                          }}
                          disabled={isCalendarsLoading}
                          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
                        >{isCalendarsLoading ? 'Connecting…' : 'Connect Google Calendar'}</button>
                      )}
                    </div>
                    {calendarStatus.connected && (
                      <div className="rounded-xl border border-border-subtle bg-bg-card p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="font-semibold text-text-primary">Upcoming Events</h3>
                          <button
                            onClick={async () => {
                              setIsCalendarRefreshing(true);
                              try {
                                await window.electronAPI?.calendarRefresh?.();
                                const events = await window.electronAPI?.getUpcomingEvents?.();
                                setCalendarEvents(events || []);
                              } finally { setIsCalendarRefreshing(false); }
                            }}
                            disabled={isCalendarRefreshing}
                            className="text-sm text-blue-500 hover:text-blue-400 disabled:opacity-50"
                          >{isCalendarRefreshing ? 'Refreshing…' : 'Refresh'}</button>
                        </div>
                        {calendarEvents.length ? calendarEvents.map(event => (
                          <div key={event.id} className="border-t border-border-subtle pt-3">
                            <div className="font-medium text-text-primary">{event.title}</div>
                            <div className="text-xs text-text-secondary mt-1">{new Date(event.startTime).toLocaleString()} – {new Date(event.endTime).toLocaleTimeString()}</div>
                            {event.link && <button onClick={() => window.electronAPI?.openExternal?.(event.link)} className="text-xs text-blue-500 mt-1">Open event</button>}
                          </div>
                        )) : <p className="text-sm text-text-secondary">No upcoming events found.</p>}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'keybinds' && (
                  <div className="space-y-5">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-bold text-text-primary">Keyboard Shortcuts</h3>
                      <button onClick={resetShortcuts} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border-subtle text-xs hover:text-green-500">
                        <RotateCcw size={13} /> Restore Defaults
                      </button>
                    </div>
                    <div className="space-y-2">
                      {Object.keys(shortcuts).map((key) => (
                        <div key={key} className="flex items-center justify-between py-1.5 border-b border-border-subtle/40">
                          <span className="text-sm text-text-secondary capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                          <KeyRecorder currentKeys={(shortcuts as any)[key]} onSave={(keys) => updateShortcut(key as any, keys)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'audio' && (
                  <div className="space-y-6">
                    {/* Audio Modes */}
                    <div className="space-y-3">
                      {[
                        {
                          id: 'toggle-only-interviewer-mode',
                          title: '🎧 Only Interviewer Mode',
                          desc: "Silences microphone from AI pipeline, transcribing only interviewer's output.",
                          val: onlyInterviewerMode,
                          toggle: async () => {
                            const n = !onlyInterviewerMode;
                            setOnlyInterviewerMode(n);
                            await (window.electronAPI as any)?.setOnlyInterviewerMode?.(n);
                          },
                        },
                        {
                          id: 'toggle-noise-cancellation',
                          title: '🔇 Noise Cancellation',
                          desc: 'Aggressive VAD filtering for fan noise and ambient room acoustics.',
                          val: noiseCancellationEnabled,
                          toggle: async () => {
                            const n = !noiseCancellationEnabled;
                            setNoiseCancellationEnabled(n);
                            await (window.electronAPI as any)?.setNoiseCancellationEnabled?.(n);
                          },
                        },
                        {
                          id: 'toggle-mock-interview-mode',
                          title: '🎤 Mock Interview Mode',
                          desc: 'Routes microphone into the interviewer channel for self-practice.',
                          val: mockInterviewMode,
                          toggle: async () => {
                            const n = !mockInterviewMode;
                            setMockInterviewMode(n);
                            await (window.electronAPI as any)?.setMockInterviewMode?.(n);
                          },
                        },
                      ].map((item) => (
                        <div key={item.id} className="bg-bg-card rounded-xl border border-border-subtle p-4 flex justify-between items-center">
                          <div>
                            <h4 className="text-sm font-semibold">{item.title}</h4>
                            <p className="text-xs text-text-secondary">{item.desc}</p>
                          </div>
                          <button
                            id={item.id}
                            onClick={item.toggle}
                            className={`w-11 h-6 rounded-full relative transition-colors ${item.val ? 'bg-blue-600' : 'bg-bg-input border border-border-subtle'}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${item.val ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Restore recognition and response language controls. */}
                    <div className="bg-bg-card rounded-xl border border-border-subtle p-4 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-text-primary">Speech Recognition Language</h3>
                        <p className="text-xs text-text-secondary mt-1">Choose the language used by speech transcription.</p>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <select
                            value={selectedSttGroup}
                            onChange={(e) => setSelectedSttGroup(e.target.value)}
                            className="w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary"
                          >
                            {languageGroups.map((group: string) => <option key={group} value={group}>{group}</option>)}
                          </select>
                          <select
                            value={recognitionLanguage}
                            onChange={(e) => {
                              const language = e.target.value;
                              setRecognitionLanguage(language);
                              void window.electronAPI?.setRecognitionLanguage?.(language);
                            }}
                            className="w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary"
                          >
                            {currentGroupVariants.map((language) => (
                              <option key={language.deviceId} value={language.deviceId}>{language.label}</option>
                            ))}
                          </select>
                        </div>
                        {autoDetectedLanguage && <p className="text-xs text-text-secondary mt-2">Auto-detected: {autoDetectedLanguage}</p>}
                      </div>
                      <div className="border-t border-border-subtle pt-4">
                        <h3 className="text-sm font-semibold text-text-primary">AI Response Language</h3>
                        <p className="text-xs text-text-secondary mt-1">Choose the language Natively should use when generating answers.</p>
                        <select
                          value={aiResponseLanguage}
                          onChange={(e) => {
                            setAiResponseLanguage(e.target.value);
                            void window.electronAPI?.setAiResponseLanguage?.(e.target.value);
                          }}
                          className="mt-3 w-full rounded-lg border border-border-subtle bg-bg-input px-3 py-2 text-sm text-text-primary"
                        >
                          {availableAiLanguages.map((language: any) => (
                            <option key={language.code} value={language.code}>{language.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Speech Providers */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-bold">Speech Provider</h3>
                      <ProviderSelect
                        value={sttProvider}
                        onChange={(val) => handleSttProviderChange(val as SttProviderType)}
                        options={[
                          ...(hasNativelyKey ? [{ id: 'natively', label: 'Natively API', badge: 'Saved', recommended: true, desc: 'Managed transcription', color: 'blue', icon: <Mic size={14} /> }] : []),
                          { id: 'google', label: 'Google Cloud', badge: googleServiceAccountPath ? 'Saved' : null, recommended: true, desc: 'gRPC streaming', color: 'blue', icon: <Mic size={14} /> },
                          { id: 'groq', label: 'Groq Whisper', badge: storedKeysStatus.groq ? 'Saved' : null, recommended: true, desc: 'Fast REST transcription', color: 'orange', icon: <Mic size={14} /> },
                          { id: 'openai', label: 'OpenAI Whisper', badge: storedKeysStatus.openai ? 'Saved' : null, desc: 'Standard Whisper API', color: 'green', icon: <Mic size={14} /> },
                          { id: 'deepgram', label: 'Deepgram Nova-3', badge: storedKeysStatus.deepgram ? 'Saved' : null, recommended: true, desc: 'High-accuracy streaming', color: 'purple', icon: <Mic size={14} /> },
                          { id: 'elevenlabs', label: 'ElevenLabs Scribe', badge: storedKeysStatus.elevenlabs ? 'Saved' : null, desc: 'Scribe Realtime', color: 'teal', icon: <Mic size={14} /> },
                          { id: 'azure', label: 'Azure Speech', badge: storedKeysStatus.azure ? 'Saved' : null, desc: 'Cognitive Services', color: 'cyan', icon: <Mic size={14} /> },
                          { id: 'ibmwatson', label: 'IBM Watson', badge: storedKeysStatus.ibmwatson ? 'Saved' : null, desc: 'Cloud STT', color: 'indigo', icon: <Mic size={14} /> },
                          { id: 'soniox', label: 'Soniox', badge: storedKeysStatus.soniox ? 'Saved' : null, desc: 'Multilingual model', color: 'cyan', icon: <Mic size={14} /> },
                          { id: 'local-whisper', label: 'Local Whisper', badge: null, desc: 'Device-local Whisper', color: 'green', icon: <Cpu size={14} /> },
                          { id: 'sherpa', label: 'Sherpa-ONNX', badge: 'Local', desc: 'Offline Sherpa + Silero VAD; Web Speech fallback if model is missing', color: 'green', icon: <Cpu size={14} /> },
                          { id: 'custom-stt', label: 'Custom STT', badge: hasStoredCustomSttKey ? 'Saved' : null, desc: 'Custom REST speech API', color: 'purple', icon: <Mic size={14} /> },
                        ]}
                      />

                      {/* API Key Form for Key-based Providers */}
                      {['groq', 'openai', 'deepgram', 'elevenlabs', 'azure', 'ibmwatson', 'soniox'].includes(sttProvider) && (
                        <div className="bg-bg-card rounded-xl border border-border-subtle p-4 space-y-3">
                          <label className="text-xs font-medium text-text-secondary capitalize">{sttProvider} API Key</label>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={sttKeys[sttProvider] || ''}
                              onChange={(e) => setSttKeys({ ...sttKeys, [sttProvider]: e.target.value })}
                              placeholder={storedKeysStatus[sttProvider] ? '••••••••••••' : `Enter ${sttProvider} key`}
                              className="flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary"
                            />
                            <button
                              onClick={() => handleSttKeySubmit(sttProvider, sttKeys[sttProvider])}
                              disabled={sttSaving}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium"
                            >
                              {sttSaving ? 'Saving...' : sttSaved ? 'Saved!' : 'Save'}
                            </button>
                            {storedKeysStatus[sttProvider] && (
                              <button onClick={() => handleRemoveSttKey(sttProvider)} className="p-2 text-text-tertiary hover:text-red-400">
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                          {sttProvider === 'openai' && (
                            <div className="border-t border-border-subtle pt-3 space-y-2">
                              <label className="block text-xs font-medium text-text-secondary">OpenAI-compatible STT Base URL (optional)</label>
                              <div className="flex gap-2">
                                <input
                                  type="url"
                                  value={sttOpenaiBaseUrl}
                                  onChange={(e) => setSttOpenaiBaseUrl(e.target.value)}
                                  placeholder="https://your-server/v1"
                                  className="min-w-0 flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary"
                                />
                                <button
                                  onClick={async () => {
                                    const result = await window.electronAPI?.setOpenAiSttBaseUrl?.(sttOpenaiBaseUrl.trim());
                                    if (!result?.success) setSttTestError(result?.error || 'Could not save the custom endpoint');
                                    else setSttTestError('');
                                  }}
                                  className="px-3 py-2 rounded-lg border border-border-subtle text-xs text-text-primary hover:bg-bg-input"
                                >Save URL</button>
                              </div>
                              <p className="text-[11px] text-text-secondary">Leave blank to use the official OpenAI transcription endpoint. Useful for self-hosted OpenAI-compatible services such as Speaches.</p>
                            </div>
                          )}
                          <div className="flex items-center gap-3 pt-2">
                            <button onClick={handleTestSttConnection} className="text-xs bg-bg-input hover:bg-bg-elevated px-3 py-1.5 rounded border border-border-subtle">
                              Test Connection
                            </button>
                            {sttTestStatus === 'error' && <span className="text-xs text-red-400">{sttTestError}</span>}
                            {sttTestStatus === 'success' && <span className="text-xs text-green-400">Connected</span>}
                          </div>
                        </div>
                      )}

                      {/* Local Whisper Panel */}
                      {sttProvider === 'local-whisper' && <LocalWhisperModelPanel />}

                      {/* Custom STT Panel */}
                      {sttProvider === 'custom-stt' && (
                        <div className="bg-bg-card rounded-xl border border-border-subtle p-4 space-y-3">
                          <input
                            type="text"
                            placeholder="Endpoint URL"
                            value={customSttEndpoint}
                            onChange={(e) => setCustomSttEndpoint(e.target.value)}
                            className="w-full bg-bg-input border border-border-subtle rounded px-3 py-2 text-sm"
                          />
                          <div className="flex gap-2">
                            <input
                              type="password"
                              placeholder="API Key (optional)"
                              value={customSttApiKey}
                              onChange={(e) => setCustomSttApiKey(e.target.value)}
                              className="flex-1 bg-bg-input border border-border-subtle rounded px-3 py-2 text-sm"
                            />
                            <button onClick={handleCustomSttSave} className="px-4 py-2 bg-blue-600 text-white rounded text-xs font-medium">
                              Save
                            </button>
                          </div>
                        </div>
                      )}

                      {deviceFallbackNotice && (
                        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                          <div className="flex items-start justify-between gap-3">
                            <span>{deviceFallbackNotice.kind === 'input' ? 'Microphone' : 'Output'} device selection fell back to {deviceFallbackNotice.actual || 'the system default'}{deviceFallbackNotice.reason ? `: ${deviceFallbackNotice.reason}` : '.'}</span>
                            <button onClick={() => setDeviceFallbackNotice(null)} aria-label="Dismiss device notice">×</button>
                          </div>
                        </div>
                      )}
                      {/* Devices Input/Output */}
                      <CustomSelect
                        label="Input Device"
                        icon={<Mic size={16} />}
                        value={selectedInput}
                        options={inputDevices}
                        onChange={(id) => {
                          setSelectedInput(id);
                          localStorage.setItem('preferredInputDeviceId', id);
                        }}
                      />
                      <div className="h-1.5 bg-bg-input rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 transition-all duration-100 ease-out" style={{ width: `${micLevel}%` }} />
                      </div>
                      <CustomSelect
                        label="Output Device"
                        icon={<Speaker size={16} />}
                        value={selectedOutput}
                        options={outputDevices}
                        onChange={(id) => {
                          setSelectedOutput(id);
                          localStorage.setItem('preferredOutputDeviceId', id);
                        }}
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'code-execution' && <ExecutionEnginesSettings />}
                {activeTab === 'phone-mirror' && <PhoneMirrorSettings />}
                {activeTab === 'help' && <HelpSettings onNavigate={setActiveTab} />}
                {activeTab === 'about' && <AboutSection />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      <div id="settings-mockup-wrapper" className="fixed inset-0 z-[49] pointer-events-none transition-opacity duration-150" style={{ opacity: isPreviewingOpacity ? 1 : 0 }}>
        <MockupNativelyInterface opacity={previewOverlayOpacity} />
      </div>
    </AnimatePresence>
  );
};

export default SettingsOverlay;