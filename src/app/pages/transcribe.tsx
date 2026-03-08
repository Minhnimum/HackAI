import { useState } from 'react';
import { useNavigate } from 'react-router';
import { LiveWhiteboard } from '../components/live-whiteboard';
import { LiveTranscription } from '../components/live-transcription';
import { Button } from '../components/ui/button';
import { ThemeToggle } from '../components/theme-toggle';
import { toast } from 'sonner';
import { Sparkles, Square, Download, Home } from 'lucide-react';

interface WhiteboardContent {
  id: string;
  timestamp: string;
  latex: string;
  rawText?: string;
}

interface TranscriptionSegment {
  id: string;
  timestamp: string;
  text: string;
  speaker?: string;
}

export function Transcribe() {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(true);
  const [whiteboardContent, setWhiteboardContent] = useState<WhiteboardContent[]>([]);
  const [transcriptionSegments, setTranscriptionSegments] = useState<TranscriptionSegment[]>([]);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);

  const handleStopRecording = () => {
    setIsRecording(false);
    toast.success('Recording stopped', { duration: 800 });
  };

  const handleExport = () => {
    toast.info('Export functionality ready for implementation');
  };

  const handleGoHome = () => {
    if (isRecording) {
      const confirmed = window.confirm('Recording is still active. Are you sure you want to leave?');
      if (!confirmed) return;
    }
    navigate('/');
  };

  const hasContent = whiteboardContent.length > 0 || transcriptionSegments.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-blue-950 dark:to-purple-950 flex flex-col">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl">Live Transcription Session</h1>
                <p className="text-muted-foreground text-xs">
                  {isRecording ? 'Active' : 'Stopped'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {isRecording && (
                <div className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-sm mr-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  Recording
                </div>
              )}
              
              <ThemeToggle />
              
              <Button onClick={handleGoHome} variant="outline" size="sm">
                <Home className="w-4 h-4 mr-2" />
                Home
              </Button>
              
              {isRecording ? (
                <Button onClick={handleStopRecording} variant="destructive" size="sm">
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              ) : (
                <Button onClick={handleExport} variant="default" size="sm" disabled={!hasContent}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 flex-1 flex flex-col min-h-0">
        {/* Main Content - Live Whiteboard (Left, Larger) and Live Transcription (Right, Smaller) */}
        <div className="grid lg:grid-cols-3 gap-6 flex-1 min-h-0">
          <div className="lg:col-span-2 flex flex-col min-h-0">
            <LiveWhiteboard
              content={whiteboardContent}
              isProcessing={isProcessingOCR}
            />
          </div>
          <div className="lg:col-span-1 flex flex-col min-h-0">
            <LiveTranscription
              segments={transcriptionSegments}
              isProcessing={isProcessingAudio}
            />
          </div>
        </div>
      </main>
    </div>
  );
}