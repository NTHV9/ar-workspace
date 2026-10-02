import {defineConfig} from '@playwright/test';import smoke from './playwright.smoke.config';export default defineConfig({...smoke,testMatch:['cfo-dashboard.spec.ts'],reporter:'list'});
