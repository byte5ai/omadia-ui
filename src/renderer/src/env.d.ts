/// <reference types="vite/client" />
import type { IdariaApi } from "../../shared/ipc";

declare global {
  interface Window {
    idaria: IdariaApi;
  }
}
