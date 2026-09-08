import { defineConfig } from '@tarojs/cli';

export default defineConfig({
  projectName: 'caau-miniapp',
  date: '2026-09-08',
  designWidth: 750,
  deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: 'webpack5',
  plugins: ['@tarojs/plugin-platform-weapp'],
  cache: { enable: false },
  defineConstants: {
    __API_BASE_URL__: JSON.stringify(
      process.env.TARO_APP_API_BASE_URL || 'http://127.0.0.1:3000',
    ),
  },
  mini: {
    postcss: {
      pxtransform: { enable: true },
      cssModules: { enable: false },
    },
  },
});
