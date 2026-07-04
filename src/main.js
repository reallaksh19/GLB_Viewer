import { createViewerApp } from '../js/pcf2glb/advanced/createViewerApp.js';
import {
  loadMockGlbUrl,
  loadMockPcfToGlbUrl,
  loadPcfTextToGlbUrl,
} from '../js/pcf2glb/pro-editor/core/mockLoader.js';
import { parsePcfText } from '../js/pcf2glb/pcf/parsePcfText.js';
import { normalizePcfModel } from '../js/pcf2glb/pcf/normalizePcfModel.js';

/**
 * Standalone GLB-PCF app adapter.
 * Inputs: local GLB, GLTF, or PCF files plus bundled sample data.
 * Outputs: an interactive Three.js viewport with selection, properties, layers,
 * section clipping, measurement, and debug logs. Fallback: errors are surfaced
 * in the status line and debug log instead of being swallowed.
 */

/** @typedef {{ minX: HTMLInputElement, maxX: HTMLInputElement, minY: HTMLInputElement, maxY: HTMLInputElement, minZ: HTMLInputElement, maxZ: HTMLInputElement }} ClipInputs */
/** @typedef {{ viewerApp: ReturnType<typeof createViewerApp>, selectedFile: File | null, objectUrls: string[], marqueeOn: boolean, measureOn: boolean, clipInputs: ClipInputs | null }} AppState */

const ACCEPTED_MODEL_FILE = /\.(glb|gltf|pcf)$/i;
const CLIP_AXIS_CONFIG = Object.freeze([
  ['minX', 'Min X'],
  ['maxX', 'Max X'],
  ['minY', 'Min Y'],
  ['maxY', 'Max Y'],
  ['minZ', 'Min Z'],
  ['maxZ', 'Max Z'],
]);

const elements = Object.freeze({
  canvas: requiredElement('viewer-canvas', HTMLElement),
  toolbar: requiredElement('viewer-toolbar', HTMLElement),
  propertyPanel: requiredElement('property-panel', HTMLElement),
  propertyContent: requiredElement('property-content', HTMLElement),
  closeProperties: requiredElement('close-properties', HTMLButtonElement),
  debugLogs: requiredElement('debug-logs', HTMLElement),
  fileInput: requiredElement('model-file', HTMLInputElement),
  fileDropZone: requiredElement('file-drop-zone', HTMLElement),
  fileName: requiredElement('file-name', HTMLElement),
  fileState: requiredElement('file-state', HTMLElement),
  loadFile: requiredElement('load-file', HTMLButtonElement),
  loadPcfSample: requiredElement('load-pcf-sample', HTMLButtonElement),
  loadGlbSample: requiredElement('load-glb-sample', HTMLButtonElement),
  fitScene: requiredElement('fit-scene', HTMLButtonElement),
  zoomSelected: requiredElement('zoom-selected', HTMLButtonElement),
  marqueeZoom: requiredElement('marquee-zoom', HTMLButtonElement),
  measureToggle: requiredElement('measure-toggle', HTMLButtonElement),
  measureReadout: requiredElement('measure-readout', HTMLElement),
  clipSliders: requiredElement('clip-sliders', HTMLElement),
  clipReset: requiredElement('clip-reset', HTMLButtonElement),
  layerPanelHost: requiredElement('layer-panel-host', HTMLElement),
  labelPanelHost: requiredElement('label-panel-host', HTMLElement),
  status: requiredElement('status', HTMLElement),
  clearLog: requiredElement('clear-log', HTMLButtonElement),
});

/** @type {AppState} */
const appState = {
  viewerApp: createViewerApp(
    elements.canvas,
    elements.toolbar,
    elements.propertyPanel,
    elements.propertyContent,
    elements.debugLogs,
    {
      labelPanelHost: elements.labelPanelHost,
      layerPanelHost: elements.layerPanelHost,
      onSceneLoaded: onSceneLoaded,
    }
  ),
  selectedFile: null,
  objectUrls: [],
  marqueeOn: false,
  measureOn: false,
  clipInputs: null,
};

renderClipSliders();
wireUi();
setStatus('Ready', 'neutral');

function requiredElement(id, ctor) {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Required element #${id} was not found or has the wrong type.`);
  }
  return element;
}

function wireUi() {
  elements.fileInput.addEventListener('change', onFileInputChanged);
  elements.loadFile.addEventListener('click', () => {
    void runAction('Load selected file', () => loadSelectedFile());
  });
  elements.loadPcfSample.addEventListener('click', () => {
    void runAction('Load PCF mock', () => loadPcfSample());
  });
  elements.loadGlbSample.addEventListener('click', () => {
    void runAction('Load GLB mock', () => loadGlbSample());
  });
  elements.fitScene.addEventListener('click', () => appState.viewerApp.fitAll());
  elements.zoomSelected.addEventListener('click', () => appState.viewerApp.zoomSelected());
  elements.marqueeZoom.addEventListener('click', toggleMarqueeZoom);
  elements.measureToggle.addEventListener('click', toggleMeasure);
  elements.closeProperties.addEventListener('click', () => {
    elements.propertyPanel.style.display = 'none';
  });
  elements.clipReset.addEventListener('click', () => {
    resetClipSliders();
    appState.viewerApp.resetSectionToModel();
  });
  elements.clearLog.addEventListener('click', () => {
    elements.debugLogs.replaceChildren();
  });
  elements.fileDropZone.addEventListener('dragover', onDragOver);
  elements.fileDropZone.addEventListener('dragleave', onDragLeave);
  elements.fileDropZone.addEventListener('drop', onFileDropped);
  window.addEventListener('beforeunload', revokeObjectUrls);
  appState.viewerApp.setMeasureStateListener(onMeasureStateChanged);
  appState.viewerApp.setMeasurementListener(onMeasurementChanged);
}

function onFileInputChanged() {
  const nextFile = elements.fileInput.files?.[0] || null;
  setSelectedFile(nextFile);
}

function onDragOver(event) {
  event.preventDefault();
  elements.fileDropZone.classList.add('is-dragging');
}

function onDragLeave() {
  elements.fileDropZone.classList.remove('is-dragging');
}

function onFileDropped(event) {
  event.preventDefault();
  elements.fileDropZone.classList.remove('is-dragging');
  const file = event.dataTransfer?.files?.[0] || null;
  if (!file) return;
  setSelectedFile(file);
}

function setSelectedFile(file) {
  if (file && !ACCEPTED_MODEL_FILE.test(file.name)) {
    setStatus(`Unsupported file type: ${file.name}`, 'error');
    elements.fileInput.value = '';
    appState.selectedFile = null;
    elements.fileName.textContent = 'GLB, GLTF, or PCF';
    elements.fileState.textContent = 'No file';
    elements.loadFile.disabled = true;
    return;
  }

  appState.selectedFile = file;
  elements.fileName.textContent = file?.name || 'GLB, GLTF, or PCF';
  elements.fileState.textContent = file ? 'Selected' : 'No file';
  elements.loadFile.disabled = !file;
  setStatus(file ? `Selected ${file.name}` : 'Ready', 'neutral');
}

async function runAction(label, action) {
  setBusy(true);
  setStatus(`${label}...`, 'busy');
  try {
    await action();
  } catch (error) {
    const message = errorMessage(error);
    setStatus(`${label} failed: ${message}`, 'error');
    logDebug('error', `${label} failed`, { message });
    console.error(`${label} failed`, error);
  } finally {
    setBusy(false);
  }
}

function setBusy(isBusy) {
  const buttons = [
    elements.loadFile,
    elements.loadPcfSample,
    elements.loadGlbSample,
    elements.fitScene,
    elements.zoomSelected,
  ];
  for (const button of buttons) button.disabled = isBusy || (button === elements.loadFile && !appState.selectedFile);
  document.body.classList.toggle('is-busy', isBusy);
}

async function loadSelectedFile() {
  const file = appState.selectedFile;
  if (!file) throw new Error('No file is selected.');

  if (/\.pcf$/i.test(file.name)) {
    const pcfText = await file.text();
    const annotationNodes = extractPcfAnnotationNodes(pcfText);
    const glbUrl = await loadPcfTextToGlbUrl(pcfText);
    trackObjectUrl(glbUrl);
    await loadGlbUrl(glbUrl, file.name);
    loadAnnotationNodes(annotationNodes);
    return;
  }

  const modelUrl = URL.createObjectURL(file);
  trackObjectUrl(modelUrl);
  await loadGlbUrl(modelUrl, file.name);
}

async function loadPcfSample() {
  const url = await loadMockPcfToGlbUrl();
  trackObjectUrl(url);
  await loadGlbUrl(url, 'mock_complex_piping.pcf');
}

async function loadGlbSample() {
  const url = await loadMockGlbUrl();
  trackObjectUrl(url);
  await loadGlbUrl(url, 'generated mock GLB');
}

async function loadGlbUrl(url, label) {
  await appState.viewerApp.loadGLB(url);
  appState.viewerApp.fitAll();
  resetClipSliders();
  setStatus(`Loaded ${label}`, 'success');
}

function extractPcfAnnotationNodes(pcfText) {
  try {
    const parsed = parsePcfText(pcfText, null);
    const model = normalizePcfModel(parsed, null);
    const circleNodes = model.components
      .filter((component) => component.type === 'MESSAGE-CIRCLE' && component.circleCoord && component.circleText)
      .map((component) => ({ pos: component.circleCoord, text: component.circleText }));
    const squareNodes = model.components
      .filter((component) => component.type === 'MESSAGE-SQUARE' && component.squarePos && component.squareText)
      .map((component) => ({ pos: component.squarePos, text: component.squareText }));
    return { circleNodes, squareNodes };
  } catch (error) {
    logDebug('warn', 'PCF annotation extraction failed', { message: errorMessage(error) });
    return { circleNodes: [], squareNodes: [] };
  }
}

function loadAnnotationNodes(annotationNodes) {
  if (annotationNodes.squareNodes.length && typeof appState.viewerApp.loadMessageSquareNodes === 'function') {
    appState.viewerApp.loadMessageSquareNodes(annotationNodes.squareNodes);
  }
}

function toggleMarqueeZoom() {
  appState.marqueeOn = !appState.marqueeOn;
  appState.viewerApp.setMarqueeZoom(appState.marqueeOn);
  elements.marqueeZoom.setAttribute('aria-pressed', String(appState.marqueeOn));
  elements.marqueeZoom.classList.toggle('is-active', appState.marqueeOn);
  setStatus(appState.marqueeOn ? 'Marquee zoom armed' : 'Marquee zoom off', 'neutral');
}

function toggleMeasure() {
  appState.measureOn = !appState.measureOn;
  appState.viewerApp.setMeasureEnabled(appState.measureOn);
}

function onMeasureStateChanged(enabled) {
  appState.measureOn = Boolean(enabled);
  elements.measureToggle.setAttribute('aria-pressed', String(appState.measureOn));
  elements.measureToggle.classList.toggle('is-active', appState.measureOn);
  if (!appState.measureOn) elements.measureReadout.textContent = 'Measure off';
}

function onMeasurementChanged(info) {
  if (!appState.measureOn) {
    elements.measureReadout.textContent = 'Measure off';
    return;
  }
  if (!info) {
    elements.measureReadout.textContent = 'Select a component';
    return;
  }
  elements.measureReadout.textContent = [
    info.id || 'Selection',
    `W ${formatMm(info.width)}`,
    `H ${formatMm(info.height)}`,
    `D ${formatMm(info.depth)}`,
    `Diag ${formatMm(info.diagonal)}`,
  ].join(' | ');
}

function renderClipSliders() {
  const inputs = {};
  const fragment = document.createDocumentFragment();
  for (const [id, label] of CLIP_AXIS_CONFIG) {
    const row = document.createElement('label');
    row.className = 'clip-row';
    row.htmlFor = id;
    const text = document.createElement('span');
    text.textContent = label;
    const value = document.createElement('output');
    value.value = id.startsWith('min') ? '0%' : '100%';
    const input = document.createElement('input');
    input.id = id;
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = id.startsWith('min') ? '0' : '100';
    input.addEventListener('input', () => {
      value.value = `${input.value}%`;
      applyClipSliders();
    });
    row.append(text, input, value);
    fragment.appendChild(row);
    inputs[id] = input;
  }
  elements.clipSliders.replaceChildren(fragment);
  appState.clipInputs = /** @type {ClipInputs} */ (inputs);
}

function resetClipSliders() {
  if (!appState.clipInputs) return;
  for (const [id] of CLIP_AXIS_CONFIG) {
    const input = appState.clipInputs[id];
    input.value = id.startsWith('min') ? '0' : '100';
    const output = input.parentElement?.querySelector('output');
    if (output instanceof HTMLOutputElement) output.value = `${input.value}%`;
  }
  elements.clipSliders.setAttribute('aria-disabled', appState.viewerApp.getCurrentRoot() ? 'false' : 'true');
}

function applyClipSliders() {
  const bounds = appState.viewerApp.getModelBounds();
  const inputs = appState.clipInputs;
  if (!bounds || !inputs) return;

  const minX = percent(inputs.minX);
  const maxX = percent(inputs.maxX);
  const minY = percent(inputs.minY);
  const maxY = percent(inputs.maxY);
  const minZ = percent(inputs.minZ);
  const maxZ = percent(inputs.maxZ);
  if (minX > maxX || minY > maxY || minZ > maxZ) {
    setStatus('Clip min cannot exceed clip max.', 'error');
    return;
  }

  const spanX = bounds.max.x - bounds.min.x;
  const spanY = bounds.max.y - bounds.min.y;
  const spanZ = bounds.max.z - bounds.min.z;
  appState.viewerApp.setSectionClipBounds({
    minX: bounds.min.x + spanX * minX,
    maxX: bounds.min.x + spanX * maxX,
    minY: bounds.min.y + spanY * minY,
    maxY: bounds.min.y + spanY * maxY,
    minZ: bounds.min.z + spanZ * minZ,
    maxZ: bounds.min.z + spanZ * maxZ,
  });
}

function percent(input) {
  return Number(input.value) / 100;
}

function onSceneLoaded() {
  elements.clipSliders.setAttribute('aria-disabled', 'false');
  appState.viewerApp.resize();
}

function trackObjectUrl(url) {
  if (/^blob:/i.test(url)) appState.objectUrls.push(url);
}

function revokeObjectUrls() {
  for (const url of appState.objectUrls.splice(0)) {
    URL.revokeObjectURL(url);
  }
}

function setStatus(message, tone) {
  elements.status.textContent = message;
  elements.status.dataset.tone = tone;
}

function logDebug(level, message, payload) {
  const row = document.createElement('div');
  row.className = `debug-row debug-row-${level}`;
  row.textContent = payload ? `${message}: ${JSON.stringify(payload)}` : message;
  elements.debugLogs.appendChild(row);
  elements.debugLogs.scrollTop = elements.debugLogs.scrollHeight;
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function formatMm(value) {
  return `${Number(value || 0).toFixed(1)} mm`;
}
