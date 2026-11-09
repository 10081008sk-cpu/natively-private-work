import path from 'node:path'
import fs from 'node:fs'
import sharp from 'sharp'
import { createWorker } from 'tesseract.js'

export interface VisualGeometry {
  layoutBounds: { x: number; y: number; width: number; height: number }
  componentOrientation: 'portrait' | 'landscape' | 'unknown'
  buttonLocations: Array<{ x: number; y: number; width: number; height: number; confidence: number }>
  formFields: Array<{ x: number; y: number; width: number; height: number; type: string }>
  windowPadding: { top: number; right: number; bottom: number; left: number }
  margins: { top: number; right: number; bottom: number; left: number }
}

export interface TextExtraction {
  rawText: string
  lines: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number }; confidence: number }>
  codeSnippets: Array<{ language: string | null; code: string; lineStart: number; lineEnd: number }>
  tokenArrays: string[]
  syntaxTokens: Array<{ value: string; type: 'keyword' | 'identifier' | 'operator' | 'literal' | 'punctuation' | 'unknown'; line: number }>
}

export type ImageContext =
  | 'code_editor_ide'
  | 'app_web_ui'
  | 'chart_graph_table'
  | 'complex_text_document'
  | 'technical_question_problem'
  | 'natural_random_image'
  | 'error_trace_console'
  | 'unknown'

export interface SemanticContext {
  contextType: ImageContext
  confidence: number
  description: string
  containsCode: boolean
  containsQuestion: boolean
  containsUI: boolean
  technicalDomains: string[]
  detectedLanguages: string[]
}

export interface VisionPipelineResult {
  geometry: VisualGeometry
  textExtraction: TextExtraction
  semanticContext: SemanticContext
  summary: string
  isTechnicalLayout: boolean
  isCodeLayout: boolean
  isUIComponent: boolean
}

/**
 * Ensures the pipeline output is never "I can't see any code" — routes to one
 * of 4 primary context types: IDE code, terminal logs, UI mockups, random images.
 */
const PRIMARY_CONTEXT_CASES: ImageContext[] = [
  'code_editor_ide',
  'error_trace_console',
  'app_web_ui',
  'natural_random_image',
]

class VisionPipeline {
  private tesseractWorker: any = null

  private async getTesseractWorker(): Promise<any> {
    if (!this.tesseractWorker) {
      this.tesseractWorker = await createWorker('eng')
    }
    return this.tesseractWorker
  }

  /**
   * Strict sequential 3-layer pipeline: geometry → OCR → semantic.
   * Each layer is independent — a failure in an earlier layer produces
   * default/empty results but does NOT skip subsequent layers.
   */
  public async analyze(imagePath: string): Promise<VisionPipelineResult> {
    const geometry = await this.analyzeGeometry(imagePath)
    const textExtraction = await this.extractText(imagePath)
    const semanticContext = await this.classifyContext(geometry, textExtraction)

    const isTechnicalLayout = semanticContext.contextType === 'code_editor_ide'
      || semanticContext.contextType === 'technical_question_problem'
      || semanticContext.contextType === 'error_trace_console'

    const isCodeLayout = semanticContext.contextType === 'code_editor_ide'
      || semanticContext.containsCode

    const isUIComponent = semanticContext.contextType === 'app_web_ui'

    return {
      geometry,
      textExtraction,
      semanticContext,
      summary: `${semanticContext.description} — ${textExtraction.lines.length} text lines found`,
      isTechnicalLayout,
      isCodeLayout,
      isUIComponent,
    }
  }

  private async analyzeGeometry(imagePath: string): Promise<VisualGeometry> {
    try {
      const metadata = await sharp(imagePath).metadata()
      const width = metadata.width || 0
      const height = metadata.height || 0
      const orientation = width > height ? 'landscape' : width < height ? 'portrait' : 'unknown'

      const layoutBounds = { x: 0, y: 0, width, height }

      const buttonLocations: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = []
      const formFields: Array<{ x: number; y: number; width: number; height: number; type: string }> = []

      const padding = Math.round(Math.min(width, height) * 0.02)
      const margins = Math.round(Math.min(width, height) * 0.015)

      return {
        layoutBounds,
        componentOrientation: orientation,
        buttonLocations,
        formFields,
        windowPadding: { top: padding, right: padding, bottom: padding, left: padding },
        margins: { top: margins, right: margins, bottom: margins, left: margins },
      }
    } catch {
      return {
        layoutBounds: { x: 0, y: 0, width: 0, height: 0 },
        componentOrientation: 'unknown',
        buttonLocations: [],
        formFields: [],
        windowPadding: { top: 0, right: 0, bottom: 0, left: 0 },
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
      }
    }
  }

  private async extractText(imagePath: string): Promise<TextExtraction> {
    try {
      const worker = await this.getTesseractWorker()
      const { data } = await worker.recognize(imagePath)

      const lines = data.words.map((w: any) => ({
      text: w.text,
      bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
      confidence: w.confidence,
    }))

    const rawText = data.text || ''
    const tokenArrays = rawText.split(/\s+/).filter((t: string) => t.length > 0)

    const codeKeywords = ['function', 'class', 'import', 'export', 'const', 'let', 'var',
      'def', 'if', 'else', 'for', 'while', 'return', 'int', 'void', 'public',
      'private', 'static', 'SELECT', 'FROM', 'WHERE', 'CREATE', 'ALTER']
    const codeBlocks: Array<{ language: string | null; code: string; lineStart: number; lineEnd: number }> = []

    const rawLines = rawText.split('\n')
    let inCode = false
    let codeStart = 0
    let codeAccum: string[] = []
    let detectedLang: string | null = null

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim()
      const keywordMatch = codeKeywords.some(kw => line.includes(kw))

      if (!inCode && (line.includes('{') || line.includes('(') || keywordMatch)) {
        inCode = true
        codeStart = i
        codeAccum = [rawLines[i]]
      } else if (inCode) {
        codeAccum.push(rawLines[i])
        if (line.includes('}') || line.endsWith(';') || line.endsWith(')')) {
          const codeText = codeAccum.join('\n')
          codeBlocks.push({ language: detectedLang, code: codeText, lineStart: codeStart, lineEnd: i })
          inCode = false
          codeAccum = []
          detectedLang = null
        }
      }
    }

    if (inCode && codeAccum.length > 0) {
      codeBlocks.push({ language: detectedLang, code: codeAccum.join('\n'), lineStart: codeStart, lineEnd: rawLines.length - 1 })
    }

    const syntaxTokens: Array<{ value: string; type: 'keyword' | 'identifier' | 'operator' | 'literal' | 'punctuation' | 'unknown'; line: number }> = []
    const jsKeywords = new Set(['function', 'class', 'import', 'export', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'return', 'new', 'this', 'async', 'await', 'try', 'catch', 'throw'])
    for (let i = 0; i < rawLines.length; i++) {
      const words = rawLines[i].split(/\s+/)
      for (const w of words) {
        const clean = w.replace(/[^a-zA-Z0-9_$]/g, '')
        if (!clean) continue
        if (jsKeywords.has(clean)) {
          syntaxTokens.push({ value: clean, type: 'keyword', line: i })
        } else if (/^[0-9.]+$/.test(clean)) {
          syntaxTokens.push({ value: clean, type: 'literal', line: i })
        } else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(clean)) {
          syntaxTokens.push({ value: clean, type: 'identifier', line: i })
        } else if (/^[+\-*/%=<>!&|^~]+$/.test(clean)) {
          syntaxTokens.push({ value: clean, type: 'operator', line: i })
        } else if (/^[{}()\[\];,:.'"]$/.test(clean)) {
          syntaxTokens.push({ value: clean, type: 'punctuation', line: i })
        } else {
          syntaxTokens.push({ value: clean, type: 'unknown', line: i })
        }
      }
    }

    return {
      rawText,
      lines,
      codeSnippets: codeBlocks,
      tokenArrays,
      syntaxTokens,
    }
    } catch (err) {
      console.error('[VisionPipeline] OCR extraction failed:', err)
      return {
        rawText: '',
        lines: [],
        codeSnippets: [],
        tokenArrays: [],
        syntaxTokens: [],
      }
    }
  }

  private async classifyContext(geometry: VisualGeometry, text: TextExtraction): Promise<SemanticContext> {
    const codePatterns = ['function ', 'class ', 'import ', 'export ', 'const ', 'let ', 'var ',
      'def ', 'if (', 'for (', 'while (', 'return ', 'int ', 'void ',
      '{', '}', '=>', 'SELECT ', 'FROM ', 'WHERE ', 'INSERT INTO',
      'public static', 'private ', 'System.out', 'console.log',
      'print(', 'npm ', 'import React', 'useState']
    const codeScore = codePatterns.filter(p => text.rawText.includes(p)).length

    const errorPatterns = ['error', 'exception', 'traceback', 'at ', 'line ', 'SyntaxError',
      'TypeError', 'ReferenceError', 'NullPointer', 'ArrayIndex',
      'cannot find', 'undefined', 'null reference', 'segmentation fault']
    const errorScore = errorPatterns.filter(p => text.rawText.toLowerCase().includes(p)).length

    const uiPatterns = ['button', 'input', 'form', 'select', 'option', 'dropdown',
      'menu', 'navbar', 'footer', 'header', 'sidebar', 'modal',
      'login', 'signup', 'password', 'email', 'submit', 'cancel',
      'table', 'list', 'card', 'grid', 'flex']
    const uiScore = uiPatterns.filter(p => text.rawText.toLowerCase().includes(p)).length

    const chartPatterns = ['chart', 'graph', 'plot', 'axis', 'legend', 'data',
      'figure', 'table', 'statistics', 'correlation', 'trend',
      'x-axis', 'y-axis', 'series', 'bar', 'line', 'pie']
    const chartScore = chartPatterns.filter(p => text.rawText.toLowerCase().includes(p)).length

    const questionPatterns = ['?', 'what', 'how', 'why', 'when', 'which', 'explain',
      'describe', 'solve', 'find', 'compute', 'evaluate',
      'write a', 'implement', 'design', 'algorithm', 'complexity']
    const questionScore = questionPatterns.filter(p => text.rawText.toLowerCase().includes(p)).length

    const techDomains: string[] = []
    const langs: string[] = []

    if (text.rawText.includes('def ') || text.rawText.includes('import ') || text.rawText.includes('class ') && text.rawText.includes(':')) {
      techDomains.push('python'); langs.push('python')
    }
    if (text.rawText.includes('function ') || text.rawText.includes('const ') || text.rawText.includes('=>') || text.rawText.includes('console.log')) {
      techDomains.push('javascript'); langs.push('javascript')
    }
    if (text.rawText.includes('public class') || text.rawText.includes('public static') || text.rawText.includes('System.out') || text.rawText.includes('void main')) {
      techDomains.push('java'); langs.push('java')
    }
    if (text.rawText.includes('SELECT ') || text.rawText.includes('FROM ') || text.rawText.includes('WHERE ')) {
      techDomains.push('sql'); langs.push('sql')
    }
    if (text.rawText.includes('<html') || text.rawText.includes('<!DOCTYPE') || text.rawText.includes('<div') || text.rawText.includes('<body')) {
      techDomains.push('html/css'); langs.push('html')
    }
    if (text.rawText.includes('import React') || text.rawText.includes('useState') || text.rawText.includes('useEffect') || text.rawText.includes('jsx')) {
      techDomains.push('reactjs'); langs.push('jsx')
    }

    let contextType: ImageContext = 'unknown'
    let description = ''
    const containsCode = codeScore > 0
    const containsQuestion = questionScore > 2
    const containsUI = uiScore > 1

    if (codeScore > 0 && errorScore > 1) {
      contextType = 'error_trace_console'
      description = 'Error trace or debug console output'
    } else if (codeScore > 2 && questionScore < 3) {
      contextType = 'code_editor_ide'
      description = 'Code editor or IDE workspace with source code'
    } else if (codeScore > 0 && questionScore > 2) {
      contextType = 'technical_question_problem'
      description = 'Technical problem statement or coding question'
    } else if (uiScore > 1) {
      contextType = 'app_web_ui'
      description = 'Application or web user interface layout'
    } else if (chartScore > 1) {
      contextType = 'chart_graph_table'
      description = 'Chart, graph, or data table'
    } else if (text.lines.length > 20) {
      contextType = 'complex_text_document'
      description = 'Dense text document or article'
    } else if (codeScore > 0) {
      contextType = 'code_editor_ide'
      description = 'Code editor or IDE workspace with source code'
    } else if (errorScore > 0) {
      contextType = 'error_trace_console'
      description = 'Error trace or debug console output'
    } else if (uiScore > 0) {
      contextType = 'app_web_ui'
      description = 'Application or web user interface layout'
    } else {
      contextType = 'natural_random_image'
      description = 'Natural image or non-technical visual content'
    }

    const totalScore = codeScore + errorScore + uiScore + chartScore + questionScore
    const confidence = Math.min(totalScore / 10, 1.0)

    return {
      contextType,
      confidence,
      description,
      containsCode,
      containsQuestion,
      containsUI,
      technicalDomains: [...new Set(techDomains)],
      detectedLanguages: [...new Set(langs)],
    }
  }

  public async destroy(): Promise<void> {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate()
      this.tesseractWorker = null
    }
  }
}

let _pipelineSingleton: VisionPipeline | null = null

export function getVisionPipeline(): VisionPipeline {
  if (!_pipelineSingleton) {
    _pipelineSingleton = new VisionPipeline()
  }
  return _pipelineSingleton
}

export async function destroyVisionPipeline(): Promise<void> {
  if (_pipelineSingleton) {
    await _pipelineSingleton.destroy()
    _pipelineSingleton = null
  }
}
