import type { OmadiaCanvasApi } from '../../shared/ipc.js';

declare global {
  interface Window {
    omadiaCanvas: OmadiaCanvasApi;
  }
}
export {};
