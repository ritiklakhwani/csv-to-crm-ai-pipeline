'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Stepper, type Step } from '@/components/Stepper';
import { PreviewStep } from '@/components/steps/PreviewStep';
import { ProcessingStep } from '@/components/steps/ProcessingStep';
import { ResultsStep } from '@/components/steps/ResultsStep';
import { UploadStep } from '@/components/steps/UploadStep';
import { useToast } from '@/components/ui/Toast';
import { parseCsvPreview, type ParsedPreview } from '@/hooks/useCsvParser';
import { useImport } from '@/hooks/useImport';

export default function Page() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);

  const { state, start, reset } = useImport();
  const toast = useToast();

  // The pipeline reports completion by flipping status to 'done'; advance the stepper off that.
  useEffect(() => {
    if (state.status === 'done') setStep('results');
  }, [state.status]);

  const handleFileSelected = useCallback(
    async (selected: File) => {
      setFile(selected);
      try {
        const parsed = await parseCsvPreview(selected);
        if (parsed.rowCount === 0) {
          toast.error('That file has no data rows.');
          return;
        }
        setPreview(parsed);
        setStep('preview');
      } catch {
        toast.error('Could not parse that CSV. Is it a valid file?');
      }
    },
    [toast],
  );

  const handleConfirm = useCallback(() => {
    if (!file) return;
    setStep('processing');
    start(file);
  }, [file, start]);

  const startOver = useCallback(() => {
    reset();
    setFile(null);
    setPreview(null);
    setStep('upload');
  }, [reset]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1100px] flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <Header />

      <div className="text-center">
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl dark:text-neutral-50">
          Import leads from any CSV
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-500 dark:text-neutral-400">
          Whatever the column names or layout, the AI maps it to the GrowEasy CRM schema, cleans the
          data, and enforces your rules.
        </p>
      </div>

      <Stepper current={step} />

      <div className="flex-1">
        {step === 'upload' && <UploadStep onFileSelected={handleFileSelected} />}

        {step === 'preview' && preview && file && (
          <PreviewStep
            preview={preview}
            fileName={file.name}
            onConfirm={handleConfirm}
            onBack={startOver}
          />
        )}

        {step === 'processing' && (
          <ProcessingStep state={state} onRetry={handleConfirm} onStartOver={startOver} />
        )}

        {step === 'results' && state.result && file && (
          <ResultsStep result={state.result} fileName={file.name} onStartOver={startOver} />
        )}
      </div>
    </main>
  );
}
