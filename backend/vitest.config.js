import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      JWT_SECRET: 'test-jwt-secret-not-for-production',
      MEDIA_DRIVER: 'local',
      UPLOADS_DIR: '.tmp-test-uploads',
      ALLOW_REGISTRATION: 'open',
    },
  },
});
