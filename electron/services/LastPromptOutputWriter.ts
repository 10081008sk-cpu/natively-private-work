// LastPromptOutputWriter.ts
// Saves the most recent prompt -> output pair to a plain text file so the
// last AI response can be read with any text editor / `cat`, without
// needing to open the SQLite database.
//
// Files (both in <app.getPath('userData')>):
//   last-prompt-output.txt     — overwritten on every prompt, holds ONLY the last output
//   prompt-output-history.txt  — appended on every prompt, holds EVERY prompt/output
//   e.g. Windows: %APPDATA%\Natively\last-prompt-output.txt
//        macOS:    ~/Library/Application Support/Natively/last-prompt-output.txt
//        Linux:    ~/.config/Natively/last-prompt-output.txt
//
// All writes are non-fatal: a failed write is logged and never breaks the
// meeting / LLM flow.

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface LastPromptOutputEntry {
    type?: string;
    question?: string;
    answer?: string | string[] | null;
    items?: string[];
    timestamp?: number;
    [key: string]: any;
}

export const LAST_PROMPT_OUTPUT_FILENAME = 'last-prompt-output.txt';
export const PROMPT_OUTPUT_HISTORY_FILENAME = 'prompt-output-history.txt';

export function getPromptOutputHistoryPath(): string | null {
    try {
        if (!app || typeof app.getPath !== 'function') return null;
        return path.join(app.getPath('userData'), PROMPT_OUTPUT_HISTORY_FILENAME);
    } catch {
        return null;
    }
}

/**
 * Resolve the text file path inside Electron's userData dir.
 * Returns null outside Electron (e.g. unit tests run under plain Node).
 */
export function getLastPromptOutputPath(): string | null {
    try {
        if (!app || typeof app.getPath !== 'function') return null;
        return path.join(app.getPath('userData'), LAST_PROMPT_OUTPUT_FILENAME);
    } catch {
        return null;
    }
}

/** Pure formatter — exported so it can be unit-tested without Electron. */
export function formatLastPromptOutput(entry: LastPromptOutputEntry): string {
    const timestamp = entry.timestamp
        ? new Date(entry.timestamp).toISOString()
        : new Date().toISOString();
    const type = entry.type || 'unknown';
    const prompt = entry.question ? String(entry.question) : '(no prompt text)';

    let output: string;
    if (Array.isArray(entry.answer)) {
        output = JSON.stringify(entry.answer, null, 2);
    } else if (entry.items && entry.items.length > 0) {
        output = JSON.stringify(entry.items, null, 2);
    } else {
        output = String(entry.answer ?? '');
    }

    return [
        `Type: ${type}`,
        `Timestamp: ${timestamp}`,
        '',
        'Prompt:',
        prompt,
        '',
        'Output:',
        output,
        '',
    ].join('\n');
}

/**
 * Save a single prompt/output entry to BOTH text files:
 *   - last-prompt-output.txt     (overwrite — last only)
 *   - prompt-output-history.txt  (append — every prompt, in order)
 * `filePathOverride` exists for tests (pass a temp last-output path;
 * the history file is written next to it).
 * Returns the last-output path written, or null if there was nothing to save,
 * no path available, or the write failed (non-fatal).
 */
export function saveLastPromptOutput(
    entry: LastPromptOutputEntry,
    filePathOverride?: string,
): string | null {
    try {
        // Don't clobber the previous good output with an empty answer.
        const answer = entry?.answer;
        const isEmpty =
            answer == null ||
            (typeof answer === 'string' && answer.trim().length === 0) ||
            (Array.isArray(answer) && answer.length === 0);
        if (isEmpty) return null;

        const filePath = filePathOverride ?? getLastPromptOutputPath();
        if (!filePath) return null;

        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });

        const content = formatLastPromptOutput(entry);
        // 1) Last-only file: atomic-ish overwrite (tmp + rename).
        const tmpPath = `${filePath}.tmp`;
        fs.writeFileSync(tmpPath, content, 'utf-8');
        fs.renameSync(tmpPath, filePath);

        // 2) Every-prompt history: append the same entry with a separator.
        const historyPath = filePathOverride
            ? path.join(path.dirname(filePath), PROMPT_OUTPUT_HISTORY_FILENAME)
            : getPromptOutputHistoryPath();
        if (historyPath) {
            try {
                const separator = `\n${'='.repeat(60)}\n`;
                fs.appendFileSync(historyPath, separator + content, 'utf-8');
                console.log(`[LastPromptOutputWriter] Appended prompt output to ${historyPath}`);
            } catch (histErr) {
                console.warn('[LastPromptOutputWriter] Failed to append history (non-fatal):', histErr);
            }
        }

        console.log(`[LastPromptOutputWriter] Saved last prompt output to ${filePath}`);
        return filePath;
    } catch (err) {
        console.warn('[LastPromptOutputWriter] Failed to save last prompt output (non-fatal):', err);
        return null;
    }
}
