import React, { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback, startTransition as reactStartTransition } from 'react';
import {
    Pencil, MessageSquare, RefreshCw, ArrowRight, HelpCircle, ChevronDown, Lightbulb, Mic, Image, Camera, X, Zap,
    SlidersHorizontal, LayoutGrid, Code, Copy, Check, AlertCircle, Trash2, ShieldCheck, Monitor,
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
// @ts-ignore
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import TopPill from './ui/TopPill';
import WindowControls from './WindowControls';
import RollingTranscript from './ui/RollingTranscript';
import GlassEffectLayer from './ui/GlassEffectLayer';
import ErrorBoundary from './ErrorBoundary';
import { NegotiationCoachingCard } from '../premium';
import { analytics, detectProviderType } from '../lib/analytics/analytics.service';
import { useShortcuts } from '../hooks/useShortcuts';
import { useResolvedTheme } from '../hooks/useResolvedTheme';
import { getOverlayAppearance, OVERLAY_OPACITY_DEFAULT, getGlassOverlayAppearance } from '../lib/overlayAppearance';
import type { MeetingInterfaceTheme } from '../lib/meetingInterfaceTheme';
import { getCodexCliModelDisplayName } from '../utils/modelUtils';
import { DynamicActionBar } from './dynamic-actions/DynamicActionBar';
import type { DynamicActionPayload } from '../types/electron';

/* ───────────────────────── constants & types ───────────────────────── */

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];
const W_COLLAPSED = 600;
const W_EXPANDED = 780;
const SEP = '  ·  ';
const SUBTLE = 'overlay-subtle-surface';
const SCREENSHOT_ANALYSIS_MODES = ['auto', 'code-review', 'dsa', 'general', 'error'] as const;
type ScreenshotAnalysisMode = typeof SCREENSHOT_ANALYSIS_MODES[number];
const MODE_LABELS: Record<ScreenshotAnalysisMode, string> = { auto: 'Auto', 'code-review': 'Code Review', dsa: 'DSA', general: 'General', error: 'Error' };
const DSA_LANGUAGES = ['Python', 'Java', 'C++', 'JavaScript', 'Go', 'Rust', 'TypeScript', 'C', 'Swift', 'Kotlin'] as const;

type Tone = 'ok' | 'warn' | 'error';
type SttState = 'connected' | 'reconnecting' | 'failed';
type Shot = { path: string; preview: string };

interface Message {
    id: string;
    role: 'user' | 'system' | 'interviewer';
    text: string;
    isStreaming?: boolean;
    hasScreenshot?: boolean;
    screenshotPreview?: string;
    screenshotPath?: string;
    isCode?: boolean;
    intent?: string;
    isNegotiationCoaching?: boolean;
    negotiationCoachingData?: {
        tacticalNote: string; exactScript: string; showSilenceTimer: boolean; phase: string;
        theirOffer: number | null; yourTarget: number | null; currency: string;
    };
    visionPipelineResult?: any;
}

interface NativelyInterfaceProps {
    onEndMeeting?: () => void;
    overlayOpacity?: number;
    interfaceTheme?: MeetingInterfaceTheme;
}

const HC_CUSTOM_STYLE = {
    margin: 0, borderRadius: 0, fontSize: '13px', lineHeight: '1.6', background: 'transparent', padding: '16px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
} as const;

const MODE_PROMPTS: Record<string, (lang: string) => string> = {
    'code-review': () => 'Review this code for bugs, performance issues, security vulnerabilities, style improvements, and adherence to best practices. Identify the programming language, explain what the code does, and suggest concrete improvements with code examples.',
    dsa: (lang) => `Analyze this DSA (Data Structures & Algorithms) problem. Identify the problem type, input/output format, constraints, edge cases, and the optimal algorithmic approach. Provide a solution in ${lang} with time and space complexity analysis. Walk through the algorithm step by step with a small example.`,
    error: () => 'Analyze this error message or debugging screenshot. Identify the error type, root cause, affected components, and provide step-by-step debugging instructions and a concrete fix. Include prevention tips for the future.',
    general: () => 'Analyze the attached image comprehensively. If it contains code, identify the language/libraries, describe what the program does, what output it produces, and provide a detailed code analysis covering structure, logic, algorithms, and improvements. If it shows a natural scene, photograph, diagram, UI, text, or any other content, describe everything visible in detail including objects, people, text, colors, layout, and context. Provide a complete, thorough analysis of the image content.',
};

const CODING_PROMPT = `You are a coding interview and visual analysis expert. The attached screenshot shows a user's screen.
Your job is to analyze the entire screen, intelligently detect the requested programming language or framework, and then process the contents according to the matching scenario.

Perform these steps:

1. LANGUAGE & FRAMEWORK DETECTION LOGIC:
   Analyze the screen layout, text, and code to dynamically classify the target execution language/framework into one of the following:
   - Java: Explicitly mentioned in the text (e.g. "Write a solution in Java"), visible in a compiler/IDE dropdown menu, or detected via syntax signatures in code stubs (e.g. 'class', 'public static void main', standard types like 'int[]', 'String', or Java 'import' statements).
   - JavaScript: Explicitly mentioned in the text (e.g. "using JavaScript"), visible in a dropdown, or detected via syntax signatures in stubs (e.g. 'let', 'const', 'function', 'module.exports', vanilla DOM methods).
   - ReactJS: Explicitly mentioned in the text (e.g. "build a React component"), visible in a dropdown, or detected via syntax signatures in stubs (e.g. 'import React', functional components, JSX syntax like '<div>', hooks like 'useState'/'useEffect', component exports).
   - Default: If no coding cues are found, determine if it represents a static graphic or standard image.

2. EVALUATE SCENARIOS (Based on detected Language/Framework):
   Execute the analysis based on which of the following 5 scenarios matches the screen content:
   - Scenario 1 (Static Image): If the screen displays a standalone image, graphic, UI design, or non-code visual, describe its contents in detail or explain what the image represents.
   - Scenario 2 (Legacy Problem Statement): If a short, standalone coding problem statement is detected, extract the requirements, and generate a complete, optimized solution in the detected language (Java or JavaScript).
   - Scenario 3 (Modern Incomplete Functions): If the screen reveals a coding problem statement alongside an interactive IDE layout showing an incomplete function stub or React component structure, parse the required signature exactly, and generate ONLY the missing code logic or JSX needed to complete the function or React component. Do not rewrite the entire pre-existing boilerplate unless necessary to fill in the missing block.
   - Scenario 4 (Full-Screen Contextual Scanning): Scan all peripheral sections of the screen (e.g. sidebar constraints, visible test cases, edge cases, input/output limits, console output) to infer hidden constraints or rules specific to the detected language/framework before finalizing.
   - Scenario 5 (Dense/Long Context Handling): For complex, dense layouts with long descriptions and large pre-existing code blocks, scan the entire visual viewport context carefully to prevent omitting any constraints or stubs.

3. OUTPUT REDIRECTION:
   Generate the resulting code or descriptive text cleanly. Start your answer by clearly stating the detected language/framework (e.g. "Detected Language: Java") and a brief reasoning for the classification. Then, output the solution or analysis. Use proper markdown syntax highlighting for code blocks (e.g. \`\`\`java or \`\`\`javascript). Ensure the layout matches the existing chat overlay structure without any extra formatting wrappers.`;

const interviewContext = (q: string): string => {
    const head = `You are an executive technical interview copilot assisting a candidate live.\n`;
    if (/\b(vs|difference|compare|versus|between)\b/i.test(q)) {
        return `${head}Question: "${q}"

Format strictly for an interview setting:
1. Core Difference: 1 crisp punchy sentence highlighting the fundamental distinction.
2. Comparison Table or 3-4 Direct Contrast Bullets:
   - Feature / Aspect | Option A | Option B
3. When to Use Which: 1 sentence on the practical decision trade-off.

Rules: No introductory fluff, no academic history. Be concise, technically precise, and scannable in 5 seconds.`;
    }
    if (/^(what is|what are|explain|define|tell me about)\b/i.test(q)) {
        return `${head}Question: "${q}"

Format strictly for an interview setting:
1. Executive Definition: Exactly 1-2 punchy sentences defining what it is and what core problem it solves.
2. Key Pillars / Architecture: 3-4 bullet points highlighting internal mechanics, memory/runtime behavior, or primary components.
3. Industry Use-Case: 1 bullet with a realistic enterprise example.

Rules: Keep it brief, technically sharp, and immediately speakable to an interviewer.`;
    }
    return `${head}Topic / Keyword: "${q}"

Format strictly for an interview setting:
1. Definition & Expansion: 1 sentence explaining the acronym/concept and its fundamental purpose.
2. How It Works (Core Mechanics): 3-4 succinct bullet points (e.g. structure, lifecycle, workflow).
3. Pros & Trade-offs: 2 short bullets (1 major advantage, 1 common gotcha/edge case).
4. One-liner Interview Tip: 1 sentence on what interviewers look for when asking this.

Rules: Avoid walls of text. Use bold headers, bullet points, and high-signal terminology. Total length under 150 words.`;
};

const VISION_FAIL_LABELS: Record<string, string> = {
    no_vision_provider: 'No vision provider', all_vision_failed: 'Vision failed', privacy_blocked: 'Private mode blocked vision',
    scope_blocked: 'Screenshots disabled', provider_timeout: 'Vision timed out',
};
const VISION_FAIL_TITLES: Record<string, string> = {
    no_vision_provider: 'No vision-capable provider is configured. Add a Natively, OpenAI, Claude, Gemini, or Groq key — or configure a local Ollama vision model.',
    all_vision_failed: 'All configured vision providers failed for this turn. Check provider quotas and try again.',
    privacy_blocked: 'Private vision mode blocked cloud vision providers; no local vision provider is configured.',
    scope_blocked: 'Screenshots are disabled for the current provider. Enable the screenshots scope in Settings.',
    provider_timeout: 'Vision provider exceeded its per-call timeout; the chain moved on to the next provider.',
};

const MODEL_NAMES: Record<string, string> = {
    'gemini-2.5-flash': 'Gemini 2.5 Flash', 'gemini-2.5-pro': 'Gemini 2.5 Pro', 'llama-3.3-70b-versatile': 'Groq Llama 3.3',
    'gpt-5.4': 'GPT 5.4', 'claude-sonnet-4-6': 'Sonnet 4.6',
};
const modelLabel = (m: string) =>
    getCodexCliModelDisplayName(m) || (m.startsWith('ollama-') ? m.replace('ollama-', '') : MODEL_NAMES[m] ?? m);

const INTENT_CARDS: Record<string, { icon: React.ReactNode; label: string; light: string; dark: string }> = {
    shorten: { icon: <MessageSquare className="w-3.5 h-3.5" />, label: 'Shortened', light: 'text-cyan-700', dark: 'text-cyan-300' },
    recap: { icon: <RefreshCw className="w-3.5 h-3.5" />, label: 'Recap', light: 'text-indigo-700', dark: 'text-indigo-300' },
    follow_up_questions: { icon: <HelpCircle className="w-3.5 h-3.5" />, label: 'Follow-Up Questions', light: 'text-amber-700', dark: 'text-[#FFD60A]' },
};

const BANNER = {
    yellow: {
        box: 'bg-yellow-500/10 border-yellow-500/20', title: 'text-yellow-600 dark:text-yellow-400/90', iconBg: 'bg-yellow-500/20',
        icon: 'text-yellow-600 dark:text-yellow-400', body: 'text-yellow-600/70 dark:text-yellow-400/60',
        btn: 'bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-700 dark:text-yellow-500 border-yellow-500/20',
        x: 'text-yellow-600/50 hover:text-yellow-700 dark:text-yellow-500/50 dark:hover:text-yellow-400',
    },
    orange: {
        box: 'bg-orange-500/10 border-orange-500/20', title: 'text-orange-600 dark:text-orange-400/90', iconBg: 'bg-orange-500/20',
        icon: 'text-orange-600 dark:text-orange-400', body: 'text-orange-600/70 dark:text-orange-400/60',
        btn: 'bg-orange-500/15 hover:bg-orange-500/25 text-orange-700 dark:text-orange-500 border-orange-500/20',
        x: 'text-orange-600/50 hover:text-orange-700 dark:text-orange-500/50 dark:hover:text-orange-400',
    },
};
const WARN_PATH = 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z';
const MIC_PATH = 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z';

/* ───────────────────────── pure helpers ───────────────────────── */

const sanitizeInput = (t: string) => t.trim().replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
const stripSystemInstructions = (t: string) =>
    t.replace(/\[system\][\s\S]*?\[\/system\]/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^(System|Assistant):\s*/i, '').trim();

const formatProviderLabel = (p?: string | null) =>
    p ? p.split(/[-_\s]+/).filter(Boolean).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') : 'not set';

const getSttSummary = (u: SttState, i: SttState, up: string, ip: string, notConfigured: boolean): { label: string; tone: Tone; detail: string } => {
    const detail = `${formatProviderLabel(up)} mic · ${formatProviderLabel(ip)} system`;
    if (notConfigured) return { label: 'STT not configured', tone: 'error', detail: 'Open Audio settings to select a provider' };
    if (u === 'failed' || i === 'failed') return { label: 'STT needs attention', tone: 'error', detail };
    if (u === 'reconnecting' || i === 'reconnecting') return { label: 'STT reconnecting', tone: 'warn', detail };
    return { label: 'STT healthy', tone: 'ok', detail };
};

const getStatusToneClass = (tone: Tone) =>
    tone === 'error' ? 'text-rose-600 dark:text-rose-300 border-rose-500/20 bg-rose-500/10'
        : tone === 'warn' ? 'text-amber-600 dark:text-amber-300 border-amber-500/20 bg-amber-500/10'
            : 'text-emerald-600 dark:text-emerald-300 border-emerald-500/20 bg-emerald-500/10';

const detectMode = (t: string): ScreenshotAnalysisMode | null => {
    t = t.toLowerCase();
    if (/code|review/.test(t)) return 'code-review';
    if (/dsa|problem|algorithm|leetcode|coding/.test(t)) return 'dsa';
    if (/error|terminal|stack|log|exception|crash|debug/.test(t)) return 'error';
    return null;
};

let idCounter = 0;
const mk = (text: string, extra: Partial<Message> = {}): Message => ({ id: `${Date.now()}-${idCounter++}`, role: 'system', text, ...extra });
const stopStreaming = (p: Message[]) => p.map(m => (m.isStreaming ? { ...m, isStreaming: false } : m));

/** Append streamed text to the last streaming message of `intent`, or start a new one. */
const appendTo = (p: Message[], intent: string | undefined, text: string): Message[] => {
    const last = p[p.length - 1];
    if (last?.isStreaming && last.intent === intent) return [...p.slice(0, -1), { ...last, text: last.text + text }];
    return [...p, mk(text, { intent, isStreaming: true })];
};
/** Finish the last streaming message of `intent` with `patch`, or append a finished one. */
const settle = (p: Message[], intent: string | undefined, patch: Partial<Message>): Message[] => {
    const last = p[p.length - 1];
    if (last?.isStreaming && last.intent === intent) return [...p.slice(0, -1), { ...last, ...patch, isStreaming: false }];
    return [...p, mk('', { intent, ...patch })];
};
const toContext = (list: Message[], n: number) =>
    list.filter(m => m.role !== 'user' || !m.hasScreenshot)
        .map(m => `${m.role === 'interviewer' ? 'Interviewer' : m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
        .slice(-n).join('\n');
const withPending = (list: Shot[], pending: Shot | null) =>
    (pending && !list.some(s => s.path === pending.path) ? [...list, pending].slice(-5) : list)
        .filter(s => s.path && typeof s.path === 'string' && s.path.trim().length > 0);
const jumpBottom = (ref: { current: HTMLElement | null }) =>
    requestAnimationFrame(() => { const c = ref.current; if (c) c.scrollTop = c.scrollHeight; });
const readFlag = (k: string) => localStorage.getItem(k) !== 'false';

/** Subscribe to a map of electronAPI event hooks once; every handler must only use refs/setters. */
function useIpc(api: any, map: Record<string, (d: any) => void>) {
    useEffect(() => {
        const offs = Object.entries(map).map(([k, cb]) => api[k]?.(cb));
        return () => offs.forEach(o => typeof o === 'function' && o());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
}

/* ───────────────────────── small components ───────────────────────── */

const HighlightedCode = React.memo(function HighlightedCode({ code, lang, theme, lineColor, appearance }: { code: string; lang: string; theme: any; lineColor: string; appearance: any }) {
    return (
        <div className="my-3 rounded-xl overflow-hidden border shadow-lg overlay-code-block-surface" style={appearance.codeBlockStyle}>
            <div className="px-3 py-1.5 border-b overlay-code-header-surface" style={appearance.codeHeaderStyle}>
                <span className="text-[10px] uppercase tracking-widest font-semibold font-mono overlay-text-muted">{lang || 'CODE'}</span>
            </div>
            <div className="bg-transparent overflow-x-auto">
                <SyntaxHighlighter
                    language={lang} style={theme} customStyle={HC_CUSTOM_STYLE} wrapLongLines={false} showLineNumbers
                    lineNumberStyle={{ minWidth: '2.5em', paddingRight: '1.2em', color: lineColor, textAlign: 'right', fontSize: '11px' }}
                >
                    {code}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}, (a, b) => a.code === b.code && a.lang === b.lang && a.appearance === b.appearance);

const MessageRow = React.memo(function MessageRow({ msg, isLightTheme, appearance, onCopy, renderMessageText }: {
    msg: Message; isLightTheme: boolean; appearance: any; onCopy: (t: string) => void; renderMessageText: (m: Message) => React.ReactNode;
}) {
    const isCodeMsg = msg.role === 'system' && (msg.isCode || (msg.text ?? '').includes('```'));
    const bubbleMax = msg.role === 'user' ? 'max-w-[72%] px-[13.6px] py-[10.2px]' : 'max-w-[85%] px-4 py-3';
    const roleCls = msg.role === 'user'
        ? (isLightTheme
            ? 'bg-blue-500/10 backdrop-blur-md border border-blue-500/20 text-blue-900 rounded-[20px] rounded-tr-[4px] shadow-sm font-medium'
            : 'bg-blue-600/20 backdrop-blur-md border border-blue-500/30 text-blue-100 rounded-[20px] rounded-tr-[4px] shadow-sm font-medium')
        : msg.role === 'system' ? 'overlay-text-primary font-normal' : 'overlay-text-muted italic pl-0 text-[13px]';
    return (
        <div className="w-full" {...(isCodeMsg ? { 'data-code-msg': 'true' } : {})}>
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
                <div className={`${bubbleMax} text-[14px] leading-relaxed relative group whitespace-pre-wrap ${roleCls}`}>
                    {msg.role === 'interviewer' && (
                        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-medium uppercase tracking-wider overlay-text-muted">
                            Interviewer
                            {msg.isStreaming && <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />}
                        </div>
                    )}
                    {msg.role === 'user' && msg.hasScreenshot && (
                        <div className={`flex items-center gap-1 text-[10px] opacity-70 mb-1 border-b pb-1 ${isLightTheme ? 'border-black/10' : 'border-white/10'}`}>
                            <Image className="w-2.5 h-2.5"/><span>Screenshot attached</span>
                        </div>
                    )}
                    {msg.role === 'system' && !msg.isStreaming && (
                        <button
                            onClick={() => onCopy(msg.text)} title="Copy to clipboard" style={appearance.iconStyle}
                            className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity overlay-icon-surface overlay-icon-surface-hover overlay-text-interactive"
                        >
                            <Copy className="w-3.5 h-3.5"/>
                        </button>
                    )}
                    {renderMessageText(msg)}
                </div>
            </div>
        </div>
    );
}, (a, b) => a.msg === b.msg && a.isLightTheme === b.isLightTheme && a.appearance === b.appearance && a.renderMessageText === b.renderMessageText && a.onCopy === b.onCopy);

const Banner = ({ c, title, body, path, onBtn, onClose }: { c: typeof BANNER.yellow; title: string; body: string; path: string; onBtn: () => void; onClose: () => void }) => (
    <div className={`flex items-center justify-between mx-4 mt-3 mb-1 px-3.5 py-2.5 border rounded-[12px] shadow-sm relative no-drag group/banner ${c.box}`}>
        <div className="flex flex-col gap-1 pr-3">
            <div className={`flex items-center gap-2 text-[12.5px] font-medium leading-tight ${c.title}`}>
                <div className={`shrink-0 p-1 rounded-full ${c.iconBg}`}>
                    <svg className={`w-3.5 h-3.5 ${c.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={path} />
                    </svg>
                </div>
                <span>{title}</span>
            </div>
            <p className={`text-[11px] leading-snug pl-[26px] ${c.body}`}>{body}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
            <button onClick={onBtn} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 border shadow-sm ${c.btn}`}>Open Settings</button>
            <button onClick={onClose} title="Dismiss" className={`p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors absolute top-1 right-1 opacity-0 group-hover/banner:opacity-100 ${c.x}`}>
                <X className="w-3 h-3"/>
            </button>
        </div>
    </div>
);

const Notice = ({ box, btn, btnLabel, onBtn, onClose, children }: { box: string; btn: string; btnLabel: string; onBtn: () => void; onClose: () => void; children: React.ReactNode }) => (
    <div data-stealth-ignore="true" className={`mb-2 px-3 py-2 rounded-xl border text-[11px] flex items-center gap-2 ${box}`}>
        <span className="overlay-text-primary flex-1">{children}</span>
        <button data-stealth-ignore="true" onClick={onBtn} className={`px-2 py-1 rounded-md transition-colors text-[11px] font-medium overlay-text-primary whitespace-nowrap ${btn}`}>{btnLabel}</button>
        <button data-stealth-ignore="true" aria-label="Dismiss" onClick={onClose} className="px-1.5 py-1 rounded-md hover:bg-white/10 transition-colors text-[11px] overlay-text-muted">×</button>
    </div>
);

const DismissibleAlert = ({ cls, children, onClose }: { cls: string; children: React.ReactNode; onClose: () => void }) => (
    <div className={`mx-3 mt-2 px-3 py-2 rounded-lg border text-[11px] flex items-center gap-2 ${cls}`}>
        {children}
        <button onClick={onClose} className="shrink-0 hover:opacity-70"><X className="w-3 h-3"/></button>
    </div>
);

/* ───────────────────────── main component ───────────────────────── */

const NativelyInterface: React.FC<NativelyInterfaceProps> = ({ onEndMeeting, overlayOpacity = OVERLAY_OPACITY_DEFAULT, interfaceTheme = 'default' }) => {
    const isLightTheme = useResolvedTheme() === 'light';
    const isGlassTheme = interfaceTheme === 'liquid-glass';
    const api: any = (window as any).electronAPI ?? {};
    const { isShortcutPressed } = useShortcuts();

    // ── state
    const [isExpanded, setIsExpanded] = useState(true);
    const [inputValue, setInputValue] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [screenshotMessages, setScreenshotMessages] = useState<Message[]>([]);
    const [activeThread, setActiveThread] = useState<'chat' | 'screenshot'>('chat');
    const [attachedContext, setAttachedContext] = useState<Shot[]>([]);
    const [isProcessing, _setIsProcessing] = useState(false);
    const [stt, setStt] = useState<Record<'user' | 'interviewer', { status: SttState; error: string; provider: string }>>({
        user: { status: 'connected', error: '', provider: '' },
        interviewer: { status: 'connected', error: '', provider: '' },
    });
    const [sttNotConfigured, setSttNotConfigured] = useState(false);
    const [showTranscript, setShowTranscript] = useState(() => readFlag('natively_interviewer_transcript'));
    const [autoScroll, setAutoScroll] = useState(() => readFlag('natively_auto_scroll'));
    const [rollingTranscript, setRollingTranscript] = useState('');
    const [isInterviewerSpeaking, setIsInterviewerSpeaking] = useState(false);
    const [isUndetectable, setIsUndetectable] = useState(false);
    const [maxAllowedHeight, setMaxAllowedHeight] = useState(() => Math.max(500, window.screen.availHeight - 100));
    const [activeModeLabel, setActiveModeLabel] = useState<string | null>(null);
    const [llmProviderLabel, setLlmProviderLabel] = useState('unknown');
    const [llmPrivacyLabel, setLlmPrivacyLabel] = useState('Checking privacy route');
    const [screenContextStatus, setScreenContextStatus] = useState<'not_available' | 'available' | 'failed'>('not_available');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [onlyInterviewerMode, setOnlyInterviewerMode] = useState(false);
    const [mockInterviewMode, setMockInterviewMode] = useState(false);
    const [noiseCancellationEnabled, setNoiseCancellationEnabled] = useState(false);
    const [latestUsedImageInput, setLatestUsedImageInput] = useState(false);
    const [latestVisionProviderUsed, setLatestVisionProviderUsed] = useState<string | undefined>();
    const [latestVisionModelUsed, setLatestVisionModelUsed] = useState<string | undefined>();
    const [latestVisionFailureReason, setLatestVisionFailureReason] = useState<string | undefined>();
    const [screenshotAnalysisMode, setScreenshotAnalysisMode] = useState<ScreenshotAnalysisMode>('auto');
    const [dsaLanguage, setDsaLanguage] = useState('Python');
    const [visionStatus, setVisionStatus] = useState<{ status: string; detail?: string } | null>(null);
    const [currentModel, setCurrentModel] = useState('gemini-3-flash-preview');
    const [actionButtonMode, setActionButtonMode] = useState<'recap' | 'brainstorm'>('recap');
    const [systemAudioWarning, setSystemAudioWarning] = useState<string | null>(null);
    const [stealthPermissionMissing, setStealthPermissionMissing] = useState(false);
    const [stealthHotkeyConflict, setStealthHotkeyConflict] = useState<string | null>(null);

    const [liveInterviewActive, setLiveInterviewActive] = useState(false);
    const [liveTranscripts, setLiveTranscripts] = useState<Array<{ speaker: string; text: string; timestamp: number }>>([]);
    const [liveTechnicalQA, setLiveTechnicalQA] = useState<Array<{ question: string; answer: string; isTechnical: boolean; timestamp: number }>>([]);
    const [liveCodeAnalysis, setLiveCodeAnalysis] = useState<any[]>([]);
    const [liveError, setLiveError] = useState<string | null>(null);
    const [livePerformanceAlert, setLivePerformanceAlert] = useState<{ type: string; message: string; timestamp: number } | null>(null);
    const [performanceAlertVisible, setPerformanceAlertVisible] = useState(false);

    // ── refs
    const H = useRef<any>({});
    const isProcessingRef = useRef(false);
    const shellRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const liveTranscriptsEndRef = useRef<HTMLDivElement>(null);
    const textInputRef = useRef<HTMLInputElement>(null);
    const userScrolledAwayRef = useRef(false);
    const requestStartTimeRef = useRef<number | null>(null);
    const isStealthRef = useRef(false);
    const stealthTapActiveRef = useRef(false);
    const stealthAutoEngageOkRef = useRef(true);
    const escSuppressRef = useRef(false);
    const handleManualSubmitRef = useRef<() => void>(() => { });
    const pendingCaptureRef = useRef<Shot | null>(null);
    const isScreenshotAnalysisRef = useRef(false);
    const isExpandedRef = useRef(true);
    const codeExpandedRef = useRef(false);
    const wasAtBottomRef = useRef(true);
    const rafDimRef = useRef<number | null>(null);
    const animRef = useRef<ReturnType<typeof animate> | null>(null);
    const visTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingVisRef = useRef<boolean | null>(null);
    const perfTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inertialRef = useRef<{ kick: (axis: 'vert' | 'horiz', dir: -1 | 1) => void } | null>(null);
    const actionModeRef = useRef(actionButtonMode);
    const currentModelRef = useRef(currentModel);
    const isPressedRef = useRef(isShortcutPressed);
    const tokenBufRef = useRef<{ intent: string; text: string; raf: number | null }>({ intent: '', text: '', raf: null });
    actionModeRef.current = actionButtonMode;
    currentModelRef.current = currentModel;
    isPressedRef.current = isShortcutPressed;

    const setIsProcessing = useCallback((v: boolean) => { isProcessingRef.current = v; _setIsProcessing(v); }, []);
    const addSys = useCallback((text: string) => setMessages(p => [...p, mk(text)]), []);

    // ── streaming token batching
    const commitTokens = useCallback((sync: boolean) => {
        const b = tokenBufRef.current;
        if (b.raf !== null) { cancelAnimationFrame(b.raf); b.raf = null; }
        if (!b.text) return;
        const { intent, text } = b;
        b.text = '';
        const apply = () => setMessages(p => appendTo(p, intent, text));
        if (sync) apply();
        else reactStartTransition(apply);
    }, []);
    const queueToken = useCallback((intent: string, token: string) => {
        const b = tokenBufRef.current;
        if (b.text && b.intent !== intent) commitTokens(false);
        b.intent = intent;
        b.text += token;
        if (b.raf === null) b.raf = requestAnimationFrame(() => { b.raf = null; commitTokens(false); });
    }, [commitTokens]);
    const flushToken = useCallback(() => commitTokens(true), [commitTokens]);

    const scrollToBottom = useCallback(() => {
        if (!autoScroll || userScrolledAwayRef.current) return;
        const c = scrollContainerRef.current ?? (messagesEndRef.current?.closest('[class*="overflow-y"]') as HTMLElement | null);
        if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'auto' });
        else messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }, [autoScroll]);

    const handleScroll = useCallback(() => {
        const c = scrollContainerRef.current;
        if (c) userScrolledAwayRef.current = c.scrollHeight - c.scrollTop - c.clientHeight >= 100;
    }, []);

    const loadLlmRoute = useCallback(async () => {
        const c = await api.getCurrentLlmConfig?.().catch(() => null);
        if (!c) return;
        setLlmProviderLabel(formatProviderLabel(c.provider));
        setLlmPrivacyLabel(c.provider === 'ollama' || c.provider === 'codex-cli' ? 'Local/private route'
            : c.provider === 'custom' ? 'Custom endpoint route' : 'Cloud LLM route');
    }, [api]);

    // ── derived
    const codeTheme = isLightTheme ? oneLight : vscDarkPlus;
    const codeLineNumberColor = isLightTheme ? 'rgba(15,23,42,0.35)' : 'rgba(255,255,255,0.2)';
    const appearance = useMemo(
        () => isGlassTheme ? getGlassOverlayAppearance() : getOverlayAppearance(overlayOpacity, isLightTheme ? 'light' : 'dark'),
        [overlayOpacity, isLightTheme, isGlassTheme],
    );
    const conversationContext = useMemo(() => toContext(messages, 20), [messages]);
    const sttSummary = getSttSummary(stt.user.status, stt.interviewer.status, stt.user.provider, stt.interviewer.provider, sttNotConfigured);
    const interviewerErr = stt.interviewer.error?.replace(/\s*\(\d+ consecutive errors\):?/gi, '');
    const statusPill = `flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium shadow-sm backdrop-blur-xl ${isLightTheme ? 'bg-white/55 border-black/10' : 'bg-black/20 border-white/10'}`;
    const inputClass = `${isLightTheme ? 'focus:ring-black/10' : 'focus:ring-white/10'} overlay-input-surface overlay-input-text`;
    const chip = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all active:scale-95 duration-200 interaction-base interaction-press whitespace-nowrap shrink-0 overlay-chip-surface overlay-text-interactive';
    const slate = isLightTheme ? 'text-slate-800' : 'text-slate-200';

    const md = useMemo(() => {
        const c = (l: string, d: string) => (isLightTheme ? l : d);
        const tag = (T: any, cls: string, extra: any = {}) => ({ node: _n, ...p }: any) => <T className={cls} {...extra} {...p}/>;
        const lists = { ul: tag('ul', 'list-disc ml-4 mb-2 space-y-1'), ol: tag('ol', 'list-decimal ml-4 mb-2 space-y-1'), li: tag('li', 'pl-1') };
        const simple = (strong: string) => ({ p: tag('p', 'mb-2 last:mb-0'), strong: tag('strong', `font-bold ${strong}`), ul: tag('ul', 'list-disc ml-4 mb-2'), li: tag('li', 'pl-1') });
        const link = { target: '_blank', rel: 'noopener noreferrer' };
        return {
            standard: {
                p: tag('p', 'mb-2 last:mb-0 whitespace-pre-wrap'),
                strong: tag('strong', 'font-bold opacity-100 overlay-text-strong'),
                em: tag('em', 'italic opacity-90 overlay-text-secondary'),
                ...lists,
                code: tag('code', `overlay-inline-code-surface rounded px-1.5 py-0.5 text-xs font-mono ${c('text-slate-800', '')}`),
                a: tag('a', 'underline hover:opacity-80', link),
                table: ({ node: _n, ...p }: any) => (
                    <div className="my-2.5 overflow-x-auto rounded-lg border border-white/10 dark:border-white/10">
                        <table className="w-full text-left text-xs border-collapse" {...p} />
                    </div>
                ),
                thead: tag('thead', `${c('bg-black/5 text-slate-900', 'bg-white/5 text-slate-100')} border-b border-white/10 font-semibold`),
                tbody: tag('tbody', 'divide-y divide-white/5'),
                tr: tag('tr', 'transition-colors hover:bg-white/[0.02]'),
                th: tag('th', 'px-3 py-1.5 font-medium tracking-wide uppercase text-[10px] opacity-75'),
                td: tag('td', 'px-3 py-1.5 align-top leading-relaxed'),
            },
            codeText: {
                p: tag('p', 'mb-2 last:mb-0 whitespace-pre-wrap'),
                strong: tag('strong', 'font-bold overlay-text-strong'),
                em: tag('em', 'italic overlay-text-secondary'),
                ...lists,
                h1: tag('h1', 'text-lg font-bold mb-2 mt-3 overlay-text-strong'),
                h2: tag('h2', 'text-base font-bold mb-2 mt-3 overlay-text-strong'),
                h3: tag('h3', 'text-sm font-bold mb-1 mt-2 overlay-text-primary'),
                code: tag('code', `overlay-inline-code-surface rounded px-1 py-0.5 text-xs font-mono whitespace-pre-wrap ${c('text-violet-700', 'text-purple-200')}`),
                blockquote: tag('blockquote', `border-l-2 pl-3 italic my-2 ${c('border-violet-500/30 text-slate-600', 'border-purple-500/50 text-slate-400')}`),
                a: tag('a', `hover:underline ${c('text-blue-600 hover:text-blue-700', 'text-blue-400 hover:text-blue-300')}`, link),
            },
            what_to_answer: {
                p: tag('p', 'mb-2 last:mb-0'),
                strong: tag('strong', `font-bold ${c('text-emerald-700', 'text-emerald-100')}`),
                em: tag('em', `italic ${c('text-emerald-700/80', 'text-emerald-200/80')}`),
                ...lists,
            },
            shorten: simple(c('text-cyan-800', 'text-cyan-100')),
            recap: simple(c('text-indigo-800', 'text-indigo-100')),
            follow_up_questions: simple(c('text-amber-800', 'text-[#FFF9C4]')),
        } as Record<string, any>;
    }, [isLightTheme]);

    const shellWidth = useMotionValue(W_COLLAPSED);
    const shellMaxH = useTransform(shellWidth, [W_COLLAPSED, W_EXPANDED], [320, 560]);

    /* ───────────── layout / animation ───────────── */

    const animateWidth = useCallback((target: number) => {
        codeExpandedRef.current = target === W_EXPANDED;
        animRef.current?.stop();
        const c = scrollContainerRef.current;
        if (c) wasAtBottomRef.current = c.scrollHeight - (c.scrollTop + c.clientHeight) <= 8;
        animRef.current = animate(shellWidth, target, {
            type: 'tween' as const, ease: [0.65, 0, 0.35, 1] as [number, number, number, number], duration: 0.7,
            onUpdate: () => {
                const el = scrollContainerRef.current;
                if (wasAtBottomRef.current && el) el.scrollTop = el.scrollHeight - el.clientHeight;
            },
            onComplete: () => { animRef.current = null; },
        });
    }, [shellWidth]);

    const checkCodeVisibility = useCallback(() => {
        const c = scrollContainerRef.current;
        const clearTimer = () => { if (visTimerRef.current) { clearTimeout(visTimerRef.current); visTimerRef.current = null; } };
        if (!c) {
            clearTimer(); pendingVisRef.current = null;
            if (codeExpandedRef.current) animateWidth(W_COLLAPSED);
            return;
        }
        const cr = c.getBoundingClientRect();
        const visible = Array.from(c.querySelectorAll('[data-code-msg]')).some(el => {
            const r = el.getBoundingClientRect();
            return r.bottom > cr.top && r.top < cr.bottom;
        });
        if (visible === codeExpandedRef.current) { pendingVisRef.current = null; clearTimer(); return; }
        if (pendingVisRef.current === visible) return;
        pendingVisRef.current = visible;
        clearTimer();
        visTimerRef.current = setTimeout(() => {
            visTimerRef.current = null;
            const t = pendingVisRef.current;
            pendingVisRef.current = null;
            if (t !== null && t !== codeExpandedRef.current) animateWidth(t ? W_EXPANDED : W_COLLAPSED);
        }, 120);
    }, [animateWidth]);

    const reportShellSize = useCallback(() => {
        if (!contentRef.current) return;
        const rect = contentRef.current.getBoundingClientRect();
        const size = { width: isExpandedRef.current ? W_EXPANDED : Math.ceil(rect.width), height: Math.ceil(rect.height) };
        (api.updateContentDimensionsCentered ?? api.updateContentDimensions)?.call(api, size);
    }, [api]);

    useLayoutEffect(() => {
        if (!contentRef.current) return;
        const ro = new ResizeObserver(() => {
            if (rafDimRef.current) cancelAnimationFrame(rafDimRef.current);
            rafDimRef.current = requestAnimationFrame(() => { rafDimRef.current = null; reportShellSize(); });
        });
        ro.observe(contentRef.current);
        return () => { ro.disconnect(); if (rafDimRef.current) cancelAnimationFrame(rafDimRef.current); rafDimRef.current = null; };
    }, [reportShellSize]);

    useEffect(() => { const id = requestAnimationFrame(reportShellSize); return () => cancelAnimationFrame(id); }, [attachedContext, reportShellSize]);
    useEffect(() => { const t = setTimeout(reportShellSize, 600); return () => clearTimeout(t); }, [reportShellSize]);
    useEffect(() => { isExpandedRef.current = isExpanded; }, [isExpanded]);

    useEffect(() => { const id = requestAnimationFrame(checkCodeVisibility); return () => cancelAnimationFrame(id); }, [messages, checkCodeVisibility]);

    useEffect(() => {
        const c = scrollContainerRef.current;
        if (!c) return;
        let id: number | null = null;
        const onScroll = () => {
            if (id !== null) return;
            id = requestAnimationFrame(() => { id = null; checkCodeVisibility(); });
        };
        c.addEventListener('scroll', onScroll, { passive: true });
        return () => { c.removeEventListener('scroll', onScroll); if (id !== null) cancelAnimationFrame(id); };
    }, [messages, isExpanded, checkCodeVisibility]);

    useEffect(() => { scrollToBottom(); }, [messages, screenshotMessages, scrollToBottom]);

    useEffect(() => {
        if (messages.some(m => m.isStreaming) || screenshotMessages.some(m => m.isStreaming)) {
            const c = scrollContainerRef.current;
            if (c) c.scrollTop = c.scrollHeight;
        }
    }, [messages, screenshotMessages]);

    useEffect(() => {
        const c = liveTranscriptsEndRef.current?.closest('[class*="overflow-y"]') as HTMLElement | null;
        c?.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    }, [liveTranscripts]);

    useEffect(() => () => {
        animRef.current?.stop();
        if (rafDimRef.current) cancelAnimationFrame(rafDimRef.current);
        if (visTimerRef.current) clearTimeout(visTimerRef.current);
        if (perfTimerRef.current) clearTimeout(perfTimerRef.current);
        const b = tokenBufRef.current;
        if (b.raf !== null) { cancelAnimationFrame(b.raf); b.raf = null; b.text = ''; }
    }, []);

    /* ───────────── settings / bootstrap ───────────── */

    useEffect(() => {
        const onStorage = () => { setShowTranscript(readFlag('natively_interviewer_transcript')); setAutoScroll(readFlag('natively_auto_scroll')); };
        const onResize = () => setMaxAllowedHeight(Math.max(500, window.screen.availHeight - 100));
        window.addEventListener('storage', onStorage);
        window.addEventListener('resize', onResize);
        return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('resize', onResize); };
    }, []);

    useEffect(() => {
        localStorage.setItem('natively_undetectable', String(isUndetectable));
        localStorage.setItem('natively_hideChatHidesWidget', localStorage.getItem('natively_hideChatHidesWidget') ?? 'true');
    }, [isUndetectable]);

    useEffect(() => {
        api.modesGetActive?.()?.then((m: any) => setActiveModeLabel(m?.name ?? null)).catch(() => { });
        api.getDefaultModel?.()?.then((r: any) => {
            if (r?.model) { setCurrentModel(r.model); api.setModel?.(r.model)?.catch(() => { }); }
        }).catch((e: any) => console.error('Failed to fetch default model:', e));
        api.getUndetectable?.()?.then(setIsUndetectable);
        api.getSttProvider?.()?.then((p: string) => setSttNotConfigured(p === 'none')).catch(() => { });
        api.getActionButtonMode?.()?.then((m: any) => m && setActionButtonMode(m)).catch(() => { });
        loadLlmRoute();
        (async () => {
            try {
                const get = async (n: string) => (await api[n]?.()) ?? { enabled: false };
                const [o, m, n] = await Promise.all([get('getOnlyInterviewerMode'), get('getMockInterviewMode'), get('getNoiseCancellationEnabled')]);
                if (o?.enabled !== undefined) setOnlyInterviewerMode(o.enabled);
                if (m?.enabled !== undefined) setMockInterviewMode(m.enabled);
                if (n?.enabled !== undefined) setNoiseCancellationEnabled(n.enabled);
            } catch { /* ignore */ }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (isExpanded) { api.showWindow?.(isStealthRef.current); isStealthRef.current = false; return; }
        const t = setTimeout(() => api.hideWindow?.(), 400);
        return () => clearTimeout(t);
    }, [isExpanded, api]);

    /* ───────────── message-level helpers ───────────── */

    const handleCopy = useCallback((text: string) => { navigator.clipboard.writeText(text); analytics.trackCopyAnswer(); }, []);

    /** End a stream: stop spinner, close streaming bubble, optionally add a suffix / fallback message. */
    const endStream = (suffix = '', fallback = '') => {
        setIsProcessing(false);
        requestStartTimeRef.current = null;
        const set = isScreenshotAnalysisRef.current ? setScreenshotMessages : setMessages;
        isScreenshotAnalysisRef.current = false;
        set(p => {
            const l = p[p.length - 1];
            if (l?.isStreaming) return [...p.slice(0, -1), { ...l, isStreaming: false, text: l.text + suffix }];
            return fallback ? [...p, mk(fallback)] : p;
        });
    };
    const streamChunk = (chunk: string, codeTest: (t: string) => boolean) => {
        (isScreenshotAnalysisRef.current ? setScreenshotMessages : setMessages)(p => {
            const l = p[p.length - 1];
            if (l?.isStreaming && l.role === 'system') {
                const text = l.text + chunk;
                return [...p.slice(0, -1), { ...l, text, isCode: codeTest(text) }];
            }
            return p;
        });
    };
    const finalize = (intent: string | ((d: any) => string), pick: (d: any) => string) => (d: any) => {
        flushToken();
        setIsProcessing(false);
        setMessages(p => settle(p, typeof intent === 'function' ? intent(d) : intent, { text: pick(d) }));
    };
    const fail = (text: string) => { setIsProcessing(false); addSys(text); };

    /* ───────────── actions ───────────── */

    const attach = (d: any) => {
        if (!d?.path || typeof d.path !== 'string' || !d.path.trim()) { console.warn('[NativelyInterface] invalid screenshot data rejected', d); return; }
        setIsExpanded(true);
        setActiveThread('screenshot');
        setScreenshotMessages(p => [...p, mk('What is on this screen?', { role: 'user', hasScreenshot: true, screenshotPreview: d.preview, screenshotPath: d.path })]);
        pendingCaptureRef.current = d;
        setAttachedContext(p => (p.some(s => s.path === d.path) ? p : [...p, d].slice(-5)));
        isScreenshotAnalysisRef.current = true;
        H.current.handleWhatToSay();
    };

    const handleWhatToSay = async (instr?: string | React.MouseEvent) => {
        if (isProcessingRef.current) { pendingCaptureRef.current = null; return; }
        const custom = typeof instr === 'string' ? instr : undefined;
        const inShot = activeThread === 'screenshot' || isScreenshotAnalysisRef.current;
        setIsExpanded(true);
        setIsProcessing(true);
        analytics.trackCommandExecuted('what_to_say');

        const atts = withPending(attachedContext, pendingCaptureRef.current);
        pendingCaptureRef.current = null;

        if (atts.length) {
            setAttachedContext([]);
            if (inShot) {
                isScreenshotAnalysisRef.current = true;
                setScreenshotMessages(p => [...p, mk('', { intent: 'what_to_answer', isStreaming: true })]);
            } else {
                setMessages(p => [...p, mk('What should I say about this?', { role: 'user', hasScreenshot: true, screenshotPreview: atts[0].preview })]);
            }
            jumpBottom(scrollContainerRef);
        }

        const mode = screenshotAnalysisMode === 'auto' ? 'general' : screenshotAnalysisMode;
        const analysis = `[Analysis mode: ${mode === 'dsa' ? `${mode} (language: ${dsaLanguage})` : mode}]\n${MODE_PROMPTS[mode](dsaLanguage)}`;
        const instruction = custom || (atts.length ? analysis : undefined);

        let answer: string | null = null;
        try {
            const r = await api.generateWhatToSay(undefined, atts.length ? atts.map(s => s.path) : undefined, instruction ? { promptInstruction: instruction } : undefined);
            setScreenContextStatus(r.screenContextStatus || 'not_available');
            setLatestUsedImageInput(Boolean(r.usedImageInput));
            setLatestVisionProviderUsed(r.visionProviderUsed);
            setLatestVisionModelUsed(r.visionModelUsed);
            setLatestVisionFailureReason(r.visionFailureReason);
            answer = r.answer;
            if (r.detectedScreenType) {
                setVisionStatus({ status: 'classified', detail: `Detected: ${r.detectedScreenType}` });
                const dm = detectMode(r.detectedScreenType);
                if (dm && screenshotAnalysisMode === 'auto') setScreenshotAnalysisMode(dm);
            }
        } catch (err) {
            const msg = `Error: ${err}`;
            if (inShot) setScreenshotMessages(p => p.map(m => (m.isStreaming ? { ...m, text: msg, isStreaming: false } : m)));
            else addSys(msg);
        } finally {
            setIsProcessing(false);
            const text = answer || '';
            (inShot ? setScreenshotMessages : setMessages)(p => {
                const streaming = p.some(m => m.isStreaming);
                if (!answer) return streaming ? stopStreaming(p) : p;
                if (inShot) {
                    const l = p[p.length - 1];
                    if (l?.isStreaming && !l.text?.trim()) return [...p.slice(0, -1), { ...l, text, isStreaming: false }];
                    if (streaming) return stopStreaming(p);
                    return l?.text === text ? p : [...p, mk(text, { intent: 'what_to_answer' })];
                }
                if (streaming) return p.map(m => (m.isStreaming ? { ...m, text, isStreaming: false } : m));
                return p[p.length - 1]?.text === text ? p : [...p, mk(text)];
            });
            isScreenshotAnalysisRef.current = false;
            setVisionStatus(null);
        }
    };

    /** Shared wrapper for one-shot AI commands. */
    const runCmd = async (track: string, fn: () => Promise<any>) => {
        if (isProcessingRef.current) return;
        setIsExpanded(true);
        setIsProcessing(true);
        analytics.trackCommandExecuted(track);
        try { await fn(); } catch (err) { addSys(`Error: ${err}`); } finally { setIsProcessing(false); }
    };
    const runWithShots = (track: string, userText: string, call: (paths?: string[]) => Promise<any>) =>
        runCmd(track, async () => {
            const atts = attachedContext;
            if (atts.length) {
                setAttachedContext([]);
                setMessages(p => [...p, mk(userText, { role: 'user', hasScreenshot: true, screenshotPreview: atts[0].preview })]);
                jumpBottom(scrollContainerRef);
            }
            await call(atts.length ? atts.map(s => s.path) : undefined);
        });

    const handleFollowUp = (intent = 'rephrase') => runCmd('follow_up_' + intent, () => api.generateFollowUp(intent));
    const handleRecap = () => runCmd('recap', () => api.generateRecap());
    const handleFollowUpQuestions = () => runCmd('suggest_questions', () => api.generateFollowUpQuestions());
    const handleClarify = () => runCmd('clarify', () => api.generateClarify());
    const handleCodeHint = () => runWithShots('code_hint', 'Give me a code hint for this', p => api.generateCodeHint(p));
    const handleBrainstorm = () => runWithShots('brainstorm', 'Brainstorm with this context', p => api.generateBrainstorm(p));

    const handleCodingHelp = () => runCmd('coding_help', async () => {
        setActiveThread('chat');
        let atts = attachedContext;
        if (!atts.length) {
            try {
                const s = await api.captureAndProcessScreenshot?.();
                if (!s?.path) {
                    addSys('Failed to capture screenshot: No screenshot path was returned. Please make sure Natively has Screen Recording permissions in your System Settings, or take a screenshot manually using Ctrl+Shift+Enter.');
                    return;
                }
                atts = [{ path: s.path, preview: s.preview || (await api.getImagePreview?.(s.path)) || '' }];
            } catch (err) {
                addSys(`Failed to capture screenshot: ${err}. Take a screenshot manually first (Ctrl+Shift+Enter).`);
                return;
            }
        }
        setAttachedContext([]);
        setMessages(p => [...p,
            mk('Solve this coding problem with explanation', { role: 'user', hasScreenshot: true, screenshotPreview: atts[0].preview }),
            mk('', { isStreaming: true })]);
        jumpBottom(scrollContainerRef);
        try {
            requestStartTimeRef.current = Date.now();
            await api.streamGeminiChat(CODING_PROMPT, atts.map(s => s.path), 'Coding interview question from screenshot', { skipSystemPrompt: true });
        } catch (err) {
            setMessages(p => {
                const l = p[p.length - 1];
                return l?.isStreaming && l.text === '' ? [...p.slice(0, -1), mk(`Error starting analysis: ${err}`)] : [...p, mk(`Error: ${err}`)];
            });
        }
    });

    const handleManualSubmit = async () => {
        if (!inputValue.trim() && attachedContext.length === 0) return;
        const userText = sanitizeInput(inputValue);
        const atts = withPending(attachedContext, pendingCaptureRef.current);
        pendingCaptureRef.current = null;
        setInputValue('');
        setAttachedContext([]);
        flushToken();
        tokenBufRef.current.intent = '';

        const isShot = activeThread === 'screenshot';
        const set = isShot ? setScreenshotMessages : setMessages;
        if (isShot) isScreenshotAnalysisRef.current = true;
        set(p => [...stopStreaming(p),
            mk(userText || (atts.length ? 'Analyze this screenshot' : ''), {
                role: 'user', hasScreenshot: atts.length > 0, screenshotPreview: atts[0]?.preview, screenshotPath: atts[0]?.path,
            }),
            mk('', { isStreaming: true })]);
        jumpBottom(scrollContainerRef);
        setIsExpanded(true);
        setIsProcessing(true);

        try {
            let paths: string[] | undefined = atts.length ? atts.map(s => s.path) : undefined;
            if (isShot && !paths) {
                const last = [...screenshotMessages].reverse().find(m => m.hasScreenshot && m.screenshotPath);
                if (last?.screenshotPath) paths = [last.screenshotPath];
            }
            let ctx = conversationContext;
            if (isShot) ctx = toContext(screenshotMessages, 10);
            else if (!atts.length) ctx = interviewContext(userText.trim());

            requestStartTimeRef.current = Date.now();
            await api.streamGeminiChat(userText || 'Analyze this screenshot', paths, ctx);
        } catch (err) {
            setIsProcessing(false);
            set(p => {
                const l = p[p.length - 1];
                return l?.isStreaming && l.text === '' ? [...p.slice(0, -1), mk(`❌ Error starting stream: ${err}`)] : [...p, mk(`❌ Error: ${err}`)];
            });
        }
    };
    handleManualSubmitRef.current = handleManualSubmit;

    const handleClear = async () => {
        await api.resetIntelligence?.()?.catch(() => { });
        setMessages([]); setScreenshotMessages([]); setAttachedContext([]); setInputValue(''); setIsProcessing(false);
    };

    const shot = (fn: string) => async () => {
        try { const d = await api[fn]?.(); if (d?.path && !d.cancelled) attach(d); }
        catch (err) { console.error(`Error triggering ${fn}:`, err); }
    };

    H.current = {
        handleWhatToSay, handleFollowUp, handleFollowUpQuestions, handleRecap, handleClarify, handleCodeHint, handleBrainstorm, handleCodingHelp, attach,
        resetCancel: async () => {
            if (isProcessingRef.current) setIsProcessing(false);
            else { await api.resetIntelligence?.(); setMessages([]); setAttachedContext([]); setInputValue(''); }
        },
        takeScreenshot: shot('takeScreenshot'),
        selectiveScreenshot: shot('takeSelectiveScreenshot'),
        captureAndProcess: shot('captureAndProcessScreenshot'),
    };

    const copyDiagnostics = async () => {
        const [arch, osVersion] = await Promise.all([api.getArch?.().catch(() => 'unknown'), api.getOsVersion?.().catch(() => 'unknown')]);
        const { categorizeSttError } = await import('../lib/sttErrorMapper');
        const part = (label: string, c: { status: string; error: string; provider: string }) => {
            const cat = c.error ? categorizeSttError(c.error) : null;
            return [`${label} Provider: ${c.provider}`, `${label} Status: ${c.status}`, cat ? `${label} Category: ${cat.title} [${cat.category}]` : '', `${label} Error: ${c.error || 'N/A'}`];
        };
        const report = [
            '## STT Diagnostic Report',
            `App Version: ${import.meta.env.VITE_APP_VERSION || 'unknown'}`,
            `Platform: ${osVersion} (${arch})`, '---',
            ...part('Microphone', stt.user), '---',
            ...part('System Audio', stt.interviewer),
            `Timestamp: ${new Date().toISOString()}`,
        ].filter(Boolean).join('\n');
        try { await navigator.clipboard.writeText(report); }
        catch {
            const ta = document.createElement('textarea');
            ta.value = report;
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        }
    };

    /* ───────────── IPC subscriptions (one-time) ───────────── */

    useIpc(api, {
        onToggleExpand: () => setIsExpanded(p => !p),
        onEnsureExpanded: () => { isStealthRef.current = true; setIsExpanded(true); },
        onSessionReset: () => {
            setMessages([]); setInputValue(''); setAttachedContext([]); setRollingTranscript(''); setIsProcessing(false);
            analytics.trackConversationStarted();
        },
        onSettingsVisibilityChange: setIsSettingsOpen,
        onUndetectableChanged: setIsUndetectable,
        onActionButtonModeChanged: setActionButtonMode,
        onModeChanged: (d) => setActiveModeLabel(d.name),
        onModelChanged: (id: string) => { loadLlmRoute(); setCurrentModel(p => (p === id ? p : id)); },
        onSystemAudioPermissionDenied: (msg: string) => { setSystemAudioWarning(msg); setIsExpanded(true); },
        onAudioCaptureFailed: (p) => { if (p.channel === 'system' && (p.terminal || p.stuck)) { setSystemAudioWarning(p.message); setIsExpanded(true); } },
        onSttConfigChanged: (d) => setSttNotConfigured(!d.configured),
        onSttStatusChanged: (d) => {
            const ch = d.channel as 'user' | 'interviewer';
            if (ch !== 'user' && ch !== 'interviewer') return;
            setStt(s => ({ ...s, [ch]: { status: d.state, provider: d.provider, error: d.state === 'connected' ? '' : d.error ?? s[ch].error } }));
        },

        onNativeAudioTranscript: (t) => {
            if (t.speaker !== 'interviewer') return;
            setIsInterviewerSpeaking(!t.final);
            if (t.final) {
                setRollingTranscript(p => p + (p ? SEP : '') + t.text);
                setTimeout(() => setIsInterviewerSpeaking(false), 3000);
            } else {
                setRollingTranscript(p => { const i = p.lastIndexOf(SEP); return (i >= 0 ? p.substring(0, i + SEP.length) : '') + t.text; });
            }
        },

        onSuggestionProcessingStart: () => { setIsProcessing(true); setIsExpanded(true); },
        onSuggestionGenerated: (d) => { setIsProcessing(false); addSys(d.suggestion); },
        onSuggestionError: (e) => fail(`Error: ${e.error}`),
        onIntelligenceManualResult: (d) => fail(`🎯 **Answer:**\n\n${d.answer}`),
        onIntelligenceError: (d) => fail(`❌ Error (${d.mode}): ${d.error}`),

        onIntelligenceSuggestedAnswerToken: (d) =>
            isScreenshotAnalysisRef.current ? setScreenshotMessages(p => appendTo(p, 'what_to_answer', d.token)) : queueToken('what_to_answer', d.token),
        onIntelligenceSuggestedAnswer: (d) => {
            flushToken();
            setIsProcessing(false);
            const wasShot = isScreenshotAnalysisRef.current;
            isScreenshotAnalysisRef.current = false;
            (wasShot ? setScreenshotMessages : setMessages)(p => settle(p, 'what_to_answer', { text: d.answer }));
        },
        onIntelligenceNegotiationCoaching: (d) => {
            flushToken();
            setIsProcessing(false);
            setMessages(p => settle(p, 'what_to_answer', { text: '', isNegotiationCoaching: true, negotiationCoachingData: d.payload }));
        },
        onIntelligenceRefinedAnswerToken: (d) => queueToken(d.intent, d.token),
        onIntelligenceRefinedAnswer: finalize((d) => d.intent, (d) => d.answer),
        onIntelligenceRecapToken: (d) => queueToken('recap', d.token),
        onIntelligenceRecap: finalize('recap', (d) => d.summary),
        onIntelligenceFollowUpQuestionsToken: (d) => queueToken('follow_up_questions', d.token),
        onIntelligenceFollowUpQuestionsUpdate: finalize('follow_up_questions', (d) => d.questions),
        onIntelligenceClarifyToken: (d) => queueToken('clarify', d.token),
        onIntelligenceClarify: finalize('clarify', (d) => d.clarification),

        onGeminiStreamToken: (t: string) => streamChunk(t, x => x.includes('```') || x.includes('def ') || x.includes('function ')),
        onGeminiStreamDone: () => {
            const latency = requestStartTimeRef.current ? Date.now() - requestStartTimeRef.current : 0;
            analytics.trackModelUsed({ model_name: currentModelRef.current, provider_type: detectProviderType(currentModelRef.current), latency_ms: latency });
            endStream();
        },
        onGeminiStreamError: (e: any) => endStream(`\n\n[Error: ${e}]`, `❌ Error: ${e}`),
        onRAGStreamChunk: (d) => streamChunk(d.chunk, x => x.includes('```')),
        onRAGStreamComplete: () => endStream(),
        onRAGStreamError: (d) => endStream(`\n\n[RAG Error: ${d.error}]`),

        onVisionAnalysisStatus: (d) => {
            setVisionStatus(d);
            if (d.status === 'error' || d.status === 'complete') setTimeout(() => setVisionStatus(null), 3000);
        },
        onVisionPipelineResult: (d) => {
            setVisionStatus(null);
            setActiveThread('screenshot');
            if (d.error) { setScreenshotMessages(p => [...p, mk(`Vision pipeline error: ${d.error}`)]); return; }
            const r = d.router;
            let t = `**${r.summary}**\n\n`;
            if (r.explanation) t += `${r.explanation}\n\n`;
            if (r.approach?.length) t += `**Approach:**\n${r.approach.map((a: string, i: number) => `${i + 1}. ${a}`).join('\n')}\n\n`;
            if (r.edgeCases?.length) t += `**Edge Cases:**\n${r.edgeCases.map((e: string) => `- ${e}`).join('\n')}\n\n`;
            for (const [k, lang] of [['java', 'java'], ['javascript', 'javascript'], ['reactjs', 'jsx'], ['html', 'html'], ['css', 'css'], ['mysql', 'sql']])
                if (r.code?.[k]) t += `\`\`\`${lang}\n${r.code[k]}\n\`\`\`\n\n`;
            if (d.screenshotPath && d.preview) {
                const a = { path: d.screenshotPath, preview: d.preview };
                setAttachedContext(p => (p.some(s => s.path === a.path) ? p : [...p, a].slice(-5)));
                pendingCaptureRef.current = a;
            }
            setScreenshotMessages(p => [...p,
                mk(`🔍 Screenshot analyzed (${d.pipeline?.semanticContext?.contextType || 'unknown'})`, { role: 'user', hasScreenshot: true, screenshotPreview: d.preview }),
                mk(t, {
                    isCode: t.includes('```'),
                    visionPipelineResult: { type: r.type, summary: r.summary, explanation: r.explanation, approach: r.approach, edgeCases: r.edgeCases, code: r.code },
                })]);
        },
        onScreenshotTaken: (d) => H.current.attach(d),
        onScreenshotAttached: (d) => H.current.attach(d),
        onCaptureAndProcess: (d) => H.current.attach(d),

        onLiveInterviewStarted: () => { setLiveInterviewActive(true); setLiveTranscripts([]); setLiveTechnicalQA([]); setLiveCodeAnalysis([]); setLiveError(null); },
        onLiveInterviewStopped: () => setLiveInterviewActive(false),
        onLiveInterviewTranscript: (d) => setLiveTranscripts(p => [...p, { speaker: d.speaker, text: d.text, timestamp: Date.now() }]),
        onLiveInterviewCodeAnalysis: (d) => setLiveCodeAnalysis(p => [...p, { ...d, timestamp: Date.now() }]),
        onLiveInterviewPerformanceAlert: (d) => {
            if (/Python not found|not installed|not found|Failed to start|sounddevice|numpy/i.test(d.message)) setLiveError(d.message);
            setLivePerformanceAlert({ type: d.cpuPercent > 80 ? 'critical' : d.cpuPercent > 50 ? 'warning' : 'info', message: d.message, timestamp: Date.now() });
            setPerformanceAlertVisible(true);
            if (perfTimerRef.current) clearTimeout(perfTimerRef.current);
            perfTimerRef.current = setTimeout(() => setPerformanceAlertVisible(false), 5000);
        },
        onLiveInterviewTechnicalQuestion: (d) => setLiveTechnicalQA(p => {
            const ex = p.find(q => q.question === d.text);
            if (!ex) return [...p, { question: d.text, answer: d.answer, isTechnical: d.isTechnical, timestamp: d.timestamp }];
            return d.answer && d.answer !== ex.answer ? p.map(q => (q.question === d.text ? { ...q, answer: d.answer } : q)) : p;
        }),

        onGlobalShortcut: ({ action }) => {
            const h = H.current;
            isStealthRef.current = true;
            const acts: Record<string, () => void> = {
                whatToAnswer: () => h.handleWhatToSay(), processScreenshots: () => h.handleWhatToSay(),
                shorten: () => h.handleFollowUp('shorten'), followUp: () => h.handleFollowUpQuestions(), recap: () => h.handleRecap(),
                dynamicAction4: () => (actionModeRef.current === 'brainstorm' ? h.handleBrainstorm() : h.handleRecap()),
                clarify: () => h.handleClarify(), codeHint: () => h.handleCodeHint(), brainstorm: () => h.handleBrainstorm(),
                scrollUp: () => inertialRef.current?.kick('vert', -1), scrollDown: () => inertialRef.current?.kick('vert', 1),
                scrollLeft: () => inertialRef.current?.kick('horiz', -1), scrollRight: () => inertialRef.current?.kick('horiz', 1),
                focusInput: () => { setIsExpanded(true); requestAnimationFrame(() => requestAnimationFrame(() => textInputRef.current?.focus())); },
                resetCancel: () => h.resetCancel(), takeScreenshot: () => h.takeScreenshot(), selectiveScreenshot: () => h.selectiveScreenshot(),
            };
            acts[action]?.();
            setTimeout(() => { isStealthRef.current = false; }, 500);
        },

        onStealthTapState: ({ active, reason }) => {
            stealthTapActiveRef.current = active;
            if (active) { isStealthRef.current = true; setIsExpanded(true); setStealthPermissionMissing(false); escSuppressRef.current = false; }
            if (!active && reason === 'permission') setStealthPermissionMissing(true);
        },
        onStealthKeyCaptured: (ev) => {
            if (ev.isKeyDown && ev.keyCode === 53) { setInputValue(''); escSuppressRef.current = true; return; }
            if (escSuppressRef.current && stealthTapActiveRef.current) {
                console.warn('[stealth] cross-channel race resolved by ref check — captured-key arrived before state event');
                escSuppressRef.current = false;
            }
            if (escSuppressRef.current || !stealthTapActiveRef.current || !ev.isKeyDown) return;
            if (ev.keyCode === 36 || ev.keyCode === 76) { handleManualSubmitRef.current(); api.stealthTapStop?.()?.catch(() => { }); return; }
            if (ev.keyCode === 51) { setInputValue(p => p.slice(0, -1)); return; }
            if (ev.chars && !['\r', '\n', '\t'].includes(ev.chars)) setInputValue(p => p + ev.chars);
        },
        onKeybindRegistrationFailed: ({ id, accelerator }) => { if (id === 'chat:focusInput') setStealthHotkeyConflict(accelerator); },
    });

    /* ───────────── mouse / keyboard / inertial scroll ───────────── */

    useEffect(() => {
        api.stealthTapShouldAutoEngage?.()?.then((ok: boolean) => { stealthAutoEngageOkRef.current = !!ok; }).catch(() => { });
        const onMouseDown = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null;
            if (!t?.closest?.('[data-model-selector-toggle="true"]')) api.modelSelectorCloseIfOpen?.()?.catch(() => { });
            if (api.stealthTapStart && !stealthTapActiveRef.current && stealthAutoEngageOkRef.current && t?.closest?.('[data-stealth-engage="true"]'))
                api.stealthTapStart().catch(() => { });
        };
        document.addEventListener('mousedown', onMouseDown, true);
        return () => document.removeEventListener('mousedown', onMouseDown, true);
    }, [api]);

    useEffect(() => {
        const TERM = 1400, ACC = 0.18, DECAY_K = Math.LN2 / 0.09, MIN = 6, MAX_DT = 0.05;
        let up = false, down = false, vel = 0, frac = 0, last = 0;
        let raf: number | null = null;
        const dir = () => (up === down ? 0 : up ? -1 : 1);

        const tick = (ts: number) => {
            const c = scrollContainerRef.current;
            if (!c) { raf = null; last = 0; return; }
            if (!last) last = ts;
            const dt = Math.min((ts - last) / 1000, MAX_DT);
            last = ts;
            const d = dir();
            if (d) {
                const target = d * TERM, step = (TERM / ACC) * dt;
                vel = Math.abs(target - vel) <= step ? target : vel + Math.sign(target - vel) * step;
            } else {
                vel *= Math.exp(-DECAY_K * dt);
                if (Math.abs(vel) < MIN) vel = 0;
            }
            const max = c.scrollHeight - c.clientHeight, cur = c.scrollTop;
            const move = vel * dt + frac, im = Math.trunc(move);
            frac = move - im;
            if (im) {
                let n = cur + im;
                if (n <= 0) { n = 0; if (vel < 0) { vel = 0; frac = 0; } }
                else if (n >= max) { n = max; if (vel > 0) { vel = 0; frac = 0; } }
                if (n !== cur) c.scrollTop = n;
            }
            if (d || vel) raf = requestAnimationFrame(tick);
            else { raf = null; last = 0; frac = 0; }
        };
        const start = () => { if (raf === null) raf = requestAnimationFrame(tick); };

        const onKeyDown = (e: KeyboardEvent) => {
            const p = (n: string) => (isPressedRef.current as any)(e, n);
            const h = H.current;
            const run = (f: () => void) => { e.preventDefault(); f(); };
            if (p('whatToAnswer')) run(() => h.handleWhatToSay());
            else if (p('clarify')) run(() => h.handleClarify());
            else if (p('followUp')) run(() => h.handleFollowUpQuestions());
            else if (p('dynamicAction4')) run(() => (actionModeRef.current === 'brainstorm' ? h.handleBrainstorm() : h.handleRecap()));
            else if (p('codeHint')) run(() => h.handleCodeHint());
            else if (p('brainstorm')) run(() => h.handleBrainstorm());
            else if (p('scrollUp')) run(() => { up = true; start(); });
            else if (p('scrollDown')) run(() => { down = true; start(); });
            else if (p('moveWindowUp') || p('moveWindowDown')) e.preventDefault();

            const t = e.target as HTMLElement;
            const isInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
            if (p('toggleVisibility')) run(() => api.toggleWindow?.());
            else if (p('processScreenshots')) { if (!isInput) run(() => h.handleWhatToSay()); }
            else if (p('resetCancel')) run(() => h.resetCancel());
            else if (p('takeScreenshot')) run(() => h.takeScreenshot());
            else if (p('selectiveScreenshot')) run(() => h.selectiveScreenshot());
            else if (p('captureAndProcess')) run(() => h.captureAndProcess());
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') up = false;
            else if (e.key === 'ArrowDown') down = false;
            else if (e.key === 'Meta' || e.key === 'Control') up = down = false;
        };
        const onBlur = () => { up = down = false; };
        const onCodingKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); H.current.handleCodingHelp(); }
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        document.addEventListener('keydown', onCodingKey, true);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('keydown', onCodingKey, true);
            if (raf !== null) cancelAnimationFrame(raf);
        };
    }, [api]);

    useEffect(() => {
        const KICK = 900, TERM = 3200, HALF = 0.16, MIN = 8, MAX_DT = 0.05;
        type Axis = { vel: number; target: HTMLElement | null; frac: number };
        const st = { raf: null as number | null, last: 0, vert: { vel: 0, target: null, frac: 0 } as Axis, horiz: { vel: 0, target: null, frac: 0 } as Axis };

        const horizTarget = (container: HTMLElement): HTMLElement | null => {
            const cr = container.getBoundingClientRect();
            const center = (cr.top + cr.bottom) / 2;
            let best: HTMLElement | null = null, bestD = Infinity;
            container.querySelectorAll('pre').forEach(pre => {
                let s: HTMLElement | null = pre as HTMLElement;
                while (s && s !== container && !(s.scrollWidth > s.clientWidth + 1)) s = s.parentElement;
                if (!s || s === container) return;
                const r = s.getBoundingClientRect();
                if (r.bottom < cr.top || r.top > cr.bottom) return;
                const d = Math.abs((r.top + r.bottom) / 2 - center);
                if (d < bestD) { bestD = d; best = s; }
            });
            return best;
        };

        const tick = (ts: number) => {
            if (!st.last) st.last = ts;
            const dt = Math.min((ts - st.last) / 1000, MAX_DT);
            st.last = ts;
            const decay = Math.pow(0.5, dt / HALF);
            const step = (axis: 'vert' | 'horiz') => {
                const a = st[axis];
                if (Math.abs(a.vel) < MIN || !a.target) { a.vel = 0; a.frac = 0; a.target = null; return false; }
                const move = a.vel * dt + a.frac, im = Math.trunc(move);
                a.frac = move - im;
                if (im) { if (axis === 'vert') a.target.scrollTop += im; else a.target.scrollLeft += im; }
                a.vel *= decay;
                return true;
            };
            const v = step('vert'), h = step('horiz');
            if (v || h) st.raf = requestAnimationFrame(tick);
            else { st.raf = null; st.last = 0; }
        };

        const kick = (axis: 'vert' | 'horiz', direction: -1 | 1) => {
            const c = scrollContainerRef.current;
            if (!c) return;
            const target = axis === 'vert' ? c : horizTarget(c);
            if (!target) return;
            const a = st[axis];
            if (a.target !== target || Math.sign(a.vel) === -direction) { a.vel = 0; a.frac = 0; }
            a.target = target;
            a.vel = Math.max(-TERM, Math.min(TERM, a.vel + direction * KICK));
            if (st.raf === null) st.raf = requestAnimationFrame(tick);
        };

        inertialRef.current = { kick };
        return () => { if (st.raf !== null) cancelAnimationFrame(st.raf); inertialRef.current = null; };
    }, []);

    /* ───────────── message rendering ───────────── */

    const renderMessageText = useCallback((msg: Message) => {
        const text = stripSystemInstructions(msg.text);
        const card = (head: React.ReactNode, body: React.ReactNode, bodyCls: string) => (
            <div className={`rounded-lg p-3 my-1 border ${SUBTLE}`} style={appearance.subtleStyle}>{head}<div className={bodyCls}>{body}</div></div>
        );
        const head = (cls: string, icon: React.ReactNode, label: string) => (
            <div className={`flex items-center gap-2 mb-2 font-semibold text-xs uppercase tracking-wide ${cls}`}>{icon}<span>{label}</span></div>
        );
        const markdown = (src: string, comps: any, key?: React.Key) => (
            <div key={key} className="markdown-content">
                <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={comps}>{src}</ReactMarkdown>
            </div>
        );
        const parts = (src: string, comps: any) => src.split(/(```[\s\S]*?(?:```|$))/g).map((part, i) => {
            if (!part.startsWith('```')) return markdown(part, comps, i);
            const m = part.match(/```(\w*)\s+([\s\S]*?)(?:```|$)/);
            const code = (m?.[2] || part.replace(/^```\w*\s*/, '').replace(/```$/, '')).trim();
            return <HighlightedCode key={i} code={code} lang={m?.[1] || 'python'} theme={codeTheme} lineColor={codeLineNumberColor} appearance={appearance} />;
        });

        if (msg.isStreaming) {
            return card(null, <pre className="text-[14px] leading-relaxed whitespace-pre-wrap overlay-text-primary m-0 font-sans">{text}</pre>, '');
        }
        if (msg.isNegotiationCoaching && msg.negotiationCoachingData) {
            return (
                <NegotiationCoachingCard
                    {...msg.negotiationCoachingData}
                    phase={msg.negotiationCoachingData.phase as any}
                    onSilenceTimerEnd={() => setMessages(p => p.map(m => (m.id === msg.id
                        ? { ...m, negotiationCoachingData: m.negotiationCoachingData ? { ...m.negotiationCoachingData, showSilenceTimer: false } : undefined }
                        : m)))}
                />
            );
        }
        if (msg.isCode || (msg.role === 'system' && text.includes('```'))) {
            return card(
                head(isLightTheme ? 'text-violet-600' : 'text-purple-300', <Code className="w-3.5 h-3.5"/>, 'Code Solution'),
                parts(text, md.codeText), `space-y-2 text-[13px] leading-relaxed ${slate}`);
        }
        const ic = msg.intent ? INTENT_CARDS[msg.intent] : undefined;
        if (ic) {
            return card(head(isLightTheme ? ic.light : ic.dark, ic.icon, ic.label), markdown(text, md[msg.intent!]), `text-[13px] leading-relaxed markdown-content ${slate}`);
        }
        if (msg.intent === 'what_to_answer') {
            return card(head('text-emerald-400', null, 'Say this'), parts(text, md.what_to_answer), 'text-[14px] leading-relaxed overlay-text-primary');
        }
        return markdown(text, md.standard);
    }, [isLightTheme, md, appearance, codeTheme, codeLineNumberColor, slate]);

    /* ───────────── render ───────────── */

    const badges: Array<{ on: boolean; label: string; cls: string; dot?: string; icon?: React.ReactNode }> = [
        { on: onlyInterviewerMode, label: 'Interviewer Only', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20', dot: 'bg-blue-400 animate-pulse' },
        { on: mockInterviewMode, label: 'Mock Interview', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20', dot: 'bg-purple-400 animate-pulse' },
        { on: noiseCancellationEnabled, label: 'Noise Cancel', cls: 'bg-green-500/15 text-green-400 border-green-500/20', dot: 'bg-green-400' },
        { on: screenContextStatus === 'available', label: 'Screen', cls: 'bg-violet-500/15 text-violet-400 border-violet-500/20', icon: <Monitor size={10}/> },
        { on: screenContextStatus === 'failed', label: 'Screen Error', cls: 'bg-red-500/15 text-red-400 border-red-500/20', icon: <AlertCircle size={10}/> },
    ];

    const vision = (() => {
        const failed = screenContextStatus === 'failed' || !!latestVisionFailureReason;
        const ok = (latestUsedImageInput || screenContextStatus === 'available') && !failed;
        const reason = latestVisionFailureReason;
        const failLabel = (reason && VISION_FAIL_LABELS[reason]) || 'Vision failed';
        const failTitle = reason ? VISION_FAIL_TITLES[reason] || 'The vision provider failed for this turn.' : 'Screen vision did not return a result for this turn.';
        const provLabel = latestVisionProviderUsed ? `Vision: ${latestVisionProviderUsed}` : 'Vision input used';
        const provTitle = latestVisionProviderUsed && latestVisionModelUsed
            ? `Latest answer used ${latestVisionProviderUsed} (${latestVisionModelUsed}) vision on the screenshot`
            : latestVisionProviderUsed ? `Latest answer used ${latestVisionProviderUsed} vision on the screenshot`
                : 'The latest answer received direct image input from the attached screen';
        const n = attachedContext.length;
        return {
            cls: failed ? getStatusToneClass('warn') : ok ? getStatusToneClass('ok') : 'overlay-text-primary',
            title: n ? 'Attached screenshots will be sent to the vision provider when you send this turn' : failed ? failTitle : ok ? provTitle : 'No screen context attached',
            label: n ? `${n} screen attached` : failed ? failLabel : ok ? provLabel : 'No screen context',
        };
    })();

    const quickActions: Array<[React.ElementType, string, () => void]> = [
        [Pencil, 'What to answer?', () => handleWhatToSay()],
        [MessageSquare, 'Clarify', handleClarify],
        actionButtonMode === 'brainstorm' ? [Lightbulb, 'Brainstorm', handleBrainstorm] : [RefreshCw, 'Recap', handleRecap],
        [HelpCircle, 'Follow Up Question', () => handleFollowUp('answer_predicted_question')],
        [Code, 'Code', handleCodingHelp],
        [Trash2, 'Clear', handleClear],
    ];

    const popupY = (e: React.MouseEvent<HTMLElement>, offset: number) => {
        const r = e.currentTarget.getBoundingClientRect();
        return { x: window.screenX + r.left, y: window.screenY + r.top - offset - 8 };
    };

    const showTranscriptPanel = (showTranscript && Boolean(rollingTranscript)) || stt.interviewer.status !== 'connected' || stt.user.status !== 'connected';
    const visibleMessages = activeThread === 'screenshot' ? screenshotMessages : messages;
    const canSend = !!inputValue.trim();

    return (
        <div
            ref={contentRef}
            data-interface-theme={isGlassTheme ? 'liquid-glass' : undefined}
            className="flex flex-col items-center w-fit mx-auto h-fit min-h-0 bg-transparent p-0 rounded-[24px] font-sans gap-2 overlay-text-primary"
            style={{ display: 'flex', flexDirection: 'column', maxHeight: maxAllowedHeight }}
        >
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="flex flex-col items-center gap-2 w-full h-full min-h-0"
                    >
                        <div className="flex items-center w-full justify-between" style={{ WebkitAppRegion: 'drag' } as any}>
                            <div style={{ WebkitAppRegion: 'no-drag' } as any}><WindowControls/></div>
                            <div style={{ WebkitAppRegion: 'no-drag' } as any}>
                                <TopPill
                                    expanded={isExpanded}
                                    onToggle={() => setIsExpanded(!isExpanded)}
                                    onQuit={() => (onEndMeeting ? onEndMeeting() : api.quitApp?.())}
                                    appearance={appearance}
                                    onLogoClick={() => api.setWindowMode?.('launcher')}
                                />
                            </div>
                            <div className="w-[138px]" />
                        </div>

                        <div className="flex items-center gap-2 w-[600px] justify-center">
                            {badges.filter(b => b.on).map(b => (
                                <span key={b.label} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ${b.cls}`}>
                                    {b.icon ?? <span className={`w-1.5 h-1.5 rounded-full ${b.dot}`} />}
                                    {b.label}
                                </span>
                            ))}
                        </div>

                        <motion.div
                            ref={shellRef}
                            className="relative max-w-full backdrop-blur-2xl border rounded-[24px] flex flex-col draggable-area overlay-shell-surface overlay-text-primary"
                            style={{ ...appearance.shellStyle, width: shellWidth, minHeight: '400px', flex: 1, height: '100%', overflow: 'hidden', resize: 'both', contain: 'layout paint' }}
                        >
                            {isGlassTheme && <GlassEffectLayer cornerRadius={24} parentRef={shellRef}/>}

                            <motion.div
                                ref={scrollContainerRef}
                                onScroll={handleScroll}
                                className="min-h-0 no-drag pb-4"
                                style={{ flex: '1 1 auto', overflowY: 'auto', scrollbarWidth: 'none', maxHeight: shellMaxH }}
                            >
                                <div className="relative flex flex-wrap items-center justify-center gap-1.5 px-4 pt-3 pb-1 no-drag">
                                    <div className={`${statusPill} overlay-text-primary`} title={activeModeLabel ? `Active mode: ${activeModeLabel}` : 'No active mode selected'}>
                                        <LayoutGrid className="h-3 w-3 opacity-70"/>
                                        <span>{activeModeLabel ? `Mode: ${activeModeLabel}` : 'General mode'}</span>
                                    </div>
                                    <div className={`${statusPill} ${getStatusToneClass(sttSummary.tone)}`} title={sttSummary.detail}>
                                        <Mic className="h-3 w-3 opacity-70"/><span>{sttSummary.label}</span>
                                    </div>
                                    <div className={`${statusPill} ${vision.cls}`} title={vision.title}>
                                        <Monitor className="h-3 w-3 opacity-70"/><span>{vision.label}</span>
                                    </div>
                                    <div className={`${statusPill} overlay-text-primary`} title={`${llmPrivacyLabel}: ${llmProviderLabel}`}>
                                        <ShieldCheck className="h-3 w-3 opacity-70"/><span>{llmPrivacyLabel}</span>
                                    </div>
                                </div>

                                <DynamicActionBar onAcceptAction={(action: DynamicActionPayload) => { void handleWhatToSay(action.promptInstruction); }} />

                                {showTranscriptPanel ? (
                                    <RollingTranscript
                                        text={showTranscript ? rollingTranscript : ''}
                                        isActive={isInterviewerSpeaking}
                                        surfaceStyle={showTranscript ? appearance.transcriptStyle : undefined}
                                        interviewerChannel={{ status: stt.interviewer.status, provider: stt.interviewer.provider, error: interviewerErr }}
                                        microphoneChannel={{ status: stt.user.status, provider: stt.user.provider, error: stt.user.error }}
                                        onCopyDiagnostics={copyDiagnostics}
                                    />
                                ) : null}

                                {(messages.length > 0 || screenshotMessages.length > 0 || isProcessing) && (
                                    <motion.div className="p-4 space-y-3 no-drag">
                                        <div className="flex items-center gap-1 px-1 py-1 mb-2 bg-white/5 rounded-lg w-fit">
                                            {([['chat', 'Meeting Chat'], ['screenshot', 'Screenshot Analysis']] as const).map(([k, label]) => (
                                                <button
                                                    key={k} onClick={() => setActiveThread(k)}
                                                    className={`flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${activeThread === k ? 'bg-white/10 text-white shadow-sm' : 'text-white/50 hover:text-white/80'}`}
                                                >
                                                    {k === 'screenshot' && <Camera className="w-3 h-3"/>}
                                                    {label}
                                                    {k === 'screenshot' && screenshotMessages.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                                                </button>
                                            ))}
                                        </div>

                                        {activeThread === 'screenshot' && visionStatus && (
                                            <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300">
                                                {['processing', 'analyzing', 'vision', 'generating'].includes(visionStatus.status)
                                                    ? <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                                                    : visionStatus.status === 'complete' ? <Check className="w-3 h-3 text-emerald-400"/> : <Zap className="w-3 h-3 text-amber-400"/>}
                                                <span>{visionStatus.detail || visionStatus.status}</span>
                                            </div>
                                        )}

                                        {visibleMessages.map(msg => (
                                            <MessageRow
                                                key={msg.id}
                                                msg={msg}
                                                isLightTheme={isLightTheme}
                                                appearance={appearance}
                                                onCopy={handleCopy}
                                                renderMessageText={renderMessageText}
                                            />
                                        ))}

                                        {isProcessing && (
                                            <div className="flex justify-start">
                                                <div className="px-3 py-2 overlay-subtle-surface rounded-full border" style={appearance.subtleStyle}>
                                                    <span className="text-[12px] overlay-text-muted">Generating...</span>
                                                </div>
                                            </div>
                                        )}
                                        <div ref={messagesEndRef} />
                                    </motion.div>
                                )}

                                {liveInterviewActive && (
                                    <div className="px-3 w-full max-w-full" data-stealth-ignore="true">
                                        <div className={`rounded-xl border overflow-hidden ${SUBTLE}`} style={appearance.subtleStyle}>
                                            <div className="flex items-center justify-between px-3 py-2 border-b" style={appearance.codeHeaderStyle}>
                                                <span className="text-[10px] uppercase tracking-widest font-semibold font-mono overlay-text-muted flex items-center gap-1.5">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                                    Live Interview
                                                    {liveTechnicalQA.length > 0 && <span className="text-[10px] overlay-text-muted font-normal normal-case">· {liveTechnicalQA.length} answered</span>}
                                                </span>
                                                <button onClick={() => api.stopLiveInterview?.()} className="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 transition-colors text-[10px] font-medium overlay-text-primary">Stop</button>
                                            </div>

                                            {liveError && (
                                                <div className="mx-3 mt-2 px-3 py-2 rounded-lg border border-rose-500/40 bg-rose-500/15 text-[11px]">
                                                    <div className="flex items-start gap-2">
                                                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400"/>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-rose-300 mb-1">Live Interview Setup Error</p>
                                                            <p className="text-rose-400/80 leading-relaxed">{liveError}</p>
                                                            <p className="text-rose-400/60 mt-1">Restart the live interview after fixing the issue.</p>
                                                        </div>
                                                        <button onClick={() => setLiveError(null)} className="shrink-0 hover:opacity-70 text-rose-400/60"><X className="w-3 h-3"/></button>
                                                    </div>
                                                </div>
                                            )}

                                            {performanceAlertVisible && livePerformanceAlert && (
                                                <DismissibleAlert
                                                    onClose={() => setPerformanceAlertVisible(false)}
                                                    cls={livePerformanceAlert.type === 'critical' ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                                        : livePerformanceAlert.type === 'warning' ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                                                            : 'bg-blue-500/10 border-blue-500/20 text-blue-300'}
                                                >
                                                    <Zap className="w-3.5 h-3.5 shrink-0"/>
                                                    <span className="flex-1">{livePerformanceAlert.message}</span>
                                                </DismissibleAlert>
                                            )}

                                            {liveTechnicalQA.length > 0 && (
                                                <div className="max-h-[280px] overflow-y-auto px-3 py-2 space-y-2">
                                                    {liveTechnicalQA.map((qa, i) => (
                                                        <div key={i} className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-2.5">
                                                            <div className="flex items-start gap-2 mb-1.5">
                                                                <span className="w-4 h-4 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                                                                </span>
                                                                <span className="text-[12px] font-medium overlay-text-primary leading-relaxed">{qa.question}</span>
                                                            </div>
                                                            {qa.answer ? (
                                                                <div className="ml-6 text-[11px] overlay-text-secondary leading-relaxed whitespace-pre-wrap border-l-2 border-violet-500/20 pl-2.5">
                                                                    <ReactMarkdown components={md.standard} rehypePlugins={REHYPE_PLUGINS} remarkPlugins={REMARK_PLUGINS}>{qa.answer}</ReactMarkdown>
                                                                </div>
                                                            ) : (
                                                                <div className="ml-6 flex items-center gap-1.5 text-[10px] overlay-text-muted">
                                                                    <span className="w-1 h-1 bg-violet-400 rounded-full animate-pulse" />Generating answer...
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {liveTranscripts.length > 0 && (
                                                <div className="max-h-[120px] overflow-y-auto px-3 py-2 space-y-1 border-t" style={appearance.dividerStyle}>
                                                    <span className="text-[9px] uppercase tracking-wider font-semibold overlay-text-muted block mb-1">Raw Transcript</span>
                                                    {liveTranscripts.map((t, i) => (
                                                        <div key={i} className="text-[11px] leading-relaxed">
                                                            <span className={`font-semibold ${t.speaker === 'interviewer' ? 'text-violet-400' : t.speaker === 'user' ? 'text-emerald-400' : 'overlay-text-muted'}`}>
                                                                {t.speaker === 'interviewer' ? 'Interviewer' : t.speaker === 'user' ? 'You' : t.speaker}:
                                                            </span>
                                                            <span className="overlay-text-muted ml-1">{t.text}</span>
                                                        </div>
                                                    ))}
                                                    <div ref={liveTranscriptsEndRef} />
                                                </div>
                                            )}

                                            {liveCodeAnalysis.length > 0 && (
                                                <div className="px-3 pb-2 space-y-2 max-h-[250px] overflow-y-auto">
                                                    {liveCodeAnalysis.map((a, i) => (
                                                        <div key={i} className={`rounded-lg border p-2.5 ${SUBTLE}`} style={appearance.subtleStyle}>
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <span className="text-[10px] uppercase tracking-wider font-semibold font-mono overlay-text-muted">{a.language} · Analysis</span>
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-mono">{a.complexity?.timeComplexity}</span>
                                                            </div>
                                                            <p className="text-[12px] overlay-text-primary leading-relaxed mb-1.5 whitespace-pre-wrap">{a.explanation}</p>
                                                            {a.complexity?.explanation && (
                                                                <p className="text-[11px] overlay-text-muted italic">Space: {a.complexity.spaceComplexity} · {a.complexity.explanation}</p>
                                                            )}
                                                            {a.executionResult && (
                                                                <div className="mt-1.5 pt-1.5 border-t" style={appearance.dividerStyle}>
                                                                    <span className="text-[10px] font-mono overlay-text-muted">Exit: {a.executionResult.exitCode}</span>
                                                                    {a.executionResult.stdout && <pre className="text-[11px] font-mono overlay-text-muted mt-1 whitespace-pre-wrap max-h-[80px] overflow-y-auto">{a.executionResult.stdout}</pre>}
                                                                    {a.executionResult.stderr && <pre className="text-[11px] font-mono text-rose-400 mt-1 whitespace-pre-wrap max-h-[80px] overflow-y-auto">{a.executionResult.stderr}</pre>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {!liveTranscripts.length && !liveCodeAnalysis.length && !liveTechnicalQA.length && (
                                                <div className="px-3 py-6 text-center">
                                                    <div className="w-5 h-5 mx-auto mb-2 overlay-text-muted opacity-30">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500/60 animate-pulse mx-auto" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </motion.div>

                            <div className="relative z-20 pointer-events-auto" style={{ flex: '0 0 auto' }}>
                                {systemAudioWarning && (
                                    <Banner
                                        c={BANNER.yellow}
                                        title="Screen Recording Permission Denied"
                                        body={systemAudioWarning}
                                        path={WARN_PATH}
                                        onBtn={() => api.openExternal?.('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')}
                                        onClose={() => setSystemAudioWarning(null)}
                                    />
                                )}
                                {sttNotConfigured && (
                                    <Banner
                                        c={BANNER.orange}
                                        title="Transcription Not Configured"
                                        body="No STT provider selected. Open Settings → Audio to pick one."
                                        path={MIC_PATH}
                                        onBtn={() => api.toggleSettingsWindow?.()}
                                        onClose={() => setSttNotConfigured(false)}
                                    />
                                )}
                            </div>

                            <div className="relative z-40 pointer-events-auto" style={{ flexShrink: 0, margin: 0, WebkitAppRegion: 'no-drag' } as any}>
                                <ErrorBoundary context="QuickActions">
                                    <div className={`flex flex-wrap justify-center items-center gap-1.5 px-4 pb-3 ${rollingTranscript && showTranscript ? 'pt-1' : 'pt-3'}`}>
                                        {quickActions.map(([Icon, label, onClick]) => (
                                            <button key={label} onClick={onClick} className={chip} style={appearance.chipStyle}>
                                                <Icon className="w-3 h-3 opacity-70"/> {label}
                                            </button>
                                        ))}
                                    </div>
                                </ErrorBoundary>

                                <ErrorBoundary context="OverlayInput">
                                    <div className="p-3 pt-0 sticky bottom-0 z-10" style={{ background: appearance.shellStyle.backgroundColor, WebkitAppRegion: 'no-drag' } as any}>
                                        {attachedContext.length > 0 && (
                                            <>
                                                <div className={`mb-2 rounded-lg p-2 transition-all duration-200 border ${SUBTLE}`} style={appearance.subtleStyle}>
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[11px] font-medium overlay-text-primary">
                                                            {attachedContext.length} screenshot{attachedContext.length > 1 ? 's' : ''} attached
                                                        </span>
                                                        <button
                                                            onClick={() => setAttachedContext([])} title="Remove all" style={appearance.iconStyle}
                                                            className="p-1 rounded-full transition-colors overlay-icon-surface overlay-icon-surface-hover overlay-text-interactive"
                                                        >
                                                            <X className="w-3.5 h-3.5"/>
                                                        </button>
                                                    </div>
                                                    <div className="flex gap-1.5 overflow-x-auto max-w-full pb-1">
                                                        {attachedContext.map((ctx, idx) => (
                                                            <div key={ctx.path} className="relative group/thumb flex-shrink-0">
                                                                <img src={ctx.preview} alt={`Screenshot ${idx + 1}`} className={`h-10 w-auto rounded border ${isLightTheme ? 'border-black/15' : 'border-white/20'}`} />
                                                                <button
                                                                    onClick={() => setAttachedContext(p => p.filter((_, i) => i !== idx))} title="Remove"
                                                                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                                                >
                                                                    <X className="w-2.5 h-2.5 text-white"/>
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <span className="text-[10px] overlay-text-muted">Ask a question or click Answer</span>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                                                    <span className="text-[10px] font-medium overlay-text-muted mr-0.5">Analyze as:</span>
                                                    {SCREENSHOT_ANALYSIS_MODES.map(m => (
                                                        <button
                                                            key={m} onClick={() => setScreenshotAnalysisMode(m)}
                                                            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all duration-150 ${screenshotAnalysisMode === m ? 'bg-[#007AFF] text-white shadow-sm' : 'overlay-icon-surface overlay-text-interactive hover:opacity-80'}`}
                                                            style={screenshotAnalysisMode === m ? undefined : appearance.iconStyle}
                                                        >
                                                            {MODE_LABELS[m]}
                                                        </button>
                                                    ))}
                                                    {screenshotAnalysisMode === 'dsa' && (
                                                        <select
                                                            value={dsaLanguage} onChange={(e) => setDsaLanguage(e.target.value)} style={appearance.iconStyle}
                                                            className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium overlay-icon-surface overlay-text-interactive border-0 outline-none cursor-pointer"
                                                        >
                                                            {DSA_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                                                        </select>
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        {stealthHotkeyConflict && (
                                            <Notice
                                                box="border-rose-400/40 bg-rose-500/10"
                                                btn="bg-rose-500/20 hover:bg-rose-500/30"
                                                btnLabel="Rebind"
                                                onBtn={() => api.openSettingsTab?.('keybinds')}
                                                onClose={() => setStealthHotkeyConflict(null)}
                                            >
                                                Stealth typing hotkey <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[10px]">{stealthHotkeyConflict}</kbd> is already in use. Click the input to activate, or rebind in Settings.
                                            </Notice>
                                        )}
                                        {stealthPermissionMissing && (
                                            <Notice
                                                box="border-amber-400/40 bg-amber-500/10"
                                                btn="bg-amber-500/20 hover:bg-amber-500/30"
                                                btnLabel="Open Settings"
                                                onBtn={() => api.stealthTapOpenSettings?.()}
                                                onClose={() => setStealthPermissionMissing(false)}
                                            >
                                                Stealth typing needs Accessibility access. Grant it in System Settings, then restart Natively.
                                            </Notice>
                                        )}

                                        <div className="relative w-full no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                                            <input
                                                ref={textInputRef}
                                                type="text"
                                                value={inputValue}
                                                onChange={(e) => setInputValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key !== 'Enter') return;
                                                    if ((e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); handleCodingHelp(); }
                                                    else if (!e.shiftKey) { e.preventDefault(); handleManualSubmit(); }
                                                }}
                                                placeholder="Enter a technology or topic (e.g., Java 8 features)..."
                                                className={`w-full border focus:ring-1 rounded-xl pl-3 pr-10 py-2.5 focus:outline-none transition-all duration-200 ease-sculpted text-[13px] leading-relaxed no-drag cursor-text ${inputClass}`}
                                                style={{
                                                    ...appearance.inputStyle,
                                                    WebkitAppRegion: 'no-drag',
                                                    pointerEvents: 'auto',
                                                    userSelect: 'text',
                                                } as any}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between mt-3 px-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    data-model-selector-toggle="true"
                                                    onClick={(e) => { if (contentRef.current) api.toggleModelSelector?.(popupY(e, 200)); }}
                                                    className="flex items-center gap-2 px-3 py-1.5 border rounded-lg transition-colors text-xs font-medium w-[140px] interaction-base interaction-press cursor-pointer pointer-events-auto overlay-control-surface overlay-text-interactive"
                                                    style={appearance.controlStyle}
                                                >
                                                    <span className="truncate min-w-0 flex-1">{modelLabel(currentModel)}</span>
                                                    <ChevronDown className="shrink-0 transition-transform" size={14}/>
                                                </button>

                                                <div className="w-px h-3 mx-1" style={appearance.dividerStyle} />

                                                <button
                                                    onClick={(e) => {
                                                        if (isSettingsOpen) return api.toggleSettingsWindow?.();
                                                        if (contentRef.current) api.toggleSettingsWindow?.(popupY(e, 238));
                                                    }}
                                                    className={`w-7 h-7 flex items-center justify-center rounded-lg interaction-base interaction-press overlay-icon-surface overlay-icon-surface-hover ${isSettingsOpen ? 'overlay-text-primary' : 'overlay-text-interactive'}`}
                                                    style={appearance.iconStyle}
                                                >
                                                    <SlidersHorizontal className="w-3.5 h-3.5"/>
                                                </button>
                                            </div>

                                            <button
                                                onClick={handleManualSubmit} disabled={!canSend}
                                                className={`w-7 h-7 rounded-full flex items-center justify-center interaction-base interaction-press ${canSend ? 'bg-[#007AFF] text-white shadow-lg shadow-blue-500/20 hover:bg-[#0071E3]' : 'overlay-icon-surface overlay-text-muted cursor-not-allowed'}`}
                                                style={canSend ? undefined : appearance.iconStyle}
                                            >
                                                <ArrowRight className="w-3.5 h-3.5"/>
                                            </button>
                                        </div>
                                    </div>
                                </ErrorBoundary>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NativelyInterface;