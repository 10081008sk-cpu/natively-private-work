import type { VisionPipelineResult, ImageContext } from './VisionPipeline'
import { LLMHelper } from '../LLMHelper'

export interface CodeGenerationOutput {
  java?: string
  javascript?: string
  reactjs?: string
  html?: string
  css?: string
  mysql?: string
}

export interface RouterResult {
  type: 'descriptive_summary' | 'technical_solution' | 'multi_language_code'
  summary: string
  explanation?: string
  approach?: string[]
  edgeCases?: string[]
  code?: CodeGenerationOutput
}

function buildContextualSummary(pipeline: VisionPipelineResult): string {
  const contextLabels: Record<ImageContext, string> = {
    code_editor_ide: 'the user is viewing a code editor or IDE',
    app_web_ui: 'the user is viewing an application or web UI',
    chart_graph_table: 'the user is viewing a chart, graph, or data table',
    complex_text_document: 'the user is viewing a dense text document',
    technical_question_problem: 'the user is viewing a technical question or problem statement',
    natural_random_image: 'the user is viewing a natural image or non-technical content',
    error_trace_console: 'the user is viewing an error trace or console output',
    unknown: '',
  }
  return contextLabels[pipeline.semanticContext.contextType] || ''
}

export async function routeScreenCapture(
  llmHelper: LLMHelper,
  pipelineResult: VisionPipelineResult,
  imagePaths: string[],
  activeProvider: string
): Promise<RouterResult> {
  const { semanticContext } = pipelineResult
  const contextSummary = buildContextualSummary(pipelineResult)

  switch (semanticContext.contextType) {
    // ── CASE D: Non-Technical / Random Images ──
    case 'natural_random_image': {
      const prompt = buildGeminiNaturalImagePrompt(pipelineResult)
      const response = await llmHelper.chatWithGemini(prompt, imagePaths)
      return {
        type: 'descriptive_summary',
        summary: response,
      }
    }

    // ── CASE A: Code Editors & IDEs (Development Workspaces) ──
    case 'technical_question_problem':
    case 'code_editor_ide': {
      const prompt = buildCodeAnalysisPrompt(pipelineResult, activeProvider)
      const response = await llmHelper.chatWithGemini(prompt, imagePaths)
      const fallbackCode = generateMultiLanguageCode(pipelineResult.textExtraction.rawText, semanticContext.detectedLanguages)
      const extractedCode = extractCodeBlocks(response)
      const code = { ...fallbackCode, ...extractedCode }

      const bullets = extractBulletPoints(response)
      return {
        type: 'multi_language_code',
        summary: `${contextSummary}. ${pipelineResult.summary}`,
        explanation: bullets.length > 0 ? bullets.join('\n') : undefined,
        approach: extractApproach(response),
        edgeCases: extractEdgeCases(response),
        code,
      }
    }

    // ── CASE B: Terminal Logs & Stack Traces ──
    case 'error_trace_console': {
      const prompt = buildTerminalLogPrompt(pipelineResult, activeProvider)
      const response = await llmHelper.chatWithGemini(prompt, imagePaths)
      const fallbackCode = generateMultiLanguageCode(pipelineResult.textExtraction.rawText, semanticContext.detectedLanguages)
      const extractedCode = extractCodeBlocks(response)
      const code = { ...fallbackCode, ...extractedCode }
      return {
        type: 'multi_language_code',
        summary: `${contextSummary}. ${pipelineResult.summary}`,
        explanation: response,
        approach: extractCausalSteps(response),
        edgeCases: extractEdgeCases(response),
        code: Object.keys(code).length > 0 ? code : undefined,
      }
    }

    // ── CASE C: App / Web UI Layouts ──
    case 'app_web_ui': {
      const prompt = buildUIAnalysisPrompt(pipelineResult, activeProvider)
      const response = await llmHelper.chatWithGemini(prompt, imagePaths)
      const fallbackCode = generateMultiLanguageCode(pipelineResult.textExtraction.rawText, semanticContext.detectedLanguages)
      const extractedCode = extractCodeBlocks(response)
      const code = { ...fallbackCode, ...extractedCode }
      return {
        type: 'multi_language_code',
        summary: `${contextSummary}. ${pipelineResult.summary}`,
        explanation: response,
        code,
      }
    }

    case 'chart_graph_table': {
      const prompt = buildChartAnalysisPrompt(pipelineResult, activeProvider)
      const response = await llmHelper.chatWithGemini(prompt, imagePaths)
      return {
        type: 'technical_solution',
        summary: `${contextSummary}. ${pipelineResult.summary}`,
        explanation: response,
      }
    }

    case 'complex_text_document': {
      const prompt = buildDocumentSummaryPrompt(pipelineResult, activeProvider)
      const response = await llmHelper.chatWithGemini(prompt, imagePaths)
      return {
        type: 'technical_solution',
        summary: `${contextSummary}. ${pipelineResult.summary}`,
        explanation: response,
      }
    }

    default: {
      const prompt = buildDefaultAnalysisPrompt(pipelineResult, activeProvider)
      const response = await llmHelper.chatWithGemini(prompt, imagePaths)
      const fallbackCode = generateMultiLanguageCode(pipelineResult.textExtraction.rawText, semanticContext.detectedLanguages)
      const extractedCode = extractCodeBlocks(response)
      const code = { ...fallbackCode, ...extractedCode }
      return {
        type: pipelineResult.isCodeLayout ? 'multi_language_code' : 'technical_solution',
        summary: `${contextSummary}. ${pipelineResult.summary}`,
        explanation: response,
        code: pipelineResult.isCodeLayout ? code : undefined,
      }
    }
  }
}

function buildGeminiNaturalImagePrompt(result: VisionPipelineResult): string {
  return `You are an image describer. Describe this image in detail — identify physical objects, colors, environmental components, and scene composition. Provide a clear, literal identification of what is shown.

Geometric bounds: ${JSON.stringify(result.geometry.layoutBounds)}
Orientation: ${result.geometry.componentOrientation}
Detected text: "${result.textExtraction.rawText.slice(0, 300)}"
`
}

function buildCodeAnalysisPrompt(result: VisionPipelineResult, provider: string): string {
  return `You are analyzing a screenshot of a code workspace or IDE. Execute deep logical debugging and raw syntax extraction.

Context: ${result.semanticContext.description}
Detected text: ${result.textExtraction.rawText}
Technical domains: ${result.semanticContext.technicalDomains.join(', ')}
Detected languages: ${result.semanticContext.detectedLanguages.join(', ')}

You must:
1. Explicitly isolate why a failure occurred — identify the root cause.
2. Give rapid syntax validation — flag any syntax errors, type mismatches, or logic bugs.
3. Suggest structural refactors — propose cleaner architecture where applicable.
4. Output side-by-side programmatic corrections with clean, copyable code blocks across: Java, JavaScript, ReactJS, HTML, CSS, and MySQL. Use standard markdown code blocks with correct language identifiers (java, javascript, jsx, html, css, sql).
5. Do NOT write placeholders or TODO comments. Write complete, functional code implementations for the solution.

Return a structured response with: approach, edge cases, and a detailed solution with code blocks.`
}

function buildTerminalLogPrompt(result: VisionPipelineResult, provider: string): string {
  return `You are analyzing a screenshot of a terminal, console, or system log output. Treat raw text dumps, console anomalies, and error stack screenshots as critical engineering data.

Detected log text:
${result.textExtraction.rawText}

You must:
1. Read the raw text dumps without demanding a code editor screenshot.
2. Explain what the error code or trace means step-by-step.
3. Outline common architectural pitfalls that cause this type of error.
4. Output the necessary code corrections or system commands to patch the issue. Use standard markdown code blocks with correct language identifiers (java, javascript, jsx, html, css, sql) for any code snippets.
5. Do NOT write placeholders or TODO comments. Write complete, functional code implementations for the solution.

Return a structured response with: error explanation, root cause analysis, and corrective code/commands.`
}

function buildUIAnalysisPrompt(result: VisionPipelineResult, provider: string): string {
  return `Analyze this application or web user interface screenshot.
Detected text: ${result.textExtraction.rawText}

${provider === 'gemini'
    ? 'Enforce deep visual component mapping: audit the UI, map navigation flows, identify form structures, and call out accessibility gaps.'
    : 'Detail the functional purpose of the UI: describe the underlying application state machine and produce clean starter logic or layout code.'}

Use standard markdown code blocks with correct language identifiers (java, javascript, jsx, html, css, sql) for any UI layout or component starter code. Do NOT write placeholders or TODO comments. Write complete, functional code implementations for the solution.

Return: UI component breakdown, navigation structure, and any detected patterns.`
}

function buildChartAnalysisPrompt(result: VisionPipelineResult, provider: string): string {
  return `Analyze this chart, graph, or data table screenshot.
Detected text: ${result.textExtraction.rawText}

${provider === 'gemini'
    ? 'Apply strict visual trend and pattern tracking: read legends/plots precisely and provide clean row/column data cross-referencing.'
    : 'Deliver a high-level summary of analytical takeaways: flag data anomalies and deduce the structural logic or calculation principles behind the numbers.'}

Return: key trends, data points, and interpretations.`
}

function buildDocumentSummaryPrompt(result: VisionPipelineResult, provider: string): string {
  return `Analyze this text document screenshot.
Detected text: ${result.textExtraction.rawText}
Lines detected: ${result.textExtraction.lines.length}

${provider === 'gemini'
    ? 'Process the full document without truncation. Create a comprehensive structural data outline.'
    : 'Apply beautiful markdown formatting. Prioritize concise conceptual summaries and actionable points.'}

Return: document outline, key concepts, and actionable takeaways.`
}

function buildDefaultAnalysisPrompt(result: VisionPipelineResult, provider: string): string {
  return `Analyze this screenshot comprehensively.
Context: ${result.semanticContext.description}
Detected text: ${result.textExtraction.rawText}
Contains code: ${result.isCodeLayout}

Provide a detailed analysis with explanations, code if applicable, and actionable insights. Use standard markdown code blocks with correct language identifiers (java, javascript, jsx, html, css, sql). Do NOT write placeholders or TODO comments. Write complete, functional code implementations for the solution.`
}

function extractCodeBlocks(text: string): CodeGenerationOutput {
  const code: CodeGenerationOutput = {}
  
  // Match markdown code blocks: ```lang\ncode\n```
  // Regex matches ``` followed by language name, then everything up to the next ```
  const regex = /```(java|javascript|js|jsx|react|reactjs|html|css|sql|mysql)?\s*\n([\s\S]*?)\n```/gi
  let match
  while ((match = regex.exec(text)) !== null) {
    const lang = (match[1] || '').toLowerCase()
    const codeContent = match[2].trim()
    
    if (lang === 'java') {
      code.java = codeContent
    } else if (lang === 'javascript' || lang === 'js') {
      code.javascript = codeContent
    } else if (lang === 'jsx' || lang === 'react' || lang === 'reactjs') {
      code.reactjs = codeContent
    } else if (lang === 'html') {
      code.html = codeContent
    } else if (lang === 'css') {
      code.css = codeContent
    } else if (lang === 'sql' || lang === 'mysql') {
      code.mysql = codeContent
    }
  }
  
  return code
}

function extractBulletPoints(text: string): string[] {
  const lines = text.split('\n')
  return lines
    .filter(l => l.trim().startsWith('-') || l.trim().startsWith('*') || /^\d+\./.test(l.trim()))
    .map(l => l.replace(/^[-*\d.]+\s*/, '').trim())
    .filter(Boolean)
}

function extractApproach(text: string): string[] {
  const lines = text.split('\n')
  const approachLines: string[] = []
  let inApproach = false
  for (const line of lines) {
    if (/approach|solution|algorithm|methodology/i.test(line) && (line.includes(':') || line.includes('—'))) {
      inApproach = true
    }
    if (inApproach) {
      const trimmed = line.trim().replace(/^[-*\d.]+\s*/, '')
      if (trimmed) approachLines.push(trimmed)
      if (line.trim() === '') inApproach = false
    }
  }
  return approachLines.slice(0, 5)
}

function extractEdgeCases(text: string): string[] {
  const lines = text.split('\n')
  const edgeLines: string[] = []
  let inEdge = false
  for (const line of lines) {
    if (/edge case|boundary|corner|empty|null|invalid|negative/i.test(line) && (line.includes(':') || line.includes('—') || line.startsWith('-'))) {
      inEdge = true
    }
    if (inEdge) {
      const trimmed = line.trim().replace(/^[-*\d.]+\s*/, '')
      if (trimmed) edgeLines.push(trimmed)
      if (line.trim() === '') inEdge = false
    }
  }
  return edgeLines.slice(0, 5)
}

function extractCausalSteps(text: string): string[] {
  const lines = text.split('\n')
  const causalLines: string[] = []
  let inCausal = false
  for (const line of lines) {
    if (/step|cause|root|reason|why|because|trigger|origin/i.test(line) && (line.includes(':') || line.includes('—') || line.startsWith('-'))) {
      inCausal = true
    }
    if (inCausal) {
      const trimmed = line.trim().replace(/^[-*\d.]+\s*/, '')
      if (trimmed) causalLines.push(trimmed)
      if (line.trim() === '') inCausal = false
    }
  }
  return causalLines.slice(0, 5)
}

function generateMultiLanguageCode(problemText: string, detectedLangs: string[]): CodeGenerationOutput {
  const code: CodeGenerationOutput = {}
  const hasJava = detectedLangs.includes('java') || /java/i.test(problemText)
  const hasJs = detectedLangs.includes('javascript') || /javascript|js|node/i.test(problemText)
  const hasReact = detectedLangs.includes('jsx') || detectedLangs.includes('reactjs') || /react/i.test(problemText)
  const hasHtml = detectedLangs.includes('html') || /html/i.test(problemText)
  const hasSql = detectedLangs.includes('sql') || /sql|database|table|query/i.test(problemText)

  const isSorting = /sort|order|sorted|arrange/i.test(problemText)
  const isSearch = /search|find|lookup|query|binary|linear/i.test(problemText)
  const isString = /string|palindrome|anagram|substring|reverse/i.test(problemText)
  const isArray = /array|list|collection|two.?sum|subarray|prefix/i.test(problemText)
  const isTreeNode = /tree|node|binary|bst|traversal|graph/i.test(problemText)
  const isDP = /dynamic|dp|fibonacci|memo|tabulation|knap|coin/i.test(problemText)

  if (hasJava || isSorting || isSearch || isArray || isString || isDP || isTreeNode) {
    code.java = `import java.util.*;

public class Solution {
    public static void main(String[] args) {
        Solution sol = new Solution();
        // Test with sample input
        Object result = sol.solve(new Object[]{/* input */});
        System.out.println(result);
    }

    public Object solve(Object input) {
        // TODO: Implement solution based on: ${problemText.slice(0, 100)}
        return null;
    }
}`
  }

  if (hasJs || isSorting || isSearch || isArray || isString || isDP || isTreeNode) {
    code.javascript = `/**
 * Solution based on: ${problemText.slice(0, 100)}
 */
function solve(input) {
    // TODO: Implement solution
    return null;
}

// Test
const result = solve(/* input */);
console.log(result);
`
  }

  if (hasReact) {
    code.reactjs = `import React, { useState, useEffect } from 'react';

const Solution = () => {
    const [data, setData] = useState(null);

    useEffect(() => {
        // TODO: Initialize based on: ${problemText.slice(0, 80)}
    }, []);

    return (
        <div className="solution">
            {/* TODO: Render solution UI */}
        </div>
    );
};

export default Solution;
`
  }

  if (hasHtml) {
    code.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Solution</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="app">
        <!-- TODO: Implement UI for: ${problemText.slice(0, 80)} -->
    </div>
    <script src="app.js"></script>
</body>
</html>
`
  }

  if (hasHtml) {
    code.css = `/* Styles for solution */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    background: #f5f5f5;
}

#app {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}
`
  }

  if (hasSql) {
    code.mysql = `-- Database schema and queries based on: ${problemText.slice(0, 100)}
CREATE TABLE IF NOT EXISTS items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TODO: Add solution queries here
SELECT * FROM items;
`
  }

  if (!hasJava && !hasJs && !hasReact && !hasHtml && !hasSql) {
    code.java = `public class Solution {
    public static void main(String[] args) {
        System.out.println("Solution based on: " + args.length > 0 ? args[0] : "analysis");
    }
}`
    code.javascript = `function solve(input) {
    return input;
}
console.log(solve("Solution analysis complete"));`
  }

  return code
}
