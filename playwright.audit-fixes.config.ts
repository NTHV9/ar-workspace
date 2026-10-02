import {defineConfig} from '@playwright/test';
import smoke from './playwright.smoke.config';
export default defineConfig({...smoke,testMatch:['idle-publication.spec.ts','workspace-loading.spec.ts','live-errors.spec.ts','aging-continuous.spec.ts'],reporter:'list'});
