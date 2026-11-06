import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Expo Router (SDK 58) bundles routes from <project>/app. Routes anywhere else ship as an empty app ("No routes found").
const projectRoot = join(__dirname, '..', '..');

test('every screen lives in the app/ routes folder', () => {
  expect(readdirSync(join(projectRoot, 'app')).sort()).toEqual(
    ['_layout.tsx', 'image.tsx', 'index.tsx', 'spotify.tsx', 'video.tsx', 'youtube.tsx'],
  );
});

test('there is no src/app folder for the router to miss', () => {
  expect(existsSync(join(projectRoot, 'src', 'app'))).toBe(false);
});
