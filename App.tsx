
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Theme, Mode, UploadedImage, Prompt, Output } from './types';
import { generateImageEdit } from './services/geminiService';
import Header from './components/Header';
import ModeSelector from './components/ModeSelector';
import ImageUploader from './components/ImageUploader';
import PromptSection from './components/PromptSection';
import ActionControls from './components/ActionControls';
import OutputDisplay from './components/OutputDisplay';
import Footer from './components/Footer';

const API_CONCURRENCY_LIMIT = 2;

const App: React.FC = () => {
    const [theme, setTheme] = useState<Theme>('light');
    const [currentMode, setCurrentMode] = useState<Mode>('vector');
    const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [vectorPrompt, setVectorPrompt] = useState<string>('');
    const [outputs, setOutputs] = useState<Output[]>([]);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);

    const nextId = useRef(0);
    const processingIds = useRef(new Set<number>());

    useEffect(() => {
        const savedTheme = localStorage.getItem('drexbanana-theme') as Theme;
        if (savedTheme) {
            setTheme(savedTheme);
        }
    }, []);

    useEffect(() => {
        document.body.className = `${theme}-mode antialiased`;
        localStorage.setItem('drexbanana-theme', theme);
    }, [theme]);

    const handleGenerate = () => {
        if (isGenerating || uploadedImages.length === 0) return;

        const isVectorReady = currentMode === 'vector' && vectorPrompt.trim() !== '';
        const isMatrixReady = currentMode === 'matrix' && prompts.length > 0;

        if (!isVectorReady && !isMatrixReady) {
            alert("Please add at least one image and one prompt.");
            return;
        }

        const promptsToUse = currentMode === 'vector' ? [{ id: -1, title: 'Vector', text: vectorPrompt }] : prompts;
        const newOutputs: Output[] = [];

        for (const image of uploadedImages) {
            for (const prompt of promptsToUse) {
                newOutputs.push({
                    id: nextId.current++,
                    sourceImageId: image.id,
                    promptId: prompt.id,
                    imageUrl: null,
                    status: 'pending',
                    error: null,
                });
            }
        }
        setOutputs(newOutputs);
        setIsGenerating(true);
    };

    const handleCancel = () => {
        setIsGenerating(false);
        setOutputs(prevOutputs =>
            prevOutputs.map(o =>
                o.status === 'pending' || o.status === 'generating'
                    ? { ...o, status: 'error', error: 'Cancelled by user.' }
                    : o
            )
        );
        processingIds.current.clear();
    };

    useEffect(() => {
        if (!isGenerating) {
            return;
        }

        const pendingOutputs = outputs.filter(
            o => o.status === 'pending' && !processingIds.current.has(o.id)
        );

        const availableSlots = API_CONCURRENCY_LIMIT - processingIds.current.size;
        const itemsToProcess = pendingOutputs.slice(0, availableSlots);

        if (itemsToProcess.length === 0 && processingIds.current.size === 0) {
            const hasPending = outputs.some(o => o.status === 'pending');
            if(!hasPending) setIsGenerating(false);
            return;
        }

        itemsToProcess.forEach(outputToProcess => {
            processingIds.current.add(outputToProcess.id);

            setOutputs(prev => prev.map(o =>
                o.id === outputToProcess.id ? { ...o, status: 'generating' } : o
            ));

            const runGeneration = async () => {
                const sourceImage = uploadedImages.find(i => i.id === outputToProcess.sourceImageId);
                const promptText = currentMode === 'vector'
                    ? vectorPrompt
                    : prompts.find(p => p.id === outputToProcess.promptId)?.text || '';

                if (!sourceImage || !promptText) {
                    setOutputs(prev => prev.map(o =>
                        o.id === outputToProcess.id ? { ...o, status: 'error', error: 'Missing image or prompt.' } : o
                    ));
                    processingIds.current.delete(outputToProcess.id);
                    return;
                }

                try {
                    const imageUrl = await generateImageEdit(sourceImage.base64Data, promptText);
                    setOutputs(prev => prev.map(o =>
                        o.id === outputToProcess.id && o.status === 'generating'
                            ? { ...o, status: 'complete', imageUrl, error: null }
                            : o
                    ));
                } catch (error) {
                    setOutputs(prev => prev.map(o =>
                        o.id === outputToProcess.id
                            ? { ...o, status: 'error', error: (error as Error).message }
                            : o
                    ));
                } finally {
                    processingIds.current.delete(outputToProcess.id);
                }
            };
            runGeneration();
        });
    }, [outputs, isGenerating, uploadedImages, prompts, vectorPrompt, currentMode]);

    const handleFilesSelected = (files: File[]) => {
        files.forEach(file => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64Data = (reader.result as string).split(',')[1];
                setUploadedImages(prev => [...prev, { id: nextId.current++, file, base64Data }]);
            };
        });
    };

    const handleClearUploads = () => {
        setUploadedImages([]);
        setOutputs([]);
    };

    const handleRemoveUpload = (id: number) => {
        setUploadedImages(prev => prev.filter(img => img.id !== id));
    };

    const handleAddPrompt = (title: string, text: string) => {
        setPrompts(prev => [...prev, { id: nextId.current++, title, text }]);
    };

    const handleRemovePrompt = (id: number) => {
        setPrompts(prev => prev.filter(p => p.id !== id));
    };

    const handleRegenerate = (id: number) => {
        setOutputs(prev => prev.map(o => o.id === id ? { ...o, status: 'pending', imageUrl: null, error: null } : o));
        if (!isGenerating) {
            setIsGenerating(true);
        }
    };
    
    const handleModeChange = useCallback((mode: Mode) => {
        setCurrentMode(mode);
        setOutputs([]);
    }, []);

    return (
        <div className="max-w-md mx-auto p-4 space-y-6">
            <Header theme={theme} onThemeToggle={() => setTheme(t => t === 'light' ? 'dark' : 'light')} />
            <ModeSelector currentMode={currentMode} onModeChange={handleModeChange} />
            <ImageUploader
                images={uploadedImages}
                onFilesSelected={handleFilesSelected}
                onClear={handleClearUploads}
                onRemove={handleRemoveUpload}
            />
            <PromptSection
                mode={currentMode}
                vectorPrompt={vectorPrompt}
                onVectorPromptChange={setVectorPrompt}
                matrixPrompts={prompts}
                onAddMatrixPrompt={handleAddPrompt}
                onRemoveMatrixPrompt={handleRemovePrompt}
            />
            <ActionControls
                isGenerating={isGenerating}
                outputs={outputs}
                onGenerate={handleGenerate}
                onCancel={handleCancel}
            />
            <OutputDisplay
                outputs={outputs}
                prompts={prompts}
                mode={currentMode}
                onRegenerate={handleRegenerate}
                isGenerating={isGenerating}
            />
            <Footer />
        </div>
    );
};

export default App;
