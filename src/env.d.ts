/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __OCR_VERSION__: string;
/** PROTOTYPE (branch prototype/pp-ocrv6): onnxruntime-web's version, which names its self-hosted .wasm. */
declare const __ORT_VERSION__: string;

interface LaunchParams {
  readonly files: readonly FileSystemFileHandle[];
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

interface Window {
  launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void };
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}
