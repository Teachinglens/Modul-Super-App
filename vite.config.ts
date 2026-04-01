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
            chunk.source = chunk.source.replace(/<script type="module" crossorigin>([\s\S]*?)<\/script>/g, '<script type="module">\n/*<!--*/\n$1\n/*-->*/\n</script>');
            // Also remove type="module" crossorigin if it wasn't matched above (e.g. empty script)
            chunk.source = chunk.source.replace(/<script type="module" crossorigin/g, '<script type="module"');
            // We do not wrap <style> tags because GAS XML parser handles CSS fine,
            // and wrapping it with regex can corrupt the file if the JS contains "<style>" strings.
          }
        }
      }
    }
  };
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), viteSingleFile(), removeModuleTypePlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    build: {
      minify: true, // Re-enable minification to reduce file size below GAS limits
      rollupOptions: {
        external: ['html2pdf.js', 'jspdf', 'html2canvas', 'react', 'react-dom', 'lucide-react', 'motion'],
        output: {
          globals: {
            'html2pdf.js': 'html2pdf',
            'jspdf': 'jspdf',
            'html2canvas': 'html2canvas',
            'react': 'React',
            'react-dom': 'ReactDOM',
            'lucide-react': 'lucide',
            'motion': 'Motion'
          }
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
