import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  use: {
    headless: false,
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 0,
    //screenshot: 'only-on-failure',
    //video: 'retain-on-failure'
  },
  //reporter: [['list'], ['html']],
});
