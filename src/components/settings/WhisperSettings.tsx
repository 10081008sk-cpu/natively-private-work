import React, { useState, useEffect } from 'react';
import { Mic, Save, RefreshCw, CheckCircle, AlertCircle, FolderOpen, Globe, Cpu } from 'lucide-react';

const WHISPER_MODEL_OPTIONS = [
  { id: 'tiny', name: 'Tiny (75 MB, fastest)' },
  { id: 'tiny.en', name: 'Tiny English (75 MB)' },
  { id: 'base', name: 'Base (142 MB)' },
  { id: 'base.en', name: 'Base English (142 MB, default)' },
  { id: 'small', name: 'Small (466 MB)' },
  { id: 'small.en', name: 'Small English (466 MB)' },
  { id: 'medium', name: 'Medium (1.5 GB)' },
  { id: 'medium.en', name: 'Medium English (1.5 GB)' },
  { id: 'large', name: 'Large (2.9 GB, best accuracy)' },
];

interface WhisperConfig {
  engineType: 'package' | 'manual';
  selectedModel: string;
  customModelPath: string;
  endpointUrl: string;
}

interface ModelSelectProps {
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
}

const ModelSelect: React.FC<ModelSelectProps> = ({ value, options, onChange, placeholder = 'Select model' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.id === value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-primary flex items-center justify-between hover:bg-bg-elevated transition-colors"
        type="button"
      >
        <span className="truncate pr-2">{selectedOption ? selectedOption.name : placeholder}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full bg-bg-elevated border border-border-subtle rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto animated fadeIn">
          <div className="p-1 space-y-0.5">
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => { onChange(option.id); setIsOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs rounded-md flex items-center justify-between group transition-colors ${value === option.id ? 'bg-bg-input text-text-primary' : 'text-text-secondary hover:bg-bg-input hover:text-text-primary'}`}
                type="button"
              >
                <span className="truncate">{option.name}</span>
                {value === option.id && <CheckCircle size={14} className="text-accent-primary shrink-0 ml-2" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const WhisperSettings: React.FC = () => {
  const [config, setConfig] = useState<WhisperConfig>({
    engineType: 'package',
    selectedModel: 'base.en',
    customModelPath: '',
    endpointUrl: '',
  });
  const [saved, setSaved] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('natively_whisper_config');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as WhisperConfig;
        if (parsed.engineType) setConfig(parsed);
      } catch {}
    }
  }, []);

  const persist = (next: WhisperConfig) => {
    setConfig(next);
    localStorage.setItem('natively_whisper_config', JSON.stringify(next));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDownloadModel = async () => {
    setDownloadStatus('downloading');
    setDownloadError('');
    try {
      const result = await window.electronAPI?.whisperDownloadModel?.(config.selectedModel);
      if (result?.success) {
        setDownloadStatus('done');
        setTimeout(() => setDownloadStatus('idle'), 3000);
      } else {
        setDownloadStatus('error');
        setDownloadError(result?.error || 'Download failed');
      }
    } catch (e: any) {
      setDownloadStatus('error');
      setDownloadError(e.message || 'Download failed');
    }
  };

  const handleTestEndpoint = async () => {
    if (!config.endpointUrl) return;
    try {
      const res = await fetch(config.endpointUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setDownloadStatus('done');
        setTimeout(() => setDownloadStatus('idle'), 3000);
      } else {
        setDownloadStatus('error');
        setDownloadError(`Endpoint returned ${res.status}`);
      }
    } catch (e: any) {
      setDownloadStatus('error');
      setDownloadError(e.message || 'Endpoint unreachable');
    }
  };

  return (
    <div className="space-y-5 animated fadeIn pb-10">
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-1">Speech-to-Text (STT) Settings</h3>
        <p className="text-xs text-text-secondary mb-2">
          Configure local Whisper speech recognition for the Live Interview feature.
        </p>
      </div>

      <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-text-secondary" />
            <label className="text-xs font-medium text-text-primary uppercase tracking-wide">Engine Mode</label>
          </div>
          <div className="flex items-center gap-1 bg-bg-input rounded-lg border border-border-subtle p-0.5">
            <button
              onClick={() => persist({ ...config, engineType: 'package' })}
              className={`px-3 py-1 text-xs rounded-md transition-all ${config.engineType === 'package' ? 'bg-accent-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              type="button"
            >
              Whisper Presets
            </button>
            <button
              onClick={() => persist({ ...config, engineType: 'manual' })}
              className={`px-3 py-1 text-xs rounded-md transition-all ${config.engineType === 'manual' ? 'bg-accent-primary text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              type="button"
            >
              Manual Config
            </button>
          </div>
        </div>

        {config.engineType === 'package' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
                  <Cpu size={12} /> Model Size
                </span>
                <ModelSelect
                  value={config.selectedModel}
                  options={WHISPER_MODEL_OPTIONS}
                  onChange={(val) => persist({ ...config, selectedModel: val })}
                  placeholder="Select model size"
                />
              </label>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="min-h-5">
                {downloadStatus === 'done' && (
                  <div className="flex items-center gap-2 text-xs text-green-400">
                    <CheckCircle size={14} /> Model ready
                  </div>
                )}
                {downloadStatus === 'error' && (
                  <div className="flex items-center gap-2 text-xs text-red-400">
                    <AlertCircle size={14} /> {downloadError}
                  </div>
                )}
                {downloadStatus === 'downloading' && (
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <RefreshCw size={14} className="animate-spin" /> Downloading...
                  </div>
                )}
              </div>
              <button
                onClick={handleDownloadModel}
                disabled={downloadStatus === 'downloading'}
                className="flex items-center gap-2 px-3 py-1.5 bg-bg-input hover:bg-bg-elevated border border-border-subtle rounded-lg text-xs font-medium text-text-primary transition-colors disabled:opacity-60"
                type="button"
              >
                <RefreshCw size={14} className={downloadStatus === 'downloading' ? 'animate-spin' : ''} />
                Download Model
              </button>
            </div>
          </div>
        )}

        {config.engineType === 'manual' && (
          <div className="space-y-3">
            <label className="space-y-1">
              <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
                <FolderOpen size={12} /> Custom Model Path
              </span>
              <input
                type="text"
                value={config.customModelPath}
                onChange={(e) => persist({ ...config, customModelPath: e.target.value })}
                placeholder="/absolute/path/to/model.bin"
                className="w-full bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-primary"
              />
              <p className="text-[10px] text-text-secondary mt-0.5">Absolute path to a custom GGML .bin model file.</p>
            </label>

            <label className="space-y-1">
              <span className="text-[10px] font-medium text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
                <Globe size={12} /> Endpoint URL
              </span>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={config.endpointUrl}
                  onChange={(e) => persist({ ...config, endpointUrl: e.target.value })}
                  placeholder="http://localhost:8080/inference"
                  className="min-w-0 flex-1 bg-bg-input border border-border-subtle rounded-lg px-3 py-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                />
                <button
                  onClick={handleTestEndpoint}
                  disabled={!config.endpointUrl}
                  className="px-3 py-1.5 bg-bg-input hover:bg-bg-elevated border border-border-subtle rounded-lg text-xs font-medium text-text-primary transition-colors disabled:opacity-60 flex items-center gap-1.5"
                  type="button"
                >
                  Test
                </button>
              </div>
              <p className="text-[10px] text-text-secondary mt-0.5">Self-hosted Whisper API (whisper.cpp server, Docker).</p>
            </label>
          </div>
        )}

        {saved && (
          <div className="flex items-center gap-2 text-[10px] text-green-400 pt-1">
            <CheckCircle size={12} /> Settings saved
          </div>
        )}
      </div>
    </div>
  );
};
