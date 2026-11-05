/// <reference types="vite/client" />
import type { OmadiaApi } from "../../shared/ipc";

declare global {
  interface Window {
    omadia: OmadiaApi;
  }
}
