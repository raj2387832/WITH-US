import { motion } from 'framer-motion';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageComparisonProps {
  originalUrl: string;
  resultUrl: string;
  onDownload: () => void;
  onReset: () => void;
}

export function ImageComparison({ originalUrl, resultUrl, onDownload, onReset }: ImageComparisonProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Original Image */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Original</h3>
            <span className="text-xs px-2 py-1 bg-muted text-muted-foreground rounded-md">Before</span>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-border/50 bg-muted/20 aspect-square md:aspect-auto md:h-[400px]">
            <img 
              src={originalUrl} 
              alt="Original" 
              className="w-full h-full object-contain"
            />
          </div>
        </div>

        {/* Result Image */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-primary">Result</h3>
            <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-md">After</span>
          </div>
          <div className="relative rounded-2xl overflow-hidden border border-primary/20 bg-checkered shadow-inner aspect-square md:aspect-auto md:h-[400px]">
            <img 
              src={resultUrl} 
              alt="Result with transparent background" 
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
        <Button 
          variant="outline" 
          size="lg" 
          onClick={onReset}
          className="w-full sm:w-auto rounded-xl"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Process Another
        </Button>
        <Button 
          size="lg" 
          onClick={onDownload}
          className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-primary to-violet-600 hover:opacity-90 shadow-lg shadow-primary/25"
        >
          <Download className="w-4 h-4 mr-2" />
          Download PNG
        </Button>
      </div>
    </motion.div>
  );
}
