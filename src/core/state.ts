import fs from 'node:fs/promises';
import { STATE_FILE, CLAUDE_MULTI_HOME } from './constants.js';
import type { ClaudeMultiState } from './types.js';

const DEFAULT_STATE: ClaudeMultiState = { primaryAdopted: false };

export async function readState(): Promise<ClaudeMultiState> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ...DEFAULT_STATE };
    throw err;
  }
}

export async function writeState(state: ClaudeMultiState): Promise<void> {
  await fs.mkdir(CLAUDE_MULTI_HOME, { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}
