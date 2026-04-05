import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Plugin to remove type="module" and crossorigin from script tags
// and wrap inline scripts in HTML comments to prevent GAS XML parser errors.
const removeModuleTypePlugin = () => {
  return {
    name: 'remove-module-type',
    enforce: 'post' as const,
    generateBundle(_: any, bundle: any) {
      for (const fileName in bundle) {
        if (fileName.endsWith('.html')) {
          const chunk = bundle[fileName];
          if (chunk.type === 'asset' && typeof chunk.source === 'string') {
            // Wrap inline script content in <!-- --> to protect from GAS XML parser
            // Only match the script tag injected by Vite to avoid matching strings in JS
            chunk.source = chunk.source.replace(/<script type="module" crossorigin>([\s\S]*?)<\/script>/g, '<script>\n/*<!--*/\n$1\n/*-->*/\n</script>');
            // Also handle cases where crossorigin might be missing or in different order
            chunk.source = chunk.source.replace(/<script type="module">([\s\S]*?)<\/script>/g, '<script>\n/*<!--*/\n$1\n/*-->*/\n</script>');
            // Remove any remaining type="module" or crossorigin from script tags
            chunk.source = chunk.source.replace(/<script type="module" crossorigin/g, '<script');
            chunk.source = chunk.source.replace(/<script type="module"/g, '<script');
            chunk.source = chunk.source.replace(/ crossorigin/g, '');
            // We do not wrap <style> tags because GAS XML parser handles CSS fine,
            // and wrapping it with regex can corrupt the file if the JS contains "<style>" strings.
          }
        }
      }
    }
  };
};

// Plugin to inject CDN links only in production
const injectCdnPlugin = () => {
  return {
    name: 'inject-cdn',
    transformIndexHtml(html: string, ctx: any) {
      if (ctx.bundle) {
        const cdnLinks = `
    <script src="https://unpkg.com/react@19/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@19/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <script src="https://unpkg.com/lucide-react@latest"></script>
    <script src="https://unpkg.com/framer-motion@11/dist/framer-motion.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        `;
        return html.replace('<!-- CDN_LINKS -->', cdnLinks);
      }
      return html.replace('<!-- CDN_LINKS -->', '');
    }
  };
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const isGas = mode === 'gas';
  
  return {
    plugins: [
      react(), 
      tailwindcss(), 
      isGas && viteSingleFile(), 
      isGas && removeModuleTypePlugin(), 
      isGas && injectCdnPlugin()
    ].filter(Boolean),
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    build: {
      minify: true,
      rollupOptions: {
        external: isGas ? ['html2pdf.js', 'jspdf', 'html2canvas', 'react', 'react-dom', 'lucide-react', 'motion/react', 'framer-motion'] : [],
        output: {
          globals: isGas ? {
            'html2pdf.js': 'html2pdf',
            'jspdf': 'jspdf',
            'html2canvas': 'html2canvas',
            'react': 'React',
            'react-dom': 'ReactDOM',
            'lucide-react': 'LucideReact',
            'motion/react': 'Motion',
            'framer-motion': 'Motion'
          } : {}
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
