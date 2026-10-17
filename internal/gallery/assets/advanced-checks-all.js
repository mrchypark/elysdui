import {executeRegisteredCheck,assert,waitFor} from './advanced-checks.js';
// Test-only gallery hook shares the exact versioned module registry used below.
globalThis.elyGalleryAudit=Object.freeze({executeRegisteredCheck,assert,waitFor});
import './advanced-foundation-checks.js';
import './advanced-interaction-checks.js';
import './advanced-data-checks.js';
import './advanced-workspace-checks.js';
import './advanced-communication-checks.js';
import './advanced-native-checks.js';
import './advanced-native-tooling-checks.js';
import './advanced-forms-checks.js';
