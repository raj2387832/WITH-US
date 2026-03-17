import { Sparkles, Image as ImageIcon, RefreshCw, Download, Zap } from 'lucide-react';
import { useBgRemover } from '@/hooks/use-bg-remover';
import { ImageUploader } from '@/components/ImageUploader';
import { ImageComparison } from '@/components/ImageComparison';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

export default function Home() {
  const {
    originalUrl,
    resultUrl,
    handleFileSelect,
    clearSelection,
    processImage,
    downloadResult,
    isProcessing,
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
          <Zap className="w-4 h-4 mr-2" />
          <span className="text-sm font-semibold tracking-wide uppercase">100% In-Browser · No API · No Credits</span>
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
          Upload an image and the background is removed instantly — everything runs privately in your browser. No server, no API, no cost.
        </motion.p>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div layout className="glass-panel rounded-3xl p-2 sm:p-4 md:p-8">
          <AnimatePresence mode="wait">
            {!resultUrl ? (
              <motion.div key="uploader" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ImageUploader
                  onFileSelect={handleFileSelect}
                  selectedFileUrl={originalUrl}
                  onClear={clearSelection}
                  isProcessing={isProcessing}
                />

                {/* Process button — only shown once an image is selected */}
                <AnimatePresence>
                  {originalUrl && (
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      className="mt-6 flex justify-center"
                    >
                      <Button
                        onClick={processImage}
                        disabled={isProcessing}
                        className="h-14 px-10 rounded-xl text-lg font-semibold bg-gradient-to-r from-primary to-violet-600 hover:shadow-lg hover:shadow-primary/25 transition-all duration-300"
                      >
                        {isProcessing ? (
                          <>
                            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                            Processing… (first run downloads model)
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-5 h-5 mr-2" />
                            Remove Background
                          </>
                        )}
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ImageComparison
                  originalUrl={originalUrl!}
                  resultUrl={resultUrl}
                  onDownload={downloadResult}
                  onReset={clearSelection}
                />
                <div className="mt-6 flex justify-center gap-4">
                  <Button
                    variant="outline"
                    onClick={clearSelection}
                    className="h-12 px-8 rounded-xl font-semibold"
                  >
                    Try Another Image
                  </Button>
                  <Button
                    onClick={downloadResult}
                    className="h-12 px-8 rounded-xl font-semibold bg-gradient-to-r from-primary to-violet-600 hover:shadow-lg hover:shadow-primary/25"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Download PNG
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-10 flex flex-wrap justify-center gap-3 text-sm text-muted-foreground"
        >
          {['Runs 100% in your browser', 'No account needed', 'Free forever', 'Supports JPG · PNG · WebP', 'Transparent PNG output'].map((feat) => (
            <span key={feat} className="flex items-center gap-1.5 bg-muted/60 px-3 py-1.5 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              {feat}
            </span>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
