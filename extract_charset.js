const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const mianCode = fs.readFileSync('/tmp/mian_orig.js', 'utf8');

const html = '<!DOCTYPE html><html><head></head><body></body></html>';
const dom = new JSDOM(html, {
  url: 'https://www.itingshu.net/',
  runScripts: 'dangerously',
});

const window = dom.window;
const document = window.document;

// Add minimal globals needed
window.Math = Math;
window.setTimeout = setTimeout;
window.clearTimeout = clearTimeout;
window.setInterval = setInterval;
window.clearInterval = clearInterval;
window.decodeURIComponent = decodeURIComponent;
window.encodeURIComponent = encodeURIComponent;
window.RegExp = RegExp;
window.atob = function(str) { return Buffer.from(str, 'base64').toString('latin1'); };
window.$ = function() { return { on: function(){}, ready: function(f){f()}, attr: function(){return ""}, val: function(){return ""} }; };
window.$.ajax = function(){};

// Run the mian.js code
try {
  dom.window.eval(mianCode);
  
  // Now extract the charset from _0x9926ad
  // The function _0x9926ad should be defined globally
  console.log("_0x9926ad type:", typeof window._0x9926ad);
  
  // Try to access the charset through _0x9926ad's inner workings
  // Actually, let's call _0x9926ad with a known string and see the output
  // Since _0x9926ad shifts each char by 3, we can reverse-engineer the charset
  if (typeof window._0x9926ad === 'function') {
    // Test with simple patterns
    const testChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const output = window._0x9926ad(testChars);
    console.log("\nInput:", testChars);
    console.log("Output:", output);
    console.log("Output length:", output.length);
    console.log("Input length:", testChars.length);
    
    // The output wraps each char with random prefix+suffix, but the middle char is the shifted one
    // Let me extract just the middle chars
    let middleChars = '';
    for (let i = 0; i < output.length; i += 3) {
      middleChars += output[i+1];
    }
    console.log("\nMiddle chars (shifted):", middleChars);
    
    // Now extract the charset from observing the mapping
    // For each input char, find the corresponding middle char (which is input shifted by 3 positions in charset)
    const _0x9926ad = window._0x9926ad;
    
    // Try to run _0x9926ad with single char input
    for (let c of '09azAZ') {
      const out = _0x9926ad(c);
      console.log(`_0x9926ad('${c}') = '${out}' (middle: '${out[1]}')`);
    }
    
    // Test with the _c value from earlier
    const test_c = '9e23e653eb208145571a407c146af7';
    const computed_sp = _0x9926ad(test_c);
    console.log(`\n_c='${test_c}'`);
    console.log(`sp='${computed_sp}'`);
    console.log(`_c length: ${test_c.length}, sp length: ${computed_sp.length}`);
    
    // Test with current _c
    // Since _c changes each session, let me pass a specific value
  }
} catch(e) {
  console.error("Error:", e.message);
}
