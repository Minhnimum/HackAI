import { useNavigate } from 'react-router';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ThemeToggle } from '../components/theme-toggle';
import { Sparkles, Video, BookOpen, MessageSquare, ArrowRight } from 'lucide-react';

export function Home() {
  const navigate = useNavigate();

  const handleStartRecording = () => {
    navigate('/preview');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-blue-950 dark:to-purple-950">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  AI-Powered Video Transcription
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Real-time OCR with LaTeX rendering (Gemini) + Audio transcription (Eleven Labs)
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* Hero Section */}
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent pb-2">
              Transform Your Videos Into Insights
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Capture video content and get real-time LaTeX whiteboard transcriptions and audio-to-text conversion
            </p>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <Card className="p-6 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500 rounded-lg">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Live Whiteboard</h3>
                  <p className="text-sm text-muted-foreground">
                    Gemini AI recognizes handwritten equations and diagrams, converting them into beautifully rendered LaTeX in real-time
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200 dark:border-purple-800">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-500 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Live Transcription</h3>
                  <p className="text-sm text-muted-foreground">
                    Eleven Labs captures and transcribes speech with high accuracy, providing synchronized text output
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Start Button */}
          <Card className="p-8 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 border-purple-200 dark:border-purple-800">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-2 text-center sm:text-left">
                <h3 className="text-xl font-semibold">Ready to Start?</h3>
                <p className="text-sm text-muted-foreground">
                  Click the button to preview your video setup and begin recording
                </p>
              </div>
              <Button
                onClick={handleStartRecording}
                size="lg"
                className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Video className="w-5 h-5" />
                Start Recording
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </Card>

          {/* Info Section */}
          <div className="p-6 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold mb-3">How It Works</h3>
            <div className="grid md:grid-cols-3 gap-6 text-sm text-muted-foreground">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-foreground font-medium mb-2">
                  <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">1</div>
                  Preview Setup
                </div>
                <p>Configure your camera and audio settings before starting</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-foreground font-medium mb-2">
                  <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs">2</div>
                  Confirm & Record
                </div>
                <p>Review your setup and begin capturing video and audio</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-foreground font-medium mb-2">
                  <div className="w-6 h-6 rounded-full bg-pink-500 text-white flex items-center justify-center text-xs">3</div>
                  Real-time Results
                </div>
                <p>Watch as AI processes and displays transcriptions live</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-sm text-muted-foreground">
            Powered by Google Gemini AI & Eleven Labs • Built with React, TypeScript & Tailwind CSS
          </p>
        </div>
      </footer>
    </div>
  );
}