import { useNavigate } from 'react-router';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ThemeToggle } from '../components/theme-toggle';
import { toast } from 'sonner';
import { Video, ArrowRight, ArrowLeft } from 'lucide-react';

export function Preview() {
  const navigate = useNavigate();

  const handleConfirm = () => {
    toast.success('Starting transcription session...', { duration: 800 });
    navigate('/transcribe');
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:from-slate-950 dark:via-blue-950 dark:to-purple-950">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                <Video className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1>Video Preview</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                  Review your setup before starting
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button onClick={handleBack} variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-12">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Video Preview */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2">
                  <Video className="w-5 h-5" />
                  Camera Preview
                </h2>
              </div>

              <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <Video className="w-20 h-20 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Video preview will appear here</p>
                  <p className="text-sm mt-2 opacity-75">Camera feed placeholder</p>
                </div>
                
                {/* Placeholder recording indicator */}
                <div className="absolute top-4 right-4 flex items-center gap-2 bg-green-500 text-white px-3 py-1.5 rounded-full text-sm">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  Ready
                </div>
              </div>
            </div>
          </Card>

          {/* Confirmation Button */}
          <Card className="p-8 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800">
            <div className="text-center space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-2">Ready to Start?</h3>
                <p className="text-sm text-muted-foreground">
                  Click continue to begin the transcription session
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  onClick={handleBack}
                  variant="outline"
                  size="lg"
                  className="gap-2"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Back
                </Button>
                <Button
                  onClick={handleConfirm}
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                >
                  Confirm & Continue
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </div>
          </Card>

          {/* Help Text */}
          <div className="p-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-800">
            <p className="text-sm text-muted-foreground text-center">
              <strong>Tip:</strong> Position your camera to capture the whiteboard clearly. Make sure the lighting is adequate for best OCR results.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}