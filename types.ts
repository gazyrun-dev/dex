
export type Theme = 'light' | 'dark';
export type Mode = 'vector' | 'matrix';
export type OutputStatus = 'pending' | 'generating' | 'complete' | 'error';

export interface UploadedImage {
  id: number;
  file: File;
  base64Data: string;
}

export interface Prompt {
  id: number;
  title: string;
  text: string;
}

export interface Output {
  id: number;
  sourceImageId: number;
  promptId: number; // -1 for vector mode
  imageUrl: string | null;
  status: OutputStatus;
  error: string | null;
}
