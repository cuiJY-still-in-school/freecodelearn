const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

// Read the real play page HTML
const pageHtml = fs.readFileSync('/tmp/real_play_page.html', 'utf8');

const dom = new JSDOM(pageHtml, {
  url: 'https://www.itingshu.net/play/31494_1_171863.html',
  referrer: 'https://www.itingshu.net/',
  contentType: 'text/html',
  userAgent: 'Mozilla/5.0',
  runScripts: 'dangerously',
  resources: 'usable',
});

const window = dom.window;
const document = window.document;

// Patch setTimeout to not actually wait
const origSetTimeout = window.setTimeout;
window.setTimeout = function(fn, ms) {
  // Don't actually wait - call immediately for our analysis
  // But skip if it's the 50ms reload
  if (ms <= 50) return origSetTimeout(fn, 50); // let rapid reloads execute
  return origSetTimeout(fn, 10); // speed up
};

// Patch location.reload to not actually reload
window.location.reload = function() {
  console.log("(location.reload suppressed)");
};

// Monkey-patch $.ajax to capture the call
window._capturedAjax = null;
window._ajaxCalls = [];

// Wait for page to load, then check
dom.window.addEventListener('load', () => {
  console.log("Page loaded. DOM ready state:", document.readyState);
  
  // Check if jQuery loaded and if AJAX was called
  setTimeout(() => {
    console.log("\n=== Checking for AJAX calls ===");
    const ajax = window._capturedAjax;
    if (ajax) {
      console.log("URL:", ajax.url);
      console.log("Method:", ajax.type || 'GET');
      console.log("Data:", JSON.stringify(ajax.data));
      console.log("Headers:", JSON.stringify(ajax.headers));
    } else {
      console.log("No AJAX captured. jQuery:", typeof window.$);
      console.log("jPlayer:", typeof window.$.jPlayer);
      if (window.$) {
        console.log("$.fn:", Object.keys(window.$.fn).slice(0, 20));
      }
    }
    console.log("\nAll AJAX calls:", window._ajaxCalls);
    
    // Try to manually trigger
    console.log("\n=== Checking meta tags ===");
    console.log("_b:", $('meta[name="_b"]').attr('content'));
    console.log("_p:", $('meta[name="_p"]').attr('content'));
    console.log("_c:", $('meta[name="_c"]').attr('content'));
    
    // Check what the page URL is
    console.log("\nURL:", window.location.href);
    
    process.exit(0);
  }, 2000);
});

// Patch $.ajax after jQuery loads
// We need to detect when jQuery is available
const checkJquery = setInterval(() => {
  if (window.$ && window.$.ajax) {
    clearInterval(checkJquery);
    console.log("jQuery detected, patching ajax...");
    const origAjax = window.$.ajax;
    window.$.ajax = function(opts) {
      console.log("=== AJAX CALL ===");
      console.log("URL:", opts.url);
      console.log("Method:", opts.type || 'GET');
      console.log("Data:", JSON.stringify(opts.data));
      console.log("Headers:", JSON.stringify(opts.headers));
      console.log("DataType:", opts.dataType);
      
      window._capturedAjax = opts;
      window._ajaxCalls.push(opts);
      
      // Don't actually make the call
      const d = new window.$.Deferred();
      return d.promise();
    };
    
    // Also patch $.get
    window.$.get = function(url, data, success, dataType) {
      console.log("$.get called:", url, data);
      window._ajaxCalls.push({url, data, type: 'GET'});
      const d = new window.$.Deferred();
      return d.promise();
    };
  }
}, 10);
