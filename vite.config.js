import { defineConfig } from 'vite';
export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: false,
        minify: 'esbuild',
        rollupOptions: {
            output: {
                manualChunks: {
                    vendor: ['ws'],
                },
            },
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: false,
        open: true,
    },
    preview: {
        host: '0.0.0.0',
        port: 4173,
        strictPort: false,
        open: true,
    },
    assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.ico'],
    resolve: {
        alias: {
            '@': '/src',
        },
    },
    publicDir: 'public',
    envPrefix: 'VITE_',
    optimizeDeps: {
        include: [],
    },
});
