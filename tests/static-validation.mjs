import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Static standalone validation.
 * Inputs: index.html plus every local JS import and URL reference.
 * Outputs: process success when all local files resolve inside this app root.
 * Fallback: failures throw with the missing path and importing context.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedBareImports = new Set(['three']);
const allowedBarePrefixes = ['three/addons/'];
const importPattern = /(?:import\s+(?:[^'"()]+?\s+from\s+)?|export\s+[^'"()]+?\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;
const newUrlPattern = /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;

function readFile(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function stripReference(value) {
  return String(value || '').split('?')[0].split('#')[0];
}

function isExternal(value) {
  return /^(https?:|data:|blob:|#|\/\/)/i.test(value);
}

function isBare(value) {
  return !value.startsWith('.') && !value.startsWith('/');
}

function assertInside(absPath, context) {
  const relPath = path.relative(root, absPath);
  if (relPath.startsWith('..') || path.isAbsolute(relPath)) {
    throw new Error(`${context} escapes app root: ${relPath}`);
  }
  return relPath.replace(/\\/g, '/');
}

function assertLocalRefExists(fromRelPath, specifier, context) {
  const clean = stripReference(specifier);
  if (!clean || isExternal(clean)) return;

  if (isBare(clean)) {
    const allowed = allowedBareImports.has(clean) || allowedBarePrefixes.some((prefix) => clean.startsWith(prefix));
    if (!allowed) throw new Error(`${context} uses unexpected bare import: ${clean}`);
    return;
  }

  const fromDir = path.dirname(path.join(root, fromRelPath));
  let absPath = clean.startsWith('/')
    ? path.join(root, clean.slice(1))
    : path.resolve(fromDir, clean);
  if (!path.extname(absPath) && fs.existsSync(`${absPath}.js`)) absPath = `${absPath}.js`;
  const relPath = assertInside(absPath, context);
  if (!fs.existsSync(absPath)) throw new Error(`${context} target is missing: ${relPath}`);
}

function walk(dirRelPath) {
  const dirPath = path.join(root, dirRelPath);
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const relPath = path.join(dirRelPath, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) files.push(...walk(relPath));
    if (entry.isFile()) files.push(relPath);
  }
  return files;
}

const index = readFile('index.html');
for (const match of index.matchAll(/<(?:script|link|img)\s+[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/g)) {
  assertLocalRefExists('index.html', match[1], 'index asset');
}

for (const jsFile of walk('').filter((file) => /\.(js|mjs)$/.test(file) && !file.startsWith('tests/'))) {
  const text = readFile(jsFile);
  for (const match of text.matchAll(importPattern)) assertLocalRefExists(jsFile, match[1], `${jsFile} import`);
  for (const match of text.matchAll(newUrlPattern)) assertLocalRefExists(jsFile, match[1], `${jsFile} URL`);
}

const requiredRuntimeFiles = [
  'js/pcf2glb/advanced/createViewerApp.js',
  'js/pcf2glb/pro-editor/core/mockLoader.js',
  'js/pcf2glb/glb/buildExportScene.js',
  'data/mocks/mock_complex_piping.pcf',
  'benchmarks/bm-cii/BM_CII_LINE_NO_sideload.json',
];

for (const file of requiredRuntimeFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Required runtime file missing: ${file}`);
}

console.log('Standalone GLB-PCF static validation passed.');
