const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const websiteFiles = [
  'src/routes/index.tsx',
  'src/routes/about.tsx',
  'src/routes/contact.tsx',
  'src/routes/download.tsx',
  'src/routes/faq.tsx',
  'src/routes/features.tsx',
  'src/routes/guide.tsx',
  'src/routes/hardware.tsx',
  'src/routes/industries.tsx',
  'src/routes/integrations.tsx',
  'src/routes/pricing.tsx',
  'src/routes/security.tsx',
  'src/routes/status.tsx',
  'src/routes/support.tsx',
  'src/routes/trust.tsx',
  'src/routes/legal.index.tsx',
  'src/routes/privacy.tsx',
  'src/routes/auth.tsx',
  'src/routes/admin.auth.tsx',
  'src/routes/__root.tsx',
  'src/components/auth/AuthTrustPanel.tsx',
  'src/components/marketing/MarketingShell.tsx',
  'src/components/marketing/CookieConsent.tsx',
  'src/components/marketing/WebsiteLiveChat.tsx',
];

const combined = websiteFiles.map((file) => `\n/* ${file} */\n${source(file)}`).join('\n');

const banned = [
  [/\bbg-gradient(?:-to-[a-z]+)?\b|\b(?:linear|radial)-gradient\s*\(/i, 'decorative gradients'],
  [/\bbackdrop-blur(?:-[\w\[\]./-]+)?\b|backdrop-filter\s*:/i, 'frosted-glass blur'],
  [/\bblur-(?:2xl|3xl)\b/i, 'glowing halo blur'],
  [/\bbg-clip-text\b|\btext-transparent\b/i, 'gradient-text plumbing'],
  [/\bfont-serif\b|\bitalic\b/i, 'serif/italic marketing treatment'],
  [/\b(?:introducing|supercharge)\b|10M\+/i, 'AI-template marketing copy'],
  [/\bnumber\s*:\s*["']0[1-9]["']/i, 'numbered 01/02 card labels'],
];

for (const [pattern, label] of banned) {
  assert.doesNotMatch(combined, pattern, `Website still contains ${label}`);
}

const styles = source('src/styles.css');
assert.match(styles, /--font-sans:\s*ui-sans-serif,\s*system-ui/i, 'SEZA should use the native system UI font stack');
assert.doesNotMatch(styles, /\bInter\b/i, 'Inter should not be forced globally');

const runtime = source('src/components/runtime/OperationalRuntime.tsx');
assert.match(runtime, /PaymentTestModeBanner/, 'Stripe test-mode banner must remain visible while billing is sandboxed');

const adminAuth = source('src/routes/admin.auth.tsx');
assert.match(adminAuth, /max-w-md flex-col/, 'Admin sign-in must keep the form and trust note in one mobile column');

const trust = source('src/components/auth/AuthTrustPanel.tsx');
assert.doesNotMatch(trust, /bg-emerald|rounded-(?:xl|2xl|3xl)/, 'Credential trust guidance must stay a simple note, not a colored card');
assert.match(trust, /admin\.sezapos\.com/);
assert.match(trust, /dashboard\.sezapos\.com/);

const viewer = source('src/components/support/AdminScreenViewer.tsx');
assert.doesNotMatch(viewer, /status === ["']connected["']\s*&&\s*["'][^"']*animate-pulse/, 'Connected status should not use a pulsing green dot');

console.log(`PASS website visual cleanup (${websiteFiles.length} files checked)`);
