import { Card } from './ui/card';
import { Video } from 'lucide-react';

interface VideoCaptureProps {
  isCapturing: boolean;
}

export function VideoCapture({ isCapturing }: VideoCaptureProps) {
  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2">
            <Video className="w-5 h-5" />
            Live Video Feed
          </h2>
        </div>

        <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg overflow-hidden aspect-video flex items-center justify-center">
          <div className="text-center text-slate-400">
            <Video className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>Camera feed will appear here</p>
            <p className="text-sm mt-2 opacity-75">Video capture implementation pending</p>
          </div>
          
          {isCapturing && (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-full text-sm">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Recording
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
