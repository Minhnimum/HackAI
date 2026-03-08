import { useState } from 'react';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Eye, EyeOff, Key } from 'lucide-react';
import { Alert, AlertDescription } from './ui/alert';

interface ApiSettingsProps {
  geminiApiKey: string;
  elevenLabsApiKey: string;
  onGeminiApiKeyChange: (key: string) => void;
  onElevenLabsApiKeyChange: (key: string) => void;
}

export function ApiSettings({ 
  geminiApiKey, 
  elevenLabsApiKey,
  onGeminiApiKeyChange,
  onElevenLabsApiKeyChange 
}: ApiSettingsProps) {
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [localGeminiKey, setLocalGeminiKey] = useState(geminiApiKey);
  const [localElevenLabsKey, setLocalElevenLabsKey] = useState(elevenLabsApiKey);

  const handleSaveGemini = () => {
    onGeminiApiKeyChange(localGeminiKey);
  };

  const handleSaveElevenLabs = () => {
    onElevenLabsApiKeyChange(localElevenLabsKey);
  };

  return (
    <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-500 rounded-lg">
            <Key className="w-5 h-5 text-white" />
          </div>
          <h2>API Configuration</h2>
        </div>

        <Alert className="bg-white/50 dark:bg-slate-900/50 border-blue-300 dark:border-blue-700">
          <AlertDescription className="text-sm">
            Configure your API keys for Gemini (OCR & LaTeX) and Eleven Labs (transcription).
            Keys are stored securely in your browser.
          </AlertDescription>
        </Alert>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Gemini API Key */}
          <div className="space-y-2">
            <Label htmlFor="gemini-api-key" className="flex items-center gap-2">
              Gemini API Key
              <span className="text-xs text-muted-foreground">(OCR & LaTeX)</span>
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="gemini-api-key"
                  type={showGeminiKey ? 'text' : 'password'}
                  value={localGeminiKey}
                  onChange={(e) => setLocalGeminiKey(e.target.value)}
                  placeholder="Enter Gemini API key"
                  className="pr-10 bg-white dark:bg-slate-900"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                >
                  {showGeminiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button onClick={handleSaveGemini} className="bg-blue-500 hover:bg-blue-600">
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get from{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                Google AI Studio
              </a>
            </p>
          </div>

          {/* Eleven Labs API Key */}
          <div className="space-y-2">
            <Label htmlFor="elevenlabs-api-key" className="flex items-center gap-2">
              Eleven Labs API Key
              <span className="text-xs text-muted-foreground">(Transcription)</span>
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="elevenlabs-api-key"
                  type={showElevenLabsKey ? 'text' : 'password'}
                  value={localElevenLabsKey}
                  onChange={(e) => setLocalElevenLabsKey(e.target.value)}
                  placeholder="Enter Eleven Labs API key"
                  className="pr-10 bg-white dark:bg-slate-900"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowElevenLabsKey(!showElevenLabsKey)}
                >
                  {showElevenLabsKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button onClick={handleSaveElevenLabs} className="bg-blue-500 hover:bg-blue-600">
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get from{' '}
              <a
                href="https://elevenlabs.io"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-primary"
              >
                Eleven Labs
              </a>
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
