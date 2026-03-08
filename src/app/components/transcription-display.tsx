import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { FileText, Loader2, Sparkles } from 'lucide-react';

interface TranscriptionDisplayProps {
  transcriptions: Array<{
    id: string;
    timestamp: string;
    text: string;
  }>;
  isProcessing: boolean;
}

export function TranscriptionDisplay({ transcriptions, isProcessing }: TranscriptionDisplayProps) {
  return (
    <Card className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          AI Transcription
        </h2>
        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 h-[500px]">
        {transcriptions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No transcriptions yet</p>
              <p className="text-sm mt-1">Start capturing to see AI-generated transcriptions</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pr-4">
            {transcriptions.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-lg border border-purple-200 dark:border-purple-800"
              >
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  {item.timestamp}
                </div>
                <p className="text-sm leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
