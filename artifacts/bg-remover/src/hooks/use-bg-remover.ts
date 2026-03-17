import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useBgRemover() {
  const { toast } = useToast();

  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [originalUrl, resultUrl]);

  const handleFileSelect = useCallback((file: File) => {
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

  const processImage = useCallback(async () => {
    if (!originalFile || isProcessing) return;

    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }

    setIsProcessing(true);

    try {
      const { removeBackground } = await import('@imgly/background-removal');

      const blob = await removeBackground(originalFile, {
        publicPath: `https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/`,
        debug: false,
        model: 'medium',
        output: {
          format: 'image/png',
          quality: 1,
        },
      });

      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      toast({
        title: 'Done!',
        description: 'Background removed successfully.',
      });
    } catch (error: unknown) {
      console.error('Processing failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        variant: 'destructive',
        title: 'Processing Failed',
        description: message || 'Could not remove background. Please try again.',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [originalFile, isProcessing, resultUrl, toast]);

  const downloadResult = useCallback(() => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    const name = originalFile ? originalFile.name.replace(/\.[^/.]+$/, '') : 'image';
    a.download = `${name}-no-bg.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [resultUrl, originalFile]);

  return {
    originalFile,
    originalUrl,
    resultUrl,
    handleFileSelect,
    clearSelection,
    processImage,
    downloadResult,
    isProcessing,
  };
}
