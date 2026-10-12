import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // "Today" is the browser's local date; pin the zone so tests agree.
    env: { TZ: 'America/Los_Angeles' },
  },
});
