import {defineConfig} from '@playwright/test';
import smoke from './playwright.smoke.config';
export default defineConfig({...smoke,testMatch:['document-route.spec.ts','workspace-loading.spec.ts'],reporter:'list'});
