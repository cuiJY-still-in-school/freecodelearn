const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const mianCode = fs.readFileSync('/tmp/mian_orig.js', 'utf8');

const html = '<!DOCTYPE html><html><head></head><body></body></html>';
const dom = new JSDOM(html, {
  url: 'https://www.itingshu.net/play/31494_1_171863.html',
  referrer: 'https://www.itingshu.net/',
  contentType: 'text/html',
  userAgent: 'Mozilla/5.0',
  runScripts: 'dangerously',
});

const window = dom.window;
const document = window.document;

// Add the meta tags
const metaB = document.createElement('meta');
metaB.name = '_b';
metaB.content = 'udLoJe';
document.head.appendChild(metaB);

const metaP = document.createElement('meta');
metaP.name = '_p';
metaP.content = 'UBuhLsGd';
document.head.appendChild(metaP);

const metaC = document.createElement('meta');
metaC.name = '_c';
metaC.content = 'b09d57b3aa25843d51742d7f1b57c2';
document.head.appendChild(metaC);

// Load jQuery in the window context
dom.window.eval(`
  // We'll use the built-in jQuery approach
  // First, define what we need
  var _capturedAjax = null;
  var _originalAjax = null;
`);

// Now inject jQuery via a script tag
const jqScript = document.createElement('script');
jqScript.textContent = fs.readFileSync('/home/jayson2013/node_modules/jquery/dist/jquery.min.js', 'utf8');
document.body.appendChild(jqScript);

// Monkey-patch $.ajax AFTER jQuery is loaded
dom.window.eval(`
  _originalAjax = $.ajax;
  $.ajax = function(opts) {
    console.log("=== AJAX CALL CAPTURED ===");
    console.log("URL: " + opts.url);
    console.log("Method: " + (opts.type || 'GET'));
    console.log("Data: " + JSON.stringify(opts.data));
    console.log("Headers: " + JSON.stringify(opts.headers));
    console.log("DataType: " + opts.dataType);
    
    _capturedAjax = opts;
    return { done: function() {}, fail: function() {} };
  };
`);

// Run the mian.js code
const mianScript = document.createElement('script');
mianScript.textContent = mianCode;
document.body.appendChild(mianScript);

// Wait and check
setTimeout(() => {
  console.log("\n=== Captured Ajax config ===");
  const ajax = dom.window._capturedAjax;
  if (ajax) {
    console.log("URL:", ajax.url);
    console.log("Data:", JSON.stringify(ajax.data));
    console.log("Headers:", JSON.stringify(ajax.headers));
  } else {
    console.log("No AJAX call was captured. jQuery might not have been loaded properly.");
    console.log("jQuery defined:", typeof dom.window.$ !== 'undefined');
    console.log("$ function:", typeof dom.window.$);
  }
  process.exit(0);
}, 5000);
