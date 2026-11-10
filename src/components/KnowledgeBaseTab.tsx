import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, SlidersHorizontal } from 'lucide-react';

interface KnowledgeBaseFile {
  id: string;
  name: string;
  size: number;
  type: string;
  entriesCount: number;
  status: 'indexing' | 'ready' | 'error';
  lastIndexed: number;
  error?: string;
}

interface KnowledgeBaseSettings {
  enabled: boolean;
  confidenceThreshold: number;
  files: KnowledgeBaseFile[];
}

interface KnowledgeBaseTabProps {
  currentSettings?: KnowledgeBaseSettings;
  onSettingsChange?: (settings: Partial<KnowledgeBaseSettings>) => void;
}

const KnowledgeBaseTab: React.FC<KnowledgeBaseTabProps> = ({ currentSettings, onSettingsChange }) => {
  const [dragActive, setDragActive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const confidenceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConfidence = useRef<number | null>(null);
  const api = (window as any).electronAPI;

  useEffect(() => {
    let cancelled = false;
    if (!api?.knowledgeBaseGetSettings) {
      setUploadError('The desktop Knowledge Base service is unavailable. Restart the app after updating it.');
      setIsLoading(false);
    } else {
      api.knowledgeBaseGetSettings().then((settings: any) => {
        if (cancelled || !settings) return;
        onSettingsChange?.({ enabled: !!settings.enabled, confidenceThreshold: settings.confidenceThreshold ?? 0.8, files: Array.isArray(settings.files) ? settings.files : [] });
      }).catch((error: any) => {
        if (!cancelled) setUploadError(error?.message || 'Could not load the local Knowledge Base.');
      }).finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    }
    return () => {
      cancelled = true;
      if (confidenceSaveTimer.current) clearTimeout(confidenceSaveTimer.current);
      if (pendingConfidence.current !== null) {
        void api?.knowledgeBaseUpdateSettings?.({ confidenceThreshold: pendingConfidence.current });
        pendingConfidence.current = null;
      }
    };
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleFileUpload = async (file: File) => {
    const allowedTypes = ['.txt', '.md', '.json', '.csv', '.pdf'];
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    setUploadError(null);
    if (!allowedTypes.includes(extension)) {
      setUploadError(`Unsupported file type: ${extension}. Allowed: ${allowedTypes.join(', ')}`);
      return;
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      setUploadError('Choose a non-empty file up to 10 MB.');
      return;
    }
    if (!api?.knowledgeBaseAddDocument) {
      setUploadError('The desktop Knowledge Base service is unavailable. Restart the app after updating it.');
      return;
    }

    setIsBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
      }
      const result = await api.knowledgeBaseAddDocument({ name: file.name, dataBase64: btoa(binary) });
      if (!result?.success || !result.file) throw new Error(result?.error || 'File indexing failed');
      onSettingsChange?.({ files: [...(currentSettings?.files || []).filter(item => item.id !== result.file.id), result.file] });
    } catch (error: any) {
      setUploadError(error?.message || 'Unable to index this file.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveFile = async (fileId: string) => {
    setUploadError(null);
    const result = await api?.knowledgeBaseRemoveDocument?.(fileId);
    if (!result?.success) { setUploadError(result?.error || 'Unable to remove this file.'); return; }
    onSettingsChange?.({ files: (currentSettings?.files || []).filter(file => file.id !== fileId) });
  };

  const handleClearAllFiles = async () => {
    if (window.confirm('Are you sure you want to remove all knowledge base files? This action cannot be undone.')) {
      const result = await api?.knowledgeBaseClear?.();
      if (!result?.success) { setUploadError(result?.error || 'Unable to clear Knowledge Base.'); return; }
      onSettingsChange?.({ files: [] });
    }
  };

  const handleConfidenceChange = (value: number) => {
    onSettingsChange?.({ confidenceThreshold: value });
    pendingConfidence.current = value;
    if (confidenceSaveTimer.current) clearTimeout(confidenceSaveTimer.current);
    confidenceSaveTimer.current = setTimeout(() => {
      void api?.knowledgeBaseUpdateSettings?.({ confidenceThreshold: value });
      pendingConfidence.current = null;
      confidenceSaveTimer.current = null;
    }, 250);
  };

  const handleToggleEnabled = () => {
    const enabled = !(currentSettings?.enabled || false);
    onSettingsChange?.({ enabled });
    void api?.knowledgeBaseUpdateSettings?.({ enabled });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusIcon = (status: KnowledgeBaseFile['status']) => {
    switch (status) {
      case 'ready': return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'indexing': return <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-400" />;
    }
  };

  const getStatusText = (status: KnowledgeBaseFile['status']) => {
    switch (status) {
      case 'ready': return 'Indexed & Ready';
      case 'indexing': return 'Indexing...';
      case 'error': return 'Indexing Failed';
    }
  };

  return (
    <div className="space-y-6">
      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-4 bg-bg-card rounded-xl border border-border-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-600/20 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="font-medium text-text-primary">Enable Instant Knowledge Base Intercept</h3>
            <p className="text-sm text-text-secondary">
              Add matching local references to interview answers and suggestions when enabled. Matching excerpts are included in the active AI request.
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={currentSettings?.enabled || false}
            onChange={handleToggleEnabled}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-bg-input peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {/* Confidence Threshold */}
      <div className="p-4 bg-bg-card rounded-xl border border-border-subtle">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-yellow-600/20 rounded-lg">
            <SlidersHorizontal className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="font-medium text-text-primary">Local Knowledge Match Confidence Threshold</h3>
            <p className="text-sm text-text-secondary">
              Minimum keyword-match score (0.50 - 0.95) before local references are added to answers
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Current: {(currentSettings?.confidenceThreshold ?? 0.8).toFixed(2)}</span>
            <span className="text-sm font-medium text-text-primary">
              {(currentSettings?.confidenceThreshold ?? 0.8) * 100}%
            </span>
          </div>
          <input
            type="range"
            min="0.50"
            max="0.95"
            step="0.01"
            value={currentSettings?.confidenceThreshold ?? 0.8}
            onChange={e => handleConfidenceChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-bg-input rounded-lg appearance-none cursor-pointer accent-accent-primary"
          />
          <div className="flex justify-between text-xs text-text-tertiary">
            <span>0.50 (Lenient)</span>
            <span>0.80 (Default)</span>
            <span>0.95 (Strict)</span>
          </div>
        </div>
      </div>

      {/* Advanced Options */}
      <div className="border-t border-border-subtle pt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg
            className={`w-5 h-5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="font-medium">Advanced Options</span>
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-3 p-4 bg-bg-card rounded-xl border border-border-subtle text-sm">
            <div>
              <h4 className="font-medium text-text-primary mb-1">Local Indexing</h4>
              <p className="text-text-primary">Documents are stored on this device. Text is split into paragraph-based chunks (up to 500 chunks per file).</p>
            </div>
            <div>
              <h4 className="font-medium text-text-primary mb-1">Matching Method</h4>
              <p className="text-text-primary">Lightweight keyword-overlap matching with basic plural normalization. This does not use embeddings or semantic vector search.</p>
            </div>
            <div>
              <h4 className="font-medium text-text-primary mb-1">Limits</h4>
              <p className="text-text-primary">Maximum file size: 10 MB. Supported: TXT, MD, JSON, CSV and text-based PDF.</p>
            </div>
          </div>
        )}
      </div>

      {/* File Upload Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 transition-colors ${dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-border-subtle hover:border-border-muted'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          accept=".txt,.md,.json,.csv,.pdf"
          onChange={handleFileSelect}
          disabled={isBusy}
          className="hidden"
        />
        <div className="text-center">
          <div className="mx-auto mb-4 p-3 bg-bg-card rounded-full w-16 h-16 flex items-center justify-center">
            <Upload className="w-8 h-8 text-text-secondary" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-2">
            Drag & drop your knowledge file here, or click to browse
          </h3>
          <p className="text-text-secondary mb-4">
            Supported formats: <code className="bg-bg-input px-1.5 py-0.5 rounded text-xs">.txt</code>,
            <code className="bg-bg-input px-1.5 py-0.5 rounded text-xs">.md</code>,
            <code className="bg-bg-input px-1.5 py-0.5 rounded text-xs">.json</code>,
            <code className="bg-bg-input px-1.5 py-0.5 rounded text-xs">.csv</code>,
            <code className="bg-bg-input px-1.5 py-0.5 rounded text-xs">.pdf</code>
            (Max 10MB)
          </p>
          <label htmlFor="file-upload" className={`inline-flex items-center gap-2 px-4 py-2 bg-accent-primary hover:opacity-90 text-text-primary rounded-lg cursor-pointer transition-colors ${isBusy ? 'opacity-60 pointer-events-none' : ''}`}>
            <FileText className="w-4 h-4" />
            {isBusy ? 'Indexing…' : 'Choose File'}
          </label>
        </div>
      </div>

      {uploadError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{uploadError}</div>}

      {isLoading && (
        <div className="py-8 text-center text-sm text-text-secondary">Loading local Knowledge Base…</div>
      )}

      {/* Uploaded Files List */}
      {(currentSettings?.files.length || 0) > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-text-primary">Uploaded Files ({currentSettings?.files.length || 0})</h3>
            {(currentSettings?.files.length || 0) > 1 && (
              <button
                onClick={handleClearAllFiles}
                className="text-sm text-red-400 hover:text-red-300 transition-colors"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {(currentSettings?.files || []).map(file => (
              <div
                key={file.id}
                className="flex items-center gap-4 p-4 bg-bg-card rounded-xl border border-border-subtle group"
              >
                <div className="p-2 bg-bg-input rounded-lg">
                  <FileText className="w-5 h-5 text-text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary truncate">{file.name}</span>
                    {file.status === 'error' && (
                      <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-300 rounded">Failed</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-text-secondary mt-1">
                    <span>{formatFileSize(file.size)}</span>
                    <span>•</span>
                    <span>{file.entriesCount} entries</span>
                    <span>•</span>
                    <span>{getStatusText(file.status)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(file.status)}
                  <button
                    onClick={() => handleRemoveFile(file.id)}
                    className="p-2 text-text-secondary hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    aria-label={`Remove ${file.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (currentSettings?.files.length || 0) === 0 && (
        <div className="text-center py-12 bg-bg-card rounded-xl border border-border-subtle">
          <FileText className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No knowledge files uploaded yet</h3>
          <p className="text-text-secondary max-w-md mx-auto">
            Upload your interview cheat sheets, FAQ documents, or technical references to enable instant answers during interviews.
          </p>
        </div>
      )}

      {/* Stats Summary */}
      {(currentSettings?.files.length || 0) > 0 && (
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border-subtle">
          <div className="text-center p-4 bg-bg-card rounded-xl border border-border-subtle">
            <div className="text-2xl font-bold text-accent-primary">{currentSettings?.files.length || 0}</div>
            <div className="text-sm text-text-secondary">Files</div>
          </div>
          <div className="text-center p-4 bg-bg-card rounded-xl border border-border-subtle">
            <div className="text-2xl font-bold text-green-400">
              {(currentSettings?.files.reduce((sum, f) => sum + f.entriesCount, 0) || 0)}
            </div>
            <div className="text-sm text-text-secondary">Total Entries</div>
          </div>
          <div className="text-center p-4 bg-bg-card rounded-xl border border-border-subtle">
            <div className="text-2xl font-bold text-yellow-400">
              {(currentSettings?.confidenceThreshold ?? 0.8) * 100}%
            </div>
            <div className="text-sm text-text-secondary">Confidence Threshold</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseTab;
