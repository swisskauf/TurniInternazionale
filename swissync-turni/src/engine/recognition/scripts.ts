import type { RecognitionScript } from '../types';

export function newScript(partial: Partial<RecognitionScript> & Pick<RecognitionScript, 'id' | 'name'>): RecognitionScript {
  const now = Date.now();
  return {
    description: '',
    createdBy: 'manual',
    layout: 'grid',
    header: 'auto',
    keywords: [],
    personLabel: '',
    personAliases: [],
    codeMap: [],
    ignore: [],
    emptyMeans: 'skip',
    linePattern: '',
    dateOrder: 'DMY',
    stats: { runs: 0, lastRunAt: 0, lastAccuracy: 0, daysRecognized: 0 },
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Built-in scripts that work on most plans without any setup and without xAI. */
export const SYSTEM_SCRIPTS: RecognitionScript[] = [
  newScript({
    id: 'sys-grid',
    name: 'Griglia automatica',
    description: 'Tabella con una riga per persona e una colonna per giorno (o viceversa).',
    createdBy: 'system',
    layout: 'grid',
    header: 'auto',
    createdAt: 0,
    updatedAt: 0,
  }),
  newScript({
    id: 'sys-list',
    name: 'Elenco con date',
    description: 'Una riga per giorno con data e codice o orari (messaggi, email, PDF semplici).',
    createdBy: 'system',
    layout: 'list',
    createdAt: 0,
    updatedAt: 0,
  }),
];

export const isSystemScript = (s: RecognitionScript) => s.createdBy === 'system';
