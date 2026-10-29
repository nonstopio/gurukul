import { Input, Select, Toggle } from '@gurukul/ui';
import { patch } from '../patch';
import { CodeField } from './CodeField';
import type { BlockEditorProps } from './types';

const LANGUAGES = [
  'javascript',
  'typescript',
  'tsx',
  'bash',
  'json',
  'python',
  'java',
  'kotlin',
  'swift',
  'html',
  'css',
  'sql',
  'yaml',
  'text',
];

/** A code listing: language, file name, the code, and how it is shown (copy button, terminal look, highlighted lines). */
export function CodeEditor({ block, onChange }: BlockEditorProps<'code'>) {
  const languages = LANGUAGES.includes(block.lang) ? LANGUAGES : [block.lang, ...LANGUAGES];
  return (
    <div className="studio-fields">
      <div className="studio-row">
        <Select
          label="Language"
          value={block.lang}
          onChange={(e) => onChange({ ...block, lang: e.target.value })}
        >
          {languages.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </Select>
        <Input
          label="File name (optional)"
          className="studio-mono"
          value={block.file ?? ''}
          onChange={(e) => onChange(patch(block, { file: e.target.value || undefined }))}
        />
      </div>
      <CodeField
        label="Code"
        language={block.lang}
        tone="code"
        rows={10}
        value={block.code}
        onChange={(code) => onChange({ ...block, code })}
      />
      <div className="studio-row">
        <Toggle
          label="Copy button"
          checked={block.copy}
          onChange={(e) => onChange({ ...block, copy: e.target.checked })}
        />
        <Toggle
          label="Terminal style"
          checked={block.terminal}
          onChange={(e) => onChange({ ...block, terminal: e.target.checked })}
        />
      </div>
      <Input
        label="Highlight lines (optional)"
        hint="For example 2,4-6"
        value={block.highlight ?? ''}
        onChange={(e) => onChange(patch(block, { highlight: e.target.value || undefined }))}
      />
    </div>
  );
}
