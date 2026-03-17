import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, Image as ImageIcon, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ImageUploaderProps {
  onFileSelect: (file: File) => void;
  selectedFileUrl: string | null;
  onClear: () => void;
  isProcessing?: boolean;
}

export function ImageUploader({ onFileSelect, selectedFileUrl, onClear, isProcessing }: ImageUploaderProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileSelect(acceptedFiles[0]);
    }
  }, [onFileSelect]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    },
    maxFiles: 1,
    disabled: isProcessing || !!selectedFileUrl
  });

  return (
    <div className="w-full relative">
      <AnimatePresence mode="wait">
        {!selectedFileUrl ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-2xl p-12 transition-all duration-300 ease-out cursor-pointer group flex flex-col items-center justify-center text-center min-h-[300px]",
              isDragActive ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50 hover:bg-muted/50",
              isDragReject && "border-destructive bg-destructive/5"
            )}
          >
            <input {...getInputProps()} />
            
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-colors duration-300",
              isDragActive ? "bg-primary text-white shadow-lg shadow-primary/25" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
            )}>
              <UploadCloud className="w-8 h-8" />
            </div>
            
            <h3 className="text-xl font-semibold mb-2">
              {isDragActive ? "Drop image here" : "Upload your image"}
            </h3>
            <p className="text-muted-foreground max-w-sm">
              Drag and drop an image here, or click to browse. Supports JPG, PNG, and WebP up to 10MB.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative rounded-2xl overflow-hidden shadow-lg border border-border/50 bg-muted/20"
          >
            <img 
              src={selectedFileUrl} 
              alt="Preview" 
              className={cn(
                "w-full h-auto max-h-[500px] object-contain transition-opacity duration-300",
                isProcessing && "opacity-50 blur-sm"
              )} 
            />
            
            {!isProcessing && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="absolute top-4 right-4 p-2 bg-background/80 backdrop-blur shadow-sm text-foreground rounded-full hover:bg-destructive hover:text-white transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            {isProcessing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/20 backdrop-blur-sm z-20">
                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                <p className="font-medium text-foreground bg-background/80 px-4 py-2 rounded-full shadow-sm">
                  Removing Background...
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
