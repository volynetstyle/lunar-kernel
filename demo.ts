import { readFileSync } from 'node:fs';
import { createLunarCalendar } from './src/api.ts';

const lunar = createLunarCalendar(readFileSync(new URL('./data/phases-2001-2100.lph', import.meta.url)));
console.log(lunar.at('2026-11-11T12:00:00Z'));
