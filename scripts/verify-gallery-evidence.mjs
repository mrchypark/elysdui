import {readFile} from 'node:fs/promises';
import {currentRevision,expectedInventory} from './gallery-inventory.mjs';
import {validateGalleryEvidence} from './gallery-evidence.mjs';
const mode = process.argv[2];
if (!['live','static'].includes(mode)) throw Error('Usage: node scripts/verify-gallery-evidence.mjs live|static');
const report = JSON.parse(await readFile(new URL(`../test-results/gallery/${mode}-complete-report.json`, import.meta.url), 'utf8'));
const revision = currentRevision();
console.log(`Verified ${validateGalleryEvidence(report,{mode,revision,inventory:expectedInventory(mode)})} executed scoped cases and 3 detected browser mutations for ${revision}. Full contracts remain unverified.`);
