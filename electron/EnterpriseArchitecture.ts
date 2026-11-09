/**
 * Enterprise Architecture Integration
 * Main entry point - initializes all enterprise services and wires them together
 */

import { app, BrowserWindow, ipcMain, utilityProcess, MessageChannelMain } from 'electron';
import * as path from 'path';
import { initializeWindowManager } from './WindowManager';
import { initializeGlobalErrorHandler } from './main/GlobalErrorHandler';
import { initializeErrorNotificationService } from './services/ErrorNotificationService';
import { initializeKnowledgeBase } from '../src/main/services/KnowledgeBase';
import { initializeIntelligentRouter } from '../src/main/services/IntelligentRouter';
import { initializeSpeechProviderValidator } from '../src/main/services/SpeechProviderValidator';
import { initializeSafeIPC } from './main/SafeIPC';
import { initializeAnalyticsService } from './main/AnalyticsService';
import { initializeDatabaseManager } from '../src/main/db/database';
import { initializeSidecarManager } from './main/SidecarManager';
import { initializeSTTErrorHandler } from './main/STTErrorHandler';
import { initializeKnowledgeBaseParser } from '../src/main/services/KnowledgeBaseParser';
import { initializeNLPMatcher } from '../src/main/services/NLPMatcher';
import { initializeOrchestratorService } from '../src/main/services/OrchestratorService';
import { getAnalyticsService } from './main/AnalyticsService';
import { getDatabaseManager } from '../src/main/db/database';
import { getSidecarManager } from './main/SidecarManager';
import { getSTTErrorHandler } from './main/STTErrorHandler';
import { getIntelligentRouter } from '../src/main/services/IntelligentRouter';
import { getKnowledgeBase } from '../src/main/services/KnowledgeBase';
import { getKnowledgeBaseParser } from '../src/main/services/KnowledgeBaseParser';
import { getNLPMatcher } from '../src/main/services/NLPMatcher';
import { getOrchestratorService } from '../src/main/services/OrchestratorService';

export interface EnterpriseServices {
  windowManager: any;
  globalErrorHandler: any;
  errorNotificationService: any;
  safeIPC: any;
  analyticsService: any;
  databaseManager: any;
  sidecarManager: any;
  sttErrorHandler: any;
  knowledgeBase: any;
  intelligentRouter: any;
  speechProviderValidator: any;
  knowledgeBaseParser: any;
  nlpMatcher: any;
  orchestratorService: any;
}

class EnterpriseArchitecture {
  private services: EnterpriseServices | null = null;
  private isInitialized = false;
  private sidecarProcesses: Map<string, any> = new Map();

  async initialize(): Promise<EnterpriseServices> {
    if (this.isInitialized) {
      console.log('[EnterpriseArchitecture] Already initialized');
      return this.services!;
    }

    console.log('[EnterpriseArchitecture] Starting enterprise architecture initialization...');

    try {
      // 1. Initialize core infrastructure (Phase 1)
      console.log('[EnterpriseArchitecture] Phase 1: Core Infrastructure');
      await this.initializeCoreInfrastructure();

      // 2. Initialize utility processes (Phase 2)
      console.log('[EnterpriseArchitecture] Phase 2: Multi-Process Utility Engine');
      await this.initializeUtilityProcesses();

      // 3. Initialize knowledge base and orchestration (Phase 3)
      console.log('[EnterpriseArchitecture] Phase 3: Knowledge Base & Orchestration');
      await this.initializeKnowledgeAndOrchestration();

      // 4. Wire everything together (Phase 4)
      console.log('[EnterpriseArchitecture] Phase 4: Integration & Lifecycle');
      await this.wireIntegration();

      this.isInitialized = true;
      console.log('[EnterpriseArchitecture] Enterprise architecture initialized successfully!');

      return this.services!;
    } catch (error) {
      console.error('[EnterpriseArchitecture] Initialization failed:', error);
      throw error;
    }
  }

  private async initializeCoreInfrastructure(): Promise<void> {
    // Initialize database first
    console.log('[EnterpriseArchitecture] Initializing database...');
    const databaseManager = initializeDatabaseManager();

    // Initialize SafeIPC
    console.log('[EnterpriseArchitecture] Initializing SafeIPC...');
    const safeIPC = initializeSafeIPC();

    // Initialize Analytics
    console.log('[EnterpriseArchitecture] Initializing analytics...');
    const analyticsService = initializeAnalyticsService();

    // Initialize Error Handling
    console.log('[EnterpriseArchitecture] Initializing error handling...');
    const globalErrorHandler = initializeGlobalErrorHandler();
    const errorNotificationService = initializeErrorNotificationService();

    // Initialize Window Manager
    console.log('[EnterpriseArchitecture] Initializing window manager...');
    const windowManager = initializeWindowManager();
    windowManager.startMemoryMonitoring();

    // Initialize Sidecar Manager
    console.log('[EnterpriseArchitecture] Initializing sidecar manager...');
    const sidecarManager = initializeSidecarManager();

    // Initialize STT Error Handler
    console.log('[EnterpriseArchitecture] Initializing STT error handler...');
    const sttErrorHandler = initializeSTTErrorHandler();

    // Initialize Speech Provider Validator
    console.log('[EnterpriseArchitecture] Initializing speech provider validator...');
    const speechProviderValidator = initializeSpeechProviderValidator();

    // Store core services
    this.services = {
      windowManager,
      globalErrorHandler,
      errorNotificationService,
      safeIPC,
      analyticsService,
      databaseManager,
      sidecarManager,
      sttErrorHandler,
      knowledgeBase: null,
      intelligentRouter: null,
      speechProviderValidator,
      knowledgeBaseParser: null,
      nlpMatcher: null,
      orchestratorService: null,
    };
  }

  private async initializeUtilityProcesses(): Promise<void> {
    const sidecarManager = this.services!.sidecarManager;

    // Register STT Sidecar
    const sttWorkerPath = path.join(__dirname, '..', 'sidecar', 'STTSidecarWorker.js');
    this.services!.sidecarManager.registerSidecar({
      id: 'stt-system',
      entryPoint: sttWorkerPath,
      maxRestarts: 3,
      restartDelay: 1000,
      healthCheckInterval: 5000,
      healthCheckTimeout: 15000,
    });

    this.services!.sidecarManager.registerSidecar({
      id: 'stt-mic',
      entryPoint: sttWorkerPath,
      maxRestarts: 3,
      restartDelay: 1000,
      healthCheckInterval: 5000,
      healthCheckTimeout: 15000,
    });

    // Register Orchestration Sidecar
    const orchestrationWorkerPath = path.join(__dirname, '..', 'sidecar', 'OrchestrationSidecarWorker.js');
    this.services!.sidecarManager.registerSidecar({
      id: 'orchestration',
      entryPoint: orchestrationWorkerPath,
      maxRestarts: 3,
      restartDelay: 2000,
      healthCheckInterval: 10000,
      healthCheckTimeout: 30000,
    });

    // Start STT sidecars
    const modelDir = path.join(app.getPath('userData'), 'models', 'sherpa-multilingual-auto');
    
    await this.services!.sidecarManager.startSidecar('stt-system', {
      modelDir,
      channel: 'system',
      enableVAD: true,
      enableHallucinationFilter: true,
      enableDirectML: true,
    });

    await this.services!.sidecarManager.startSidecar('stt-mic', {
      modelDir,
      channel: 'mic',
      enableVAD: true,
      enableHallucinationFilter: true,
      enableDirectML: true,
    });

    // Start orchestration sidecar
    await this.services!.sidecarManager.startSidecar('orchestration', {
      knowledgeBasePath: path.join(app.getPath('userData'), 'knowledge-base'),
      cacheDir: path.join(app.getPath('userData'), 'cache'),
      webSearchEnabled: true,
      webSearchProvider: 'duckduckgo',
      llmProviders: [
        { id: 'gemini', name: 'Gemini 3.1 Flash', type: 'gemini', model: 'gemini-3.1-flash-lite-preview', timeout: 10000, maxRetries: 2, priority: 3 },
        { id: 'groq', name: 'Groq Llama 3.3', type: 'groq', model: 'llama-3.3-70b-versatile', timeout: 8000, maxRetries: 2, priority: 4 },
        { id: 'openai', name: 'GPT-5', type: 'openai', model: 'gpt-5.4', timeout: 15000, maxRetries: 2, priority: 5 },
        { id: 'claude', name: 'Claude Opus 4.1', type: 'claude', model: 'claude-opus-4-1', timeout: 15000, maxRetries: 2, priority: 6 },
        { id: 'ollama', name: 'Local Ollama', type: 'ollama', model: 'qwen2.5:4b', timeout: 30000, maxRetries: 1, priority: 7 },
      ],
      nlpThreshold: 0.75,
      cacheTTL: 3600000,
      maxCacheSize: 1000,
    });

    // Wire STT sidecar events
    this.wireSTTEvents();
  }

  private wireSTTEvents(): void {
    const sttErrorHandler = this.services!.sttErrorHandler;

    // Forward STT events to main process
    sttErrorHandler.on('token', (data: any) => {
      // Broadcast to all windows
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('stt:token', data);
        }
      }
    });

    sttErrorHandler.on('vad', (data: any) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('vad:event', data);
        }
      }
    });

    sttErrorHandler.on('stats', (data: any) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('stt:stats', data);
        }
      }
    });

    sttErrorHandler.on('stateChange', (state: any) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send('stt:stateChange', state);
        }
      }
    });

    sttErrorHandler.on('error', (data: any) => {
      console.error('[STT] Error:', data);
      this.services!.analyticsService.trackSTTError(data.sidecarId, 'unknown', new Error(data.error));
    });
  }

  private async initializeKnowledgeAndOrchestration(): Promise<void> {
    // Initialize Knowledge Base
    console.log('[EnterpriseArchitecture] Initializing knowledge base...');
    const knowledgeBase = initializeKnowledgeBase();
    this.services!.knowledgeBase = knowledgeBase;

    // Initialize Knowledge Base Parser
    console.log('[EnterpriseArchitecture] Initializing knowledge base parser...');
    const knowledgeBaseParser = initializeKnowledgeBaseParser();
    this.services!.knowledgeBaseParser = knowledgeBaseParser;

    // Initialize NLP Matcher
    console.log('[EnterpriseArchitecture] Initializing NLP matcher...');
    const nlpMatcher = initializeNLPMatcher();
    this.services!.nlpMatcher = nlpMatcher;

    // Initialize Orchestrator Service
    console.log('[EnterpriseArchitecture] Initializing orchestrator...');
    const orchestratorService = initializeOrchestratorService(
      this.services!.nlpMatcher,
      this.services!.knowledgeBase
    );
    this.services!.orchestratorService = orchestratorService;

    // Initialize Intelligent Router (legacy, for backward compatibility)
    console.log('[EnterpriseArchitecture] Initializing intelligent router...');
    const intelligentRouter = initializeIntelligentRouter();
    this.services!.intelligentRouter = intelligentRouter;

    // Update services with initialized components
    this.services!.knowledgeBase = knowledgeBase;
    this.services!.knowledgeBaseParser = this.services!.knowledgeBaseParser;
    this.services!.nlpMatcher = this.services!.nlpMatcher;
    this.services!.orchestratorService = orchestratorService;
    this.services!.intelligentRouter = intelligentRouter;
  }

  private async wireIntegration(): Promise<void> {
    console.log('[EnterpriseArchitecture] Wiring IPC handlers...');

    // Knowledge Base IPC
    ipcMain.handle('knowledge-base:search', async (event, query: string, context?: string, threshold?: number) => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return kb.search(query, context);
    });

    ipcMain.handle('knowledge-base:add', async (event, entry: any) => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return kb.addEntry(entry);
    });

    ipcMain.handle('knowledge-base:import', async (event, filePath: string) => {
      const parser = getKnowledgeBaseParser();
      if (!parser) throw new Error('Knowledge base parser not initialized');
      return parser.parseFile(filePath);
    });

    ipcMain.handle('knowledge-base:files', async () => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return {
        files: kb.getAllEntries().map((e: any) => ({
          id: e.id,
          name: e.source,
          entriesCount: 1,
          status: 'ready' as const,
        })),
      };
    });

    ipcMain.handle('knowledge-base:parse', async (event, filePath: string) => {
      const parser = getKnowledgeBaseParser();
      if (!parser) throw new Error('Knowledge base parser not initialized');
      return parser.parseFile(filePath);
    });

    // Orchestrator IPC
    ipcMain.handle('orchestrator:route', async (event, request: any) => {
      const orchestrator = this.services!.orchestratorService;
      if (!orchestrator) throw new Error('Orchestrator not initialized');
      return orchestrator.routeRequest(request);
    });

    ipcMain.handle('orchestrator:status', async () => {
      const orchestrator = this.services!.orchestratorService;
      if (!orchestrator) throw new Error('Orchestrator not initialized');
      return orchestrator.getProviderStatus();
    });

    // Intelligent Router (legacy)
    ipcMain.handle('router:route', async (event, request: any) => {
      const router = this.services!.intelligentRouter;
      if (!router) throw new Error('Router not initialized');
      return router.routeRequest(request);
    });

    ipcMain.handle('router:status', async () => {
      const router = this.services!.intelligentRouter;
      if (!router) throw new Error('Router not initialized');
      return router.getProviderStatus();
    });

    // Speech Provider Validation
    ipcMain.handle('speech:validate', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateProvider(providerId);
    });

    ipcMain.handle('speech:health', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.checkProviderHealth(providerId);
    });

    ipcMain.handle('speech:validate-all', async () => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateAllProviders();
    });

    // Circuit Breaker
    ipcMain.handle('circuit-breaker:status', async () => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      return {
        states: circuitBreakerRegistry.getAllStates(),
        metrics: circuitBreakerRegistry.getAllMetrics(),
      };
    });

    ipcMain.handle('circuit-breaker:reset', async (event, providerId?: string) => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      if (providerId) {
        const breaker = circuitBreakerRegistry.get(providerId);
        if (breaker) breaker.reset();
      } else {
        circuitBreakerRegistry.resetAll();
      }
      return { success: true };
    });

    // Error Handling
    ipcMain.handle('error:report', async (event, error: any, context?: any) => {
      const handler = this.services!.globalErrorHandler;
      if (handler) {
        await handler.reportError(error, context);
      }
    });

    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Window Management
    ipcMain.handle('window:create', async (event, id: string, options: any) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      const window = wm.createWindow(id, options);
      return { success: true, windowId: id };
    });

    ipcMain.handle('window:show', async (event, id: string) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      wm.showWindow(id);
      return { success: true };
    });

    ipcMain.handle('window:hide', async (event, id: string) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      wm.hideWindow(id);
      return { success: true };
    });

    ipcMain.handle('window:close', async (event, id: string) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      wm.closeWindow(id);
      return { success: true };
    });

    ipcMain.handle('window:metrics', async (event, id?: string) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      if (id) {
        return { metrics: wm.getMetrics(id) };
      }
      return { allMetrics: Object.fromEntries(wm.getAllMetrics()) };
    });

    // Knowledge Base IPC (legacy)
    ipcMain.handle('router:route', async (event, request: any) => {
      const router = this.services!.intelligentRouter;
      if (!router) throw new Error('Router not initialized');
      return router.routeRequest(request);
    });

    ipcMain.handle('router:status', async () => {
      const router = this.services!.intelligentRouter;
      if (!router) throw new Error('Router not initialized');
      return router.getProviderStatus();
    });

    ipcMain.handle('router:enable', async (event, id: string) => {
      const router = this.services!.intelligentRouter;
      if (!router) throw new Error('Router not initialized');
      return router.enableProvider(id);
    });

    ipcMain.handle('router:disable', async (event, id: string) => {
      const router = this.services!.intelligentRouter;
      if (!router) throw new Error('Router not initialized');
      return router.disableProvider(id);
    });

    ipcMain.handle('router:providers', async () => {
      const router = this.services!.intelligentRouter;
      if (!router) throw new Error('Router not initialized');
      return router.getAllProviders();
    });

    // Circuit Breaker
    ipcMain.handle('circuit-breaker:reset', async (event, providerId?: string) => {
      const router = this.services!.intelligentRouter;
      if (!router) throw new Error('Router not initialized');
      await router.resetAllCircuits();
      return { success: true };
    });

    // Error Handling
    ipcMain.handle('error:report', async (event, error: any, context?: any) => {
      const handler = this.services!.globalErrorHandler;
      if (handler) {
        await handler.reportError(error, context);
      }
    });

    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Window Management
    ipcMain.handle('window:create', async (event, id: string, options: any) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      const window = wm.createWindow(id, options);
      return { success: true, windowId: id };
    });

    ipcMain.handle('window:show', async (event, id: string) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      wm.showWindow(id);
      return { success: true };
    });

    ipcMain.handle('window:hide', async (event, id: string) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      wm.hideWindow(id);
      return { success: true };
    });

    ipcMain.handle('window:close', async (event, id: string) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      wm.closeWindow(id);
      return { success: true };
    });

    ipcMain.handle('window:metrics', async (event, id?: string) => {
      const wm = this.services!.windowManager;
      if (!wm) throw new Error('Window manager not initialized');
      if (id) {
        return { metrics: wm.getMetrics(id) };
      }
      return { allMetrics: Object.fromEntries(wm.getAllMetrics()) };
    });

    // Knowledge Base IPC (legacy)
    ipcMain.handle('knowledge-base:search', async (event, query: string, context?: string, threshold?: number) => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return kb.search(query, context);
    });

    ipcMain.handle('knowledge-base:add', async (event, entry: any) => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return kb.addEntry(entry);
    });

    ipcMain.handle('knowledge-base:import', async (event, filePath: string) => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return kb.importFromFile(filePath);
    });

    ipcMain.handle('knowledge-base:files', async () => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return {
        files: kb.getAllEntries().map((e: any) => ({
          id: e.id,
          name: e.source,
          entriesCount: 1,
          status: 'ready' as const,
        })),
      };
    });

    ipcMain.handle('knowledge-base:parse', async (event, filePath: string) => {
      const parser = getKnowledgeBaseParser();
      if (!parser) throw new Error('Knowledge base parser not initialized');
      return parser.parseFile(filePath);
    });

    // Orchestrator
    ipcMain.handle('orchestrator:route', async (event, request: any) => {
      const orchestrator = this.services!.orchestratorService;
      if (!orchestrator) throw new Error('Orchestrator not initialized');
      return orchestrator.routeRequest(request);
    });

    ipcMain.handle('orchestrator:status', async () => {
      const orchestrator = this.services!.orchestratorService;
      if (!orchestrator) throw new Error('Orchestrator not initialized');
      return orchestrator.getProviderStatus();
    });

    // Speech Provider Validation
    ipcMain.handle('speech:validate', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateProvider(providerId);
    });

    ipcMain.handle('speech:health', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.checkProviderHealth(providerId);
    });

    ipcMain.handle('speech:validate-all', async () => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateAllProviders();
    });

    // Circuit Breaker
    ipcMain.handle('circuit-breaker:status', async () => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      return {
        states: circuitBreakerRegistry.getAllStates(),
        metrics: circuitBreakerRegistry.getAllMetrics(),
      };
    });

    ipcMain.handle('circuit-breaker:reset', async (event, providerId?: string) => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      if (providerId) {
        const breaker = circuitBreakerRegistry.get(providerId);
        if (breaker) breaker.reset();
      } else {
        circuitBreakerRegistry.resetAll();
      }
      return { success: true };
    });

    // Error Handling
    ipcMain.handle('error:report', async (event, error: any, context?: any) => {
      const handler = this.services!.globalErrorHandler;
      if (handler) {
        await handler.reportError(error, context);
      }
    });

    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    ipcMain.handle('analytics:events', async (event, startTime: number, endTime: number, types?: string[], limit?: number) => {
      const analytics = this.services!.analyticsService;
      if (!analytics) throw new Error('Analytics not initialized');
      return analytics.getEvents(startTime, endTime, types, limit);
    });

    ipcMain.handle('analytics:stats', async (event, startTime: number, endTime: number) => {
      const analytics = this.services!.analyticsService;
      if (!analytics) throw new Error('Analytics not initialized');
      return analytics.getAggregatedStats(startTime, endTime);
    });

    // Settings
    ipcMain.handle('settings:knowledge-base', async () => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return {
        files: kb.getAllEntries().map((e: any) => ({
          id: e.id,
          name: e.source,
          entriesCount: 1,
          status: 'ready' as const,
        })),
      };
    });

    // Notifications
    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    // STT
    ipcMain.handle('stt:writeAudio', async (event, channel: string, audioData: any) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      await sttHandler.writeAudio(channel as 'system' | 'mic', audioData);
    });

    ipcMain.handle('stt:speechEnded', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.notifySpeechEnded(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:setSampleRate', async (event, channel: string, rate: number) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.setSampleRate(channel as 'system' | 'mic', rate);
    });

    ipcMain.handle('stt:stats', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getStats(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:state', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getState(channel as 'system' | 'mic');
    });

    // Speech Provider Validation
    ipcMain.handle('speech:validate', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateProvider(providerId);
    });

    ipcMain.handle('speech:health', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.checkProviderHealth(providerId);
    });

    ipcMain.handle('speech:validate-all', async () => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateAllProviders();
    });

    // Circuit Breaker
    ipcMain.handle('circuit-breaker:status', async () => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      return {
        states: circuitBreakerRegistry.getAllStates(),
        metrics: circuitBreakerRegistry.getAllMetrics(),
      };
    });

    ipcMain.handle('circuit-breaker:reset', async (event, providerId?: string) => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      if (providerId) {
        const breaker = circuitBreakerRegistry.get(providerId);
        if (breaker) breaker.reset();
      } else {
        circuitBreakerRegistry.resetAll();
      }
      return { success: true };
    });

    // Error Handling
    ipcMain.handle('error:report', async (event, error: any, context?: any) => {
      const handler = this.services!.globalErrorHandler;
      if (handler) {
        await handler.reportError(error, context);
      }
    });

    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    // Settings
    ipcMain.handle('settings:knowledge-base', async () => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return {
        files: kb.getAllEntries().map((e: any) => ({
          id: e.id,
          name: e.source,
          entriesCount: 1,
          status: 'ready' as const,
        })),
      };
    });

    // Notifications
    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    // STT
    ipcMain.handle('stt:writeAudio', async (event, channel: string, audioData: any) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      await sttHandler.writeAudio(channel as 'system' | 'mic', audioData);
    });

    ipcMain.handle('stt:speechEnded', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.notifySpeechEnded(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:setSampleRate', async (event, channel: string, rate: number) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.setSampleRate(channel as 'system' | 'mic', rate);
    });

    ipcMain.handle('stt:stats', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getStats(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:state', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getState(channel as 'system' | 'mic');
    });

    // Speech Provider Validation
    ipcMain.handle('speech:validate', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateProvider(providerId);
    });

    ipcMain.handle('speech:health', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.checkProviderHealth(providerId);
    });

    ipcMain.handle('speech:validate-all', async () => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateAllProviders();
    });

    // Circuit Breaker
    ipcMain.handle('circuit-breaker:status', async () => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      return {
        states: circuitBreakerRegistry.getAllStates(),
        metrics: circuitBreakerRegistry.getAllMetrics(),
      };
    });

    ipcMain.handle('circuit-breaker:reset', async (event, providerId?: string) => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      if (providerId) {
        const breaker = circuitBreakerRegistry.get(providerId);
        if (breaker) breaker.reset();
      } else {
        circuitBreakerRegistry.resetAll();
      }
      return { success: true };
    });

    // Error Handling
    ipcMain.handle('error:report', async (event, error: any, context?: any) => {
      const handler = this.services!.globalErrorHandler;
      if (handler) {
        await handler.reportError(error, context);
      }
    });

    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    // Settings
    ipcMain.handle('settings:knowledge-base', async () => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return {
        files: kb.getAllEntries().map((e: any) => ({
          id: e.id,
          name: e.source,
          entriesCount: 1,
          status: 'ready' as const,
        })),
      };
    });

    // Notifications
    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    // STT
    ipcMain.handle('stt:writeAudio', async (event, channel: string, audioData: any) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      await sttHandler.writeAudio(channel as 'system' | 'mic', audioData);
    });

    ipcMain.handle('stt:speechEnded', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.notifySpeechEnded(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:setSampleRate', async (event, channel: string, rate: number) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.setSampleRate(channel as 'system' | 'mic', rate);
    });

    ipcMain.handle('stt:stats', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getStats(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:state', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getState(channel as 'system' | 'mic');
    });

    // Speech Provider Validation
    ipcMain.handle('speech:validate', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateProvider(providerId);
    });

    ipcMain.handle('speech:health', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.checkProviderHealth(providerId);
    });

    ipcMain.handle('speech:validate-all', async () => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateAllProviders();
    });

    // Circuit Breaker
    ipcMain.handle('circuit-breaker:status', async () => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      return {
        states: circuitBreakerRegistry.getAllStates(),
        metrics: circuitBreakerRegistry.getAllMetrics(),
      };
    });

    ipcMain.handle('circuit-breaker:reset', async (event, providerId?: string) => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      if (providerId) {
        const breaker = circuitBreakerRegistry.get(providerId);
        if (breaker) breaker.reset();
      } else {
        circuitBreakerRegistry.resetAll();
      }
      return { success: true };
    });

    // Error Handling
    ipcMain.handle('error:report', async (event, error: any, context?: any) => {
      const handler = this.services!.globalErrorHandler;
      if (handler) {
        await handler.reportError(error, context);
      }
    });

    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    // Settings
    ipcMain.handle('settings:knowledge-base', async () => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return {
        files: kb.getAllEntries().map((e: any) => ({
          id: e.id,
          name: e.source,
          entriesCount: 1,
          status: 'ready' as const,
        })),
      };
    });

    // Notifications
    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    // STT
    ipcMain.handle('stt:writeAudio', async (event, channel: string, audioData: any) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      await sttHandler.writeAudio(channel as 'system' | 'mic', audioData);
    });

    ipcMain.handle('stt:speechEnded', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.notifySpeechEnded(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:setSampleRate', async (event, channel: string, rate: number) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.setSampleRate(channel as 'system' | 'mic', rate);
    });

    ipcMain.handle('stt:stats', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getStats(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:state', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getState(channel as 'system' | 'mic');
    });

    // Speech Provider Validation
    ipcMain.handle('speech:validate', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateProvider(providerId);
    });

    ipcMain.handle('speech:health', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.checkProviderHealth(providerId);
    });

    ipcMain.handle('speech:validate-all', async () => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateAllProviders();
    });

    // Circuit Breaker
    ipcMain.handle('circuit-breaker:status', async () => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      return {
        states: circuitBreakerRegistry.getAllStates(),
        metrics: circuitBreakerRegistry.getAllMetrics(),
      };
    });

    ipcMain.handle('circuit-breaker:reset', async (event, providerId?: string) => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      if (providerId) {
        const breaker = circuitBreakerRegistry.get(providerId);
        if (breaker) breaker.reset();
      } else {
        circuitBreakerRegistry.resetAll();
      }
      return { success: true };
    });

    // Error Handling
    ipcMain.handle('error:report', async (event, error: any, context?: any) => {
      const handler = this.services!.globalErrorHandler;
      if (handler) {
        await handler.reportError(error, context);
      }
    });

    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    // Settings
    ipcMain.handle('settings:knowledge-base', async () => {
      const kb = this.services!.knowledgeBase;
      if (!kb) throw new Error('Knowledge base not initialized');
      return {
        files: kb.getAllEntries().map((e: any) => ({
          id: e.id,
          name: e.source,
          entriesCount: 1,
          status: 'ready' as const,
        })),
      };
    });

    // Notifications
    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });

    // STT
    ipcMain.handle('stt:writeAudio', async (event, channel: string, audioData: any) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      await sttHandler.writeAudio(channel as 'system' | 'mic', audioData);
    });

    ipcMain.handle('stt:speechEnded', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.notifySpeechEnded(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:setSampleRate', async (event, channel: string, rate: number) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      sttHandler.setSampleRate(channel as 'system' | 'mic', rate);
    });

    ipcMain.handle('stt:stats', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getStats(channel as 'system' | 'mic');
    });

    ipcMain.handle('stt:state', async (event, channel: string) => {
      const sttHandler = this.services!.sttErrorHandler;
      if (!sttHandler) throw new Error('STT handler not initialized');
      return sttHandler.getState(channel as 'system' | 'mic');
    });

    // Speech Provider Validation
    ipcMain.handle('speech:validate', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateProvider(providerId);
    });

    ipcMain.handle('speech:health', async (event, providerId: string) => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.checkProviderHealth(providerId);
    });

    ipcMain.handle('speech:validate-all', async () => {
      const validator = this.services!.speechProviderValidator;
      if (!validator) throw new Error('Speech provider validator not initialized');
      return validator.validateAllProviders();
    });

    // Circuit Breaker
    ipcMain.handle('circuit-breaker:status', async () => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      return {
        states: circuitBreakerRegistry.getAllStates(),
        metrics: circuitBreakerRegistry.getAllMetrics(),
      };
    });

    ipcMain.handle('circuit-breaker:reset', async (event, providerId?: string) => {
      const { circuitBreakerRegistry } = await import('../src/main/services/CircuitBreaker');
      if (providerId) {
        const breaker = circuitBreakerRegistry.get(providerId);
        if (breaker) breaker.reset();
      } else {
        circuitBreakerRegistry.resetAll();
      }
      return { success: true };
    });

    // Error Handling
    ipcMain.handle('error:report', async (event, error: any, context?: any) => {
      const handler = this.services!.globalErrorHandler;
      if (handler) {
        await handler.reportError(error, context);
      }
    });

    ipcMain.handle('notification:action', async (event, notificationId: string, action: string) => {
      const service = this.services!.errorNotificationService;
      if (service) {
        service.handleAction(notificationId, action);
      }
    });

    // Analytics
    ipcMain.handle('analytics:track', async (event, data: any) => {
      const analytics = this.services!.analyticsService;
      if (analytics) {
        analytics.trackEvent(data.type, data.category, data.data);
      }
    });
  }

  private async createMainWindows(): Promise<void> {
    const windowManager = this.services!.windowManager;
    if (!windowManager) return;

    try {
      // Create launcher window
      windowManager.createWindow('launcher', {
        id: 'launcher',
        url: this.getStartUrl(),
        options: {
          width: 400,
          height: 600,
          minWidth: 320,
          minHeight: 400,
          frame: false,
          transparent: true,
          alwaysOnTop: false,
          skipTaskbar: false,
        },
        backgroundColor: '#121212',
        showOnReady: true,
      });

      // Create overlay window (hidden by default)
      windowManager.createWindow('overlay', {
        id: 'overlay',
        url: this.getStartUrl() + '#/overlay',
        options: {
          width: 600,
          height: 400,
          minWidth: 400,
          minHeight: 200,
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          focusable: true,
        },
        backgroundColor: '#00000000',
        showOnReady: false,
      });

      console.log('[EnterpriseArchitecture] Main windows created');
    } catch (error) {
      console.error('[EnterpriseArchitecture] Failed to create main windows:', error);
    }
  }

  private getStartUrl(): string {
    const isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;
    return isDev
      ? 'http://localhost:5180'
      : `file://${path.join(__dirname, '../../dist/index.html')}`;
  }

  getServices(): EnterpriseServices | null {
    return this.services;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async shutdown(): Promise<void> {
    console.log('[EnterpriseArchitecture] Shutting down...');

    if (this.services?.sttErrorHandler) {
      await this.services.sttErrorHandler.stopAll();
    }

    if (this.services?.sidecarManager) {
      await this.services.sidecarManager.shutdown();
    }

    if (this.services?.windowManager) {
      this.services.windowManager.closeAllWindows();
    }

    if (this.services?.analyticsService) {
      await this.services.analyticsService.shutdown();
    }

    if (this.services?.globalErrorHandler) {
      // Global error handler cleans up on process exit
    }

    if (this.services?.safeIPC) {
      this.services.safeIPC.shutdown();
    }

    this.isInitialized = false;
    this.services = null;

    console.log('[EnterpriseArchitecture] Shutdown complete');
  }
}

// Singleton instance
let enterpriseArchitectureInstance: EnterpriseArchitecture | null = null;

export function getEnterpriseArchitecture(): EnterpriseArchitecture {
  if (!enterpriseArchitectureInstance) {
    enterpriseArchitectureInstance = new EnterpriseArchitecture();
  }
  return enterpriseArchitectureInstance;
}

export async function initializeEnterpriseArchitecture(): Promise<any> {
  const architecture = getEnterpriseArchitecture();
  return architecture.initialize();
}

export async function shutdownEnterpriseArchitecture(): Promise<void> {
  if (enterpriseArchitectureInstance) {
    await enterpriseArchitectureInstance.shutdown();
    enterpriseArchitectureInstance = null;
  }
}

// Auto-initialize on module load (for main process)
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  // Only initialize in main process
  if (process.type === 'browser' || process.env.NODE_ENV === 'development') {
    initializeEnterpriseArchitecture().catch(console.error);
  }
}

// Export all services for direct access
export {
  initializeWindowManager,
  initializeGlobalErrorHandler,
  initializeErrorNotificationService,
  initializeSafeIPC,
  initializeAnalyticsService,
  initializeDatabaseManager,
  initializeSidecarManager,
  initializeSTTErrorHandler,
  initializeKnowledgeBaseParser,
  initializeNLPMatcher,
  initializeOrchestratorService,
  initializeKnowledgeBase,
  initializeIntelligentRouter,
  initializeSpeechProviderValidator,
};