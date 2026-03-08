import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { MessageSquare, Mic } from 'lucide-react';

interface TranscriptionSegment {
  id: string;
  timestamp: string;
  text: string;
  speaker?: string;
}

interface LiveTranscriptionProps {
  segments: TranscriptionSegment[];
  isProcessing: boolean;
}

export function LiveTranscription({ segments, isProcessing }: LiveTranscriptionProps) {
  return (
    <Card className="p-6 h-full flex flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between mb-4">
        <h2 className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-purple-500" />
          Live Transcription
        </h2>
        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mic className="w-4 h-4 animate-pulse text-red-500" />
            Listening...
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {segments.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No transcription yet</p>
              <p className="text-sm mt-1">Eleven Labs will transcribe audio here</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pr-4">
            {segments.map((segment) => (
              <div
                key={segment.id}
                className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-lg border border-purple-200 dark:border-purple-800"
              >
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  {segment.timestamp}
                  {segment.speaker && (
                    <span className="ml-2 px-2 py-0.5 bg-purple-200 dark:bg-purple-900 rounded text-xs">
                      {segment.speaker}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed">{segment.text}</p>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
