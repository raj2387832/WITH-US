import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useCredits } from '@/hooks/use-credits';

export function useBgRemover() {
  const { toast } = useToast();
  const { useCredit, isAuthenticated, login } = useCredits();

  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = useCallback((file: File) => {
    setOriginalUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setResultUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setOriginalFile(file);
  }, []);

  const clearSelection = useCallback(() => {
    setOriginalFile(null);
    setOriginalUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setResultUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const processImage = useCallback(async () => {
    if (!originalFile || isProcessing) return;

    if (!isAuthenticated) {
      toast({ variant: 'destructive', title: 'Sign in required', description: 'Please log in to process images.' });
      login();
      return;
    }

    const creditResult = await useCredit('Background Removal');
    if (!creditResult.ok) {
      if (creditResult.error === 'login_required') {
        toast({ variant: 'destructive', title: 'Sign in required', description: 'Please log in to process images.' });
        login();
      } else if (creditResult.error === 'no_credits') {
        toast({ variant: 'destructive', title: 'No credits', description: 'You need at least 1 credit. Claim your daily free credits or buy more on the Pricing page.' });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: creditResult.error ?? 'Failed to use credit' });
      }
      return;
    }

    setResultUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });

    setIsProcessing(true);

    try {
      const { removeBackground } = await import('@imgly/background-removal');

      const blob = await removeBackground(originalFile, {
        publicPath: `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/`,
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
        description: `Background removed successfully. (${creditResult.balance} credits remaining)`,
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
  }, [originalFile, isProcessing, toast, isAuthenticated, login, useCredit]);

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
