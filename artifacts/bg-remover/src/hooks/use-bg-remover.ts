import { useState, useCallback, useEffect } from 'react';
import { useRemoveBackground } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

export function useBgRemover() {
  const { toast } = useToast();
  const removeBgMutation = useRemoveBackground();
  
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  
  const [threshold, setThreshold] = useState<number>(15);
  const [iterations, setIterations] = useState<number>(5);

  // Clean up object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [originalUrl, resultUrl]);

  const handleFileSelect = useCallback((file: File) => {
    // Clear previous state
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(null);
    
    setOriginalFile(file);
    setOriginalUrl(URL.createObjectURL(file));
  }, [originalUrl, resultUrl]);

  const clearSelection = useCallback(() => {
    setOriginalFile(null);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setOriginalUrl(null);
    setResultUrl(null);
  }, [originalUrl, resultUrl]);

  const processImage = useCallback(() => {
    if (!originalFile) return;

    // Reset previous result
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }

    removeBgMutation.mutate(
      {
        data: {
          image: originalFile,
          threshold,
          iterations
        }
      },
      {
        onSuccess: (blob) => {
          const url = URL.createObjectURL(blob);
          setResultUrl(url);
          toast({
            title: "Success!",
            description: "Background removed successfully.",
          });
        },
        onError: (error) => {
          console.error("Processing failed:", error);
          toast({
            variant: "destructive",
            title: "Processing Failed",
            description: error.message || "Could not remove background. Please try again.",
          });
        }
      }
    );
  }, [originalFile, threshold, iterations, resultUrl, removeBgMutation, toast]);

  const downloadResult = useCallback(() => {
    if (!resultUrl) return;
    
    const a = document.createElement('a');
    a.href = resultUrl;
    // Derive filename from original if possible
    const name = originalFile ? originalFile.name.replace(/\.[^/.]+$/, "") : "image";
    a.download = `${name}-bg-removed.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [resultUrl, originalFile]);

  return {
    originalFile,
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
    isProcessing: removeBgMutation.isPending
  };
}
