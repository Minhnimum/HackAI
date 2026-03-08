import { Button } from './ui/button';
import { Card } from './ui/card';
import { Play, Square, Trash2, Download } from 'lucide-react';

interface ControlPanelProps {
  isCapturing: boolean;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onClear: () => void;
  hasContent: boolean;
  apiKeysConfigured: boolean;
}

export function ControlPanel({
  isCapturing,
  onStartCapture,
  onStopCapture,
  onClear,
  hasContent,
  apiKeysConfigured,
}: ControlPanelProps) {
  return (
    <Card className="p-6 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200 dark:border-purple-800">
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
        <div className="space-y-1">
          <h2>Capture Controls</h2>
          <p className="text-sm text-muted-foreground">
            {apiKeysConfigured
              ? isCapturing
                ? 'Recording video and audio in real-time'
                : 'Ready to start capturing'
              : 'Configure both API keys to begin'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isCapturing ? (
            <Button
              onClick={onStartCapture}
              disabled={!apiKeysConfigured}
              className="gap-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400"
            >
              <Play className="w-4 h-4" />
              Start Capture
            </Button>
          ) : (
            <Button onClick={onStopCapture} variant="destructive" className="gap-2">
              <Square className="w-4 h-4" />
              Stop Capture
            </Button>
          )}

          <Button
            onClick={onClear}
            variant="outline"
            disabled={!hasContent}
            className="gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </Button>

          <Button
            variant="outline"
            disabled={!hasContent}
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>
    </Card>
  );
}
