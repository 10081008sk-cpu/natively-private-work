export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  time?: number;
  memory?: number;
}

export interface CodeSubmission {
  sourceCode: string;
  language: string;
  stdin?: string;
  expectedOutput?: string;
}

export interface ExecutionEngineConfig {
  name: string;
  type: 'judge0' | 'custom';
  baseUrl: string;
  authToken?: string;
  headers?: Record<string, string>;
  languageMapping?: Record<string, string>;
  enabled: boolean;
}

export interface ExecutionEnginesConfig {
  judge0: {
    baseUrl: string;
    authToken: string;
    enabled: boolean;
  };
  customEngines: ExecutionEngineConfig[];
}

const LANGUAGE_IDS: Record<string, number> = {
  javascript: 63, js: 63, node: 63,
  typescript: 74, ts: 74,
  python: 71, py: 71,
  java: 62,
  cpp: 54, 'c++': 54,
  c: 50,
  csharp: 51, cs: 51,
  ruby: 72, rb: 72,
  go: 60,
  rust: 73, rs: 73,
  php: 68,
  swift: 83,
  kotlin: 78,
  scala: 81,
  perl: 54,
  sql: 82, mysql: 82,
  html: 80,
  css: 79,
};

export class CodeExecutor {
  private _judge0BaseUrl: string;
  private _judge0AuthToken: string;
  private _customEngines: ExecutionEngineConfig[];

  constructor(engineConfig?: Partial<ExecutionEnginesConfig>) {
    const config = engineConfig || {};
    this._judge0BaseUrl = config.judge0?.baseUrl || 'http://localhost:2358';
    this._judge0AuthToken = config.judge0?.authToken || '';
    this._customEngines = config.customEngines || [];
  }

  async execute(submission: CodeSubmission): Promise<ExecutionResult> {
    const lang = submission.language.toLowerCase();

    const matchedCustom = this._customEngines
      .filter(e => e.enabled)
      .find(e => {
        if (!e.languageMapping) return false;
        const mappedLang = e.languageMapping[lang] || e.languageMapping[submission.language];
        return !!mappedLang;
      });

    if (matchedCustom) {
      return this._execWithCustom(submission, matchedCustom);
    }

    const judge0Config = { baseUrl: this._judge0BaseUrl, authToken: this._judge0AuthToken };
    try {
      return await this._execWithJudge0(submission, judge0Config);
    } catch (err: any) {
      console.warn('[CodeExecutor] Judge0 failed:', err.message);
      return this._execFallback(submission);
    }
  }

  private async _execWithCustom(submission: CodeSubmission, engine: ExecutionEngineConfig): Promise<ExecutionResult> {
    const lang = submission.language.toLowerCase();
    const mappedLang = engine.languageMapping?.[lang] || engine.languageMapping?.[submission.language] || submission.language;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(engine.headers || {}),
    };
    if (engine.authToken) {
      headers['Authorization'] = `Bearer ${engine.authToken}`;
    }

    try {
      const res = await fetch(engine.baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_code: submission.sourceCode,
          language: mappedLang,
          stdin: submission.stdin || '',
          expected_output: submission.expectedOutput || null,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        return { stdout: '', stderr: `Custom engine returned ${res.status}`, exitCode: 1, error: `HTTP ${res.status}` };
      }

      const result = await res.json();
      return {
        stdout: result.stdout || result.output || '',
        stderr: result.stderr || result.error || '',
        exitCode: result.exitCode ?? result.exit_code ?? result.status === 'success' ? 0 : 1,
        error: result.error || undefined,
        time: result.time || result.execution_time || undefined,
        memory: result.memory || result.memory_usage || undefined,
      };
    } catch (err: any) {
      return { stdout: '', stderr: `Custom engine error: ${err.message}`, exitCode: 1, error: err.message };
    }
  }

  private async _execWithJudge0(
    submission: CodeSubmission,
    config: { baseUrl: string; authToken: string }
  ): Promise<ExecutionResult> {
    const languageId = LANGUAGE_IDS[submission.language.toLowerCase()];
    if (!languageId) {
      throw new Error(`Unsupported language: ${submission.language}`);
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.authToken) {
      headers['X-Auth-Token'] = config.authToken;
      headers['Authorization'] = `Bearer ${config.authToken}`;
    }

    const submitRes = await fetch(`${config.baseUrl}/submissions?base64_encoded=false&wait=false`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_code: submission.sourceCode,
        language_id: languageId,
        stdin: submission.stdin || '',
        expected_output: submission.expectedOutput || null,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!submitRes.ok) {
      throw new Error(`Judge0 submission failed: ${submitRes.status}`);
    }

    const { token } = await submitRes.json();
    if (!token) throw new Error('No token received from Judge0');

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const resultRes = await fetch(`${config.baseUrl}/submissions/${token}?base64_encoded=false`, {
        headers: config.authToken ? { 'X-Auth-Token': config.authToken } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (!resultRes.ok) continue;

      const result = await resultRes.json();
      if (result.status?.id >= 3) {
        return {
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          exitCode: result.status?.id === 3 ? 0 : 1,
          error: result.compile_output || result.message || undefined,
          time: result.time ? parseFloat(result.time) : undefined,
          memory: result.memory || undefined,
        };
      }
    }

    throw new Error('Judge0 execution timed out');
  }

  private _execFallback(submission: CodeSubmission): ExecutionResult {
    const lang = submission.language.toLowerCase();
    const { sourceCode } = submission;

    if (lang === 'javascript' || lang === 'js' || lang === 'node' || lang === 'typescript' || lang === 'ts') {
      try {
        const vm = require('vm');
        let output = '';
        const sandbox = {
          console: { log: (...args: any[]) => { output += args.map(String).join(' ') + '\n'; } },
          setTimeout: () => {},
        };
        const context = vm.createContext(sandbox);
        vm.runInContext(sourceCode, context, { timeout: 5000 });
        return { stdout: output, stderr: '', exitCode: 0, time: 0, memory: 0 };
      } catch (e: any) {
        return { stdout: '', stderr: e.message, exitCode: 1, error: e.message, time: 0, memory: 0 };
      }
    }

    if (lang === 'python' || lang === 'py') {
      try {
        const { execSync } = require('child_process');
        const result = execSync(`python -c "${sourceCode.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`, {
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        return { stdout: result.stdout?.toString() || '', stderr: result.stderr?.toString() || '', exitCode: 0, time: 0, memory: 0 };
      } catch (e: any) {
        return { stdout: e.stdout?.toString() || '', stderr: e.stderr?.toString() || e.message, exitCode: e.status || 1, error: e.message, time: 0, memory: 0 };
      }
    }

    return { stdout: '', stderr: `Execution not available for ${submission.language}`, exitCode: -1, error: `Language ${submission.language} requires a configured execution engine`, time: 0, memory: 0 };
  }

  async testConnection(engine?: ExecutionEngineConfig): Promise<{ ok: boolean; error?: string }> {
    try {
      const url = engine?.baseUrl || this._judge0BaseUrl;
      const res = await fetch(`${url}/about`, { signal: AbortSignal.timeout(3000) });
      return { ok: res.ok };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}
