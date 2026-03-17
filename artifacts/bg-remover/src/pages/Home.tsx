import { Sparkles, Settings2, Image as ImageIcon } from 'lucide-react';
import { useBgRemover } from '@/hooks/use-bg-remover';
import { ImageUploader } from '@/components/ImageUploader';
import { ImageComparison } from '@/components/ImageComparison';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const {
    originalUrl,
    resultUrl,
    threshold,
    setThreshold,
    iterations,
    setIterations,
    handleFileSelect,
    clearSelection,
    processImage,
    downloadResult,
    isProcessing
  } = useBgRemover();

  return (
    <div className="min-h-screen pb-20">
      {/* Header / Hero */}
      <header className="pt-20 pb-12 px-6 text-center max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center justify-center p-2 px-4 rounded-full bg-primary/10 text-primary mb-6 ring-1 ring-primary/20"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          <span className="text-sm font-semibold tracking-wide uppercase">AI-Free Precision Extraction</span>
        </motion.div>
        
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-6xl font-extrabold mb-6 text-balance"
        >
          Remove Backgrounds with <span className="text-gradient">Surgical Precision</span>
        </motion.h1>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg text-muted-foreground"
        >
          Upload an image and instantly separate the subject from its background using advanced computer vision edge detection. Fast, private, and stunningly accurate.
        </motion.p>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Settings Sidebar (Only show if image is selected and not finished) */}
          <AnimatePresence>
            {originalUrl && !resultUrl && (
              <motion.div 
                initial={{ opacity: 0, x: -20, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 'auto' }}
                exit={{ opacity: 0, x: -20, width: 0 }}
                className="lg:col-span-4 glass-panel rounded-3xl p-6"
              >
                <div className="flex items-center mb-6 pb-4 border-b border-border/50">
                  <Settings2 className="w-5 h-5 mr-2 text-primary" />
                  <h2 className="text-lg font-semibold">Tuning Controls</h2>
                </div>
                
                <div className="space-y-8">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="threshold" className="text-sm font-medium">Edge Sensitivity</Label>
                      <span className="text-xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground">{threshold}</span>
                    </div>
                    <Slider 
                      id="threshold"
                      min={1} 
                      max={100} 
                      step={1} 
                      value={[threshold]} 
                      onValueChange={(v) => setThreshold(v[0])}
                      disabled={isProcessing}
                      className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5"
                    />
                    <p className="text-xs text-muted-foreground">
                      Lower values are stricter, higher values include more area.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="iterations" className="text-sm font-medium">Processing Depth</Label>
                      <span className="text-xs font-mono bg-muted px-2 py-1 rounded text-muted-foreground">{iterations}</span>
                    </div>
                    <Slider 
                      id="iterations"
                      min={1} 
                      max={20} 
                      step={1} 
                      value={[iterations]} 
                      onValueChange={(v) => setIterations(v[0])}
                      disabled={isProcessing}
                      className="[&_[role=slider]]:h-5 [&_[role=slider]]:w-5"
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher values improve accuracy but take slightly longer.
                    </p>
                  </div>

                  <Button 
                    onClick={processImage} 
                    disabled={isProcessing}
                    className="w-full h-14 rounded-xl text-lg font-semibold bg-gradient-to-r from-primary to-violet-600 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-5 h-5 mr-2" />
                        Remove Background
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Stage (Uploader or Comparison) */}
          <motion.div 
            layout
            className={cn(
              "transition-all duration-500",
              originalUrl && !resultUrl ? "lg:col-span-8" : "lg:col-span-12"
            )}
          >
            <div className="glass-panel rounded-3xl p-2 sm:p-4 md:p-8">
              {!resultUrl ? (
                <ImageUploader 
                  onFileSelect={handleFileSelect}
                  selectedFileUrl={originalUrl}
                  onClear={clearSelection}
                  isProcessing={isProcessing}
                />
              ) : (
                <ImageComparison 
                  originalUrl={originalUrl!}
                  resultUrl={resultUrl}
                  onDownload={downloadResult}
                  onReset={clearSelection}
                />
              )}
            </div>
          </motion.div>

        </div>
      </main>
    </div>
  );
}

// Inline utility for layout transitions
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}
