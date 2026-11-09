/// <reference types="vite/client" />
import { ElectronAPI } from './types/electron';

interface Window {
    electronAPI: ElectronAPI
}


/// <reference types="vite/client" />

declare module 'rehype-katex' {
  const rehypeKatex: any;
  export default rehypeKatex;
}

declare module 'remark-math' {
  const remarkMath: any;
  export default remarkMath;
}