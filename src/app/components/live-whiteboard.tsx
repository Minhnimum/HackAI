import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { BookOpen, Sparkles } from 'lucide-react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';

interface WhiteboardContent {
  id: string;
  timestamp: string;
  latex: string;
  rawText?: string;
}

interface LiveWhiteboardProps {
  content: WhiteboardContent[];
  isProcessing: boolean;
}

export function LiveWhiteboard({ content, isProcessing }: LiveWhiteboardProps) {
  return (
    <Card className="p-6 h-full flex flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-500" />
          Live Whiteboard
        </h2>
        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="w-4 h-4 animate-pulse text-blue-500" />
            Processing OCR...
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {content.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No content detected yet</p>
              <p className="text-sm mt-1">Gemini will render LaTeX from OCR here</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 pr-4">
            {content.map((item) => (
              <div
                key={item.id}
                className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg border border-blue-200 dark:border-blue-800"
              >
                <div className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {item.timestamp}
                </div>
                
                {item.rawText && (
                  <div className="text-sm text-muted-foreground mb-3 italic">
                    Detected: {item.rawText}
                  </div>
                )}
                
                <div className="bg-white dark:bg-slate-900 p-4 rounded border border-blue-100 dark:border-blue-900 overflow-x-auto">
                  <BlockMath math={item.latex} />
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
