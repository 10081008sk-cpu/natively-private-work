import React, { useState, useEffect } from 'react';
import { Plus, X, Check, Loader2, Link, Terminal, Settings, Trash2 } from 'lucide-react';

interface CustomEngine {
  name: string;
  type: 'judge0' | 'custom';
  baseUrl: string;
  authToken?: string;
  headers?: Record<string, string>;
  languageMapping?: Record<string, string>;
  enabled: boolean;
}

interface EnginesConfig {
  judge0: { baseUrl: string; authToken: string; enabled: boolean };
  customEngines: CustomEngine[];
}

export const ExecutionEnginesSettings: React.FC = () => {
  const [config, setConfig] = useState<EnginesConfig>({
    judge0: { baseUrl: 'http://localhost:2358', authToken: '', enabled: true },
    customEngines: [],
  });
  const [judge0TestStatus, setJudge0TestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [judge0TestError, setJudge0TestError] = useState('');
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newEngine, setNewEngine] = useState<CustomEngine>({
    name: '', type: 'custom', baseUrl: '', authToken: '', headers: {}, languageMapping: {}, enabled: true,
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const result = await (window as any).electronAPI?.getExecutionEngines?.();
      if (result) setConfig(result);
    } catch {}
  };

  const saveConfig = async (next: EnginesConfig) => {
    setConfig(next);
    try {
      await (window as any).electronAPI?.setExecutionEngines?.(next);
    } catch {}
  };

  const handleJudge0Test = async () => {
    setJudge0TestStatus('testing');
    setJudge0TestError('');
    try {
      const result = await (window as any).electronAPI?.testExecutionEngine?.({
        baseUrl: config.judge0.baseUrl,
        authToken: config.judge0.authToken,
      });
      if (result?.ok) {
        setJudge0TestStatus('success');
        setTimeout(() => setJudge0TestStatus('idle'), 3000);
      } else {
        setJudge0TestStatus('error');
        setJudge0TestError(result?.error || 'Connection failed');
      }
    } catch (e: any) {
      setJudge0TestStatus('error');
      setJudge0TestError(e.message);
    }
  };

  const addCustomEngine = () => {
    if (!newEngine.name || !newEngine.baseUrl) return;
    const next = { ...config };
    next.customEngines = [...next.customEngines, { ...newEngine }];
    saveConfig(next);
    setNewEngine({ name: '', type: 'custom', baseUrl: '', authToken: '', headers: {}, languageMapping: {}, enabled: true });
    setShowAddCustom(false);
  };

  const removeCustomEngine = (index: number) => {
    const next = { ...config };
    next.customEngines = next.customEngines.filter((_, i) => i !== index);
    saveConfig(next);
  };

  const toggleCustomEngine = (index: number) => {
    const next = { ...config };
    next.customEngines = next.customEngines.map((e, i) => i === index ? { ...e, enabled: !e.enabled } : e);
    saveConfig(next);
  };

  return (
    <div className="space-y-4">
      <div className="bg-bg-item-surface rounded-xl p-5 border border-border-subtle">
        <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          Code Execution Engines
        </h3>
        <p className="text-xs text-text-secondary mb-4">
          Configure code execution backends (Judge0, local Docker, or custom APIs) for the Code button and Live Interview code analysis.
        </p>

        {/* Judge0 Configuration */}
        <div className="mb-6 p-4 rounded-lg border border-border-subtle bg-bg-surface">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${config.judge0.enabled ? 'bg-emerald-400' : 'bg-gray-400'}`} />
              <span className="text-sm font-semibold text-text-primary">Judge0</span>
            </div>
            <button
              onClick={() => saveConfig({ ...config, judge0: { ...config.judge0, enabled: !config.judge0.enabled } })}
              className={`w-11 h-6 rounded-full relative transition-colors ${config.judge0.enabled ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
            >
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${config.judge0.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-text-primary mb-1">Base URL Endpoint</label>
              <input
                type="text"
                value={config.judge0.baseUrl}
                onChange={e => setConfig({ ...config, judge0: { ...config.judge0, baseUrl: e.target.value } })}
                onBlur={() => saveConfig(config)}
                className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent-primary"
                placeholder="http://localhost:2358"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-primary mb-1">Authentication Token / API Key</label>
              <input
                type="password"
                value={config.judge0.authToken}
                onChange={e => setConfig({ ...config, judge0: { ...config.judge0, authToken: e.target.value } })}
                onBlur={() => saveConfig(config)}
                className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-primary text-xs focus:outline-none focus:ring-1 focus:ring-accent-primary"
                placeholder="Optional — X-Auth-Token header"
              />
            </div>
            <button
              onClick={handleJudge0Test}
              disabled={judge0TestStatus === 'testing'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors disabled:opacity-50"
            >
              {judge0TestStatus === 'testing' ? <Loader2 size={12} className="animate-spin" /> : <Link size={12} />}
              {judge0TestStatus === 'testing' ? 'Testing...' : judge0TestStatus === 'success' ? 'Connected' : judge0TestStatus === 'error' ? 'Failed' : 'Test Connection'}
            </button>
            {judge0TestStatus === 'error' && (
              <p className="text-xs text-red-400 mt-1">{judge0TestError}</p>
            )}
          </div>
        </div>

        {/* Custom Engines */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-text-primary">Custom Engines</span>
            <button
              onClick={() => setShowAddCustom(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors"
            >
              <Plus size={12} />
              Add Custom Engine
            </button>
          </div>

          {config.customEngines.length === 0 && !showAddCustom && (
            <p className="text-xs text-text-secondary py-4 text-center">
              No custom engines configured. Add a local Docker executor or other open-source execution tool.
            </p>
          )}

          {config.customEngines.map((engine, i) => (
            <div key={i} className="p-3 rounded-lg border border-border-subtle bg-bg-surface">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${engine.enabled ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                  <span className="text-sm font-medium text-text-primary">{engine.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-mono">{engine.type}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleCustomEngine(i)}
                    className={`w-9 h-5 rounded-full relative transition-colors ${engine.enabled ? 'bg-accent-primary' : 'bg-bg-toggle-switch border border-border-muted'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${engine.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <button onClick={() => removeCustomEngine(i)} className="p-1 hover:bg-red-500/20 rounded transition-colors">
                    <Trash2 size={12} className="text-red-400" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-text-secondary truncate">{engine.baseUrl}</p>
              {engine.languageMapping && Object.keys(engine.languageMapping).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {Object.entries(engine.languageMapping).map(([lang, mapped]) => (
                    <span key={lang} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-mono">
                      {lang} → {mapped}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Add Custom Engine Form */}
          {showAddCustom && (
            <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">New Custom Engine</span>
                <button onClick={() => setShowAddCustom(false)} className="p-1 hover:bg-white/10 rounded">
                  <X size={14} className="text-text-secondary" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Engine Name</label>
                  <input
                    type="text" value={newEngine.name}
                    onChange={e => setNewEngine({ ...newEngine, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-primary text-xs"
                    placeholder="My Docker Executor"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Type</label>
                  <select
                    value={newEngine.type}
                    onChange={e => setNewEngine({ ...newEngine, type: e.target.value as 'judge0' | 'custom' })}
                    className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-primary text-xs"
                  >
                    <option value="custom">Custom API</option>
                    <option value="judge0">Judge0-compatible</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">API Endpoint URL</label>
                <input
                  type="text" value={newEngine.baseUrl}
                  onChange={e => setNewEngine({ ...newEngine, baseUrl: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-primary text-xs"
                  placeholder="http://localhost:8080/execute"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Authentication Token (optional)</label>
                <input
                  type="password" value={newEngine.authToken || ''}
                  onChange={e => setNewEngine({ ...newEngine, authToken: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-surface text-text-primary text-xs"
                  placeholder="Bearer token or API key"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  Language Mapping <span className="text-text-secondary font-normal">(e.g., python → py, java → java8)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {['python', 'javascript', 'java', 'cpp', 'go', 'rust', 'ruby', 'php'].map(lang => (
                    <label key={lang} className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!newEngine.languageMapping?.[lang]}
                        onChange={e => {
                          const mapping = { ...(newEngine.languageMapping || {}) };
                          if (e.target.checked) mapping[lang] = lang;
                          else delete mapping[lang];
                          setNewEngine({ ...newEngine, languageMapping: mapping });
                        }}
                        className="rounded border-border-subtle"
                      />
                      {lang}
                    </label>
                  ))}
                </div>
              </div>
              {newEngine.languageMapping && Object.keys(newEngine.languageMapping).length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">Target mapping values</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(newEngine.languageMapping).map(([lang, mapped]) => (
                      <div key={lang} className="flex items-center gap-1">
                        <span className="text-xs text-text-secondary">{lang}:</span>
                        <input
                          type="text"
                          value={mapped as string}
                          onChange={e => {
                            const mapping = { ...(newEngine.languageMapping || {}) };
                            mapping[lang] = e.target.value;
                            setNewEngine({ ...newEngine, languageMapping: mapping });
                          }}
                          className="w-20 px-2 py-1 rounded border border-border-subtle bg-bg-surface text-text-primary text-[10px]"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAddCustom(false)}
                  className="px-3 py-1.5 rounded-lg border border-border-subtle text-xs text-text-secondary hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={addCustomEngine}
                  disabled={!newEngine.name || !newEngine.baseUrl}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-primary text-white text-xs font-medium hover:bg-accent-primary/90 disabled:opacity-50"
                >
                  <Check size={12} /> Add Engine
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
