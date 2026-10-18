import { randomBytes } from 'node:crypto';
import { readConfig as realReadConfig } from '../../src/config.js';

export const testEnvironment = { JWT_SECRET: randomBytes(32).toString('base64url') };
export const readConfig = (environment = {}) => realReadConfig({ ...testEnvironment, ...environment });
