import React, { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, SlidersHorizontal, Eye, EyeOff } from 'lucide-react';

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
  const [selectedFile, setSelectedFile] = useState<KnowledgeBaseFile | null>(null);
  const [activeTab, setActiveTab] = useState('knowledge-base');

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
      e.target.value = '';
    }
  }, []);

  const handleFileUpload = async (file: File) => {
    const allowedTypes = ['.txt', '.md', '.json', '.csv'];
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(extension)) {
      alert(`Unsupported file type: ${extension}. Allowed: ${allowedTypes.join(', ')}`);
      return;
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit');
      return;
    }

    // Create new file entry
    const newFile: KnowledgeBaseFile = {
      id: `file-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: extension,
      entriesCount: 0,
      status: 'indexing',
      lastIndexed: Date.now(),
    };

    // Update settings
    onSettingsChange?.({
      files: [...(currentSettings?.files || []), newFile],
    });

    // Simulate indexing (in real implementation, this would call the knowledge base parser)
    setTimeout(() => {
      const updatedFiles = (currentSettings?.files || []).map(f =>
        f.id === newFile.id
          ? { ...f, status: 'ready' as const, entriesCount: Math.floor(Math.random() * 50) + 10 }
          : f
      );
      onSettingsChange?.({ files: updatedFiles });
    }, 2000);
  };

  const handleRemoveFile = (fileId: string) => {
    const updatedFiles = (currentSettings?.files || []).filter(f => f.id !== fileId);
    onSettingsChange?.({ files: updatedFiles });
  };

  const handleClearAllFiles = () => {
    if (window.confirm('Are you sure you want to remove all knowledge base files? This action cannot be undone.')) {
      onSettingsChange?.({ files: [] });
    }
  };

  const handleConfidenceChange = (value: number) => {
    onSettingsChange?.({ confidenceThreshold: value });
  };

  const handleToggleEnabled = () => {
    onSettingsChange?.({ enabled: !(currentSettings?.enabled || false) });
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
      <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl border border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-600/20 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">Enable Instant Knowledge Base Intercept</h3>
            <p className="text-sm text-gray-400">
              Automatically search local knowledge base before querying web/LLM providers
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
          <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>

      {/* Confidence Threshold */}
      <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-yellow-600/20 rounded-lg">
            <SlidersHorizontal className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <h3 className="font-medium text-white">NLP Semantic Match Confidence Threshold</h3>
            <p className="text-sm text-gray-400">
              Minimum confidence score (0.50 - 0.95) for knowledge base answers to be used
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Current: {currentSettings?.confidenceThreshold.toFixed(2)}</span>
            <span className="text-sm font-medium text-white">
              {(currentSettings?.confidenceThreshold || 0.75) * 100}%
            </span>
          </div>
          <input
            type="range"
            min="0.50"
            max="0.95"
            step="0.01"
            value={currentSettings?.confidenceThreshold || 0.75}
            onChange={e => handleConfidenceChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0.50 (Lenient)</span>
            <span>0.75 (Default)</span>
            <span>0.95 (Strict)</span>
          </div>
        </div>
      </div>

      {/* Advanced Options */}
      <div className="border-t border-gray-700 pt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
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
          <div className="mt-4 space-y-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700">
            <div>
              <h4 className="font-medium text-white mb-2">Cache Settings</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-gray-400 block mb-1">Cache TTL</label>
                  <span className="text-white">1 hour</span>
                </div>
                <div>
                  <label className="text-gray-400 block mb-1">Max Cache Entries</label>
                  <span className="text-white">1,000</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-white mb-2">Matching Algorithm</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" defaultChecked className="accent-blue-500" disabled />
                  <span className="text-gray-300">Exact keyword & acronym matching (Tier 1)</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" defaultChecked className="accent-blue-500" disabled />
                  <span className="text-gray-300">TF-IDF cosine similarity (Tier 2)</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" defaultChecked className="accent-blue-500" disabled />
                  <span className="text-gray-300">Levenshtein distance fallback (Tier 3)</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* File Upload Zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 transition-colors ${dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-upload"
          accept=".txt,.md,.json,.csv"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="text-center">
          <div className="mx-auto mb-4 p-3 bg-gray-800/50 rounded-full w-16 h-16 flex items-center justify-center">
            <Upload className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            Drag & drop your knowledge file here, or click to browse
          </h3>
          <p className="text-gray-400 mb-4">
            Supported formats: <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">.txt</code>,
            <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">.md</code>,
            <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">.json</code>,
            <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">.csv</code>
            (Max 10MB)
          </p>
          <label htmlFor="file-upload" className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors">
            <FileText className="w-4 h-4" />
            Choose File
          </label>
        </div>
      </div>

      {/* Uploaded Files List */}
      {(currentSettings?.files.length || 0) > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-white">Uploaded Files ({currentSettings?.files.length || 0})</h3>
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
                className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-xl border border-gray-700 group"
              >
                <div className="p-2 bg-gray-700 rounded-lg">
                  <FileText className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">{file.name}</span>
                    {file.status === 'error' && (
                      <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-300 rounded">Failed</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400 mt-1">
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
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
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
      {(currentSettings?.files.length || 0) === 0 && (
        <div className="text-center py-12 bg-gray-800/50 rounded-xl border border-gray-700">
          <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No knowledge files uploaded yet</h3>
          <p className="text-gray-400 max-w-md mx-auto">
            Upload your interview cheat sheets, FAQ documents, or technical references to enable instant answers during interviews.
          </p>
        </div>
      )}

      {/* Stats Summary */}
      {(currentSettings?.files.length || 0) > 0 && (
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-700">
          <div className="text-center p-4 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="text-2xl font-bold text-blue-400">{currentSettings?.files.length || 0}</div>
            <div className="text-sm text-gray-400">Files</div>
          </div>
          <div className="text-center p-4 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="text-2xl font-bold text-green-400">
              {(currentSettings?.files.reduce((sum, f) => sum + f.entriesCount, 0) || 0)}
            </div>
            <div className="text-sm text-gray-400">Total Entries</div>
          </div>
          <div className="text-center p-4 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="text-2xl font-bold text-yellow-400">
              {(currentSettings?.confidenceThreshold || 0.75) * 100}%
            </div>
            <div className="text-sm text-gray-400">Confidence Threshold</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBaseTab;
