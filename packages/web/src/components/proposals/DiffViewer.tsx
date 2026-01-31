import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface DiffViewerProps {
  diff: string;
  className?: string;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  lineNumber?: number;
}

function parseDiff(diff: string): DiffLine[] {
  const lines = diff.split('\n');
  const result: DiffLine[] = [];
  let addedLineNumber = 0;
  let removedLineNumber = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Parse line numbers from hunk header
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        removedLineNumber = parseInt(match[1], 10);
        addedLineNumber = parseInt(match[2], 10);
      }
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      result.push({
        type: 'added',
        content: line.substring(1),
        lineNumber: addedLineNumber++,
      });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      result.push({
        type: 'removed',
        content: line.substring(1),
        lineNumber: removedLineNumber++,
      });
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      result.push({ type: 'header', content: line });
    } else {
      result.push({
        type: 'unchanged',
        content: line.startsWith(' ') ? line.substring(1) : line,
        lineNumber: addedLineNumber++,
      });
      removedLineNumber++;
    }
  }

  return result;
}

function getSummary(lines: DiffLine[]): { added: number; removed: number } {
  return lines.reduce(
    (acc, line) => {
      if (line.type === 'added') acc.added++;
      if (line.type === 'removed') acc.removed++;
      return acc;
    },
    { added: 0, removed: 0 }
  );
}

export function DiffViewer({
  diff,
  className,
  collapsible = true,
  defaultExpanded = false,
}: DiffViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const lines = parseDiff(diff);
  const summary = getSummary(lines);

  const previewLines = lines.filter((l) => l.type !== 'header').slice(0, 6);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-muted/30',
        className
      )}
    >
      {/* Summary Header */}
      <div
        className={cn(
          'flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2',
          collapsible && 'cursor-pointer hover:bg-muted'
        )}
        onClick={() => collapsible && setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2 text-sm">
            <span className="text-green-500">+{summary.added}</span>
            <span className="text-red-500">-{summary.removed}</span>
          </div>
        </div>
        {collapsible && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Preview / Full View */}
      <AnimatePresence initial={false}>
        {!expanded && collapsible ? (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 font-mono text-xs">
              {previewLines.map((line, i) => (
                <DiffLineComponent key={i} line={line} compact />
              ))}
              {lines.length > 6 && (
                <div className="mt-2 text-center text-muted-foreground">
                  ... 展开查看更多 ({lines.length - 6} 行)
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-96 overflow-auto p-2 font-mono text-xs">
              {lines.map((line, i) => (
                <DiffLineComponent key={i} line={line} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DiffLineComponentProps {
  line: DiffLine;
  compact?: boolean;
}

function DiffLineComponent({ line, compact }: DiffLineComponentProps) {
  const bgColor = {
    added: 'bg-green-500/10',
    removed: 'bg-red-500/10',
    unchanged: '',
    header: 'bg-blue-500/10 text-blue-500',
  }[line.type];

  const textColor = {
    added: 'text-green-500',
    removed: 'text-red-500',
    unchanged: 'text-muted-foreground',
    header: 'text-blue-500',
  }[line.type];

  const prefix = {
    added: '+',
    removed: '-',
    unchanged: ' ',
    header: '',
  }[line.type];

  return (
    <div className={cn('flex', bgColor, compact && 'py-0.5')}>
      {line.lineNumber !== undefined && !compact && (
        <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground/50">
          {line.lineNumber}
        </span>
      )}
      <span className={cn('w-4 shrink-0 select-none', textColor)}>
        {prefix}
      </span>
      <pre className={cn('flex-1 whitespace-pre-wrap break-all', textColor)}>
        {line.content}
      </pre>
    </div>
  );
}
