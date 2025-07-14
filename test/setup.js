// Setup for Node.js environment to run OSMD
// Based on opensheetmusicdisplay/test/Util/generateImages_browserless.mjs

import jsdom from "jsdom";
import Blob from "cross-blob";

// Set up JSDOM first
const dom = new jsdom.JSDOM("<!DOCTYPE html></html>");

// Set up global browser environment
global.window = dom.window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;
global.HTMLAnchorElement = window.HTMLAnchorElement;
global.XMLHttpRequest = window.XMLHttpRequest;
global.DOMParser = window.DOMParser;
global.Node = window.Node;
global.XMLSerializer = window.XMLSerializer;

// Set up Blob
global.Blob = Blob;

// Create a test container div
const div = document.createElement("div");
div.id = "osmd-container";
document.body.appendChild(div);

// Mock offsetWidth and offsetHeight for containers
Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
  get() { 
    return this.style?.width ? parseInt(this.style.width) : 1280; 
  }
});

Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
  get() { 
    return this.style?.height ? parseInt(this.style.height) : 720; 
  }
});

// Setup canvas support for PNG generation (optional for basic tests)
try {
  const { Canvas } = await import('canvas');
  global.Canvas = Canvas;
  global.HTMLCanvasElement = Canvas;
} catch (error) {
  console.warn('Canvas package not available for PNG support');
}