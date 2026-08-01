const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const https = require('https');
const querystring = require('querystring');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const parsedUrl = new URL(url);
    
    const opts = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(options.headers || {}),
      },
    };

    if (options.cookie) {
      opts.headers['Cookie'] = options.cookie;
    }

    if (options.method === 'POST' && options.body) {
      opts.headers['Content-Type'] = options.headers?.['Content-Type'] || 'application/x-www-form-urlencoded';
      opts.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });
    req.on('error', reject);
    if (options.method === 'POST' && options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function main() {
  // Step 1: Get cookie
  let resp = await fetchUrl('https://www.itingshu.net/play/31494_1_171863.html');
  const revMatch = resp.body.match(/var reversed = "([^"]+)"/s);
  const rev = revMatch[1].replace(/\n/g, '').replace(/\r/g, '');
  const b64 = rev.split('').reverse().join('');
  const decoded = Buffer.from(b64, 'base64').toString('latin1');
  const token = decoded.match(/var token = '([^']+)'/)[1];
  
  // Step 2: Get real page
  let cookieStr = `__51guid__=${token}`;
  resp = await fetchUrl('https://www.itingshu.net/play/31494_1_171863.html', {
    headers: { 'Cookie': cookieStr },
  });
  
  if (resp.body.includes('var reversed = "')) {
    const revMatch2 = resp.body.match(/var reversed = "([^"]+)"/s);
    const rev2 = revMatch2[1].replace(/\n/g, '').replace(/\r/g, '');
    const b642 = rev2.split('').reverse().join('');
    const decoded2 = Buffer.from(b642, 'base64').toString('latin1');
    const token2 = decoded2.match(/var token = '([^']+)'/)[1];
    cookieStr = `__51guid__=${token2}`;
    resp = await fetchUrl('https://www.itingshu.net/play/31494_1_171863.html', {
      headers: { 'Cookie': cookieStr },
    });
  }
  
  const getMeta = (name) => {
    const m = resp.body.match(new RegExp(`<meta name="_${name}"\\s*content="([^"]*)"`));
    return m ? m[1] : null;
  };
  
  const _b = getMeta('b');
  const _p = getMeta('p');
  const _c = getMeta('c');
  const _d = getMeta('d');
  console.log(`Meta: _b=${_b}, _p=${_p}, _c=${_c}, _d=${_d}`);
  
  // Step 3: Load mian.js in jsdom to get _0x9926ad function
  console.log("=== Loading mian.js in jsdom ===");
  const mianCode = fs.readFileSync('/tmp/mian_orig.js', 'utf8');
  
  // Create minimal DOM with our meta tags
  const metaHtml = `<!DOCTYPE html><html><head>
<meta name="_b" content="${_b}">
<meta name="_p" content="${_p}">
<meta name="_c" content="${_c}">
<meta name="_d" content="${_d}">
</head><body></body></html>`;
  
  const dom = new JSDOM(metaHtml, {
    url: 'https://www.itingshu.net/play/31494_1_171863.html',
    referrer: 'https://www.itingshu.net/',
    runScripts: 'dangerously',
  });
  
  const window = dom.window;
  
  // Load jQuery
  const jqCode = fs.readFileSync('/home/jayson2013/node_modules/jquery/dist/jquery.min.js', 'utf8');
  window.eval(jqCode);
  
  // Patch $.ajax to capture the call
  let capturedAjax = null;
  window.$.ajax = function(opts) {
    capturedAjax = opts;
    console.log("AJAX call captured!");
    console.log("URL:", opts.url);
    console.log("Method:", opts.type);
    console.log("Data:", JSON.stringify(opts.data));
    console.log("Headers:", JSON.stringify(opts.headers));
    return { done: function() {} };
  };
  
  // Patch $.fn to prevent errors with missing DOM elements
  window.$.fn.jPlayer = function() { return this; };
  window.$.fn.on = function() { return this; };
  window.$.fn.ready = function(f) { f(); return this; };
  window.$.fn.attr = function(name) { 
    return name === 'content' ? '' : ''; 
  };
  window.$.fn.val = function() { return ''; };
  window.$.fn.html = function() { return ''; };
  window.$.fn.text = function() { return ''; };
  window.$.fn.css = function() { return this; };
  window.$.fn.find = function() { return this; };
  window.$.fn.jPlayer = function() { return this; };
  
  // Evaluate mian.js
  try {
    window.eval(mianCode);
  } catch(e) {
    console.log("mian.js eval error:", e.message);
  }
  
  // Check if _0x9926ad is available
  console.log("\n_0x9926ad available:", typeof window._0x9926ad);
  
  // Check the inner _0x9926ad inside the eval context
  // The _0x9926ad might be defined as var _0x9926ad = ... inside a function scope
  // Let me try to access it through a wrapper
  if (typeof window._0x9926ad === 'function') {
    const sp = window._0x9926ad(_c);
    console.log(`Computed sp: ${sp}`);
    
    // Make the API call
    console.log("\n=== API call ===");
    const apiHeaders = {
      'Cookie': cookieStr,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'sc': _c,
      'sp': sp,
      'Referer': 'https://www.itingshu.net/play/31494_1_171863.html',
    };
    const apiBody = querystring.stringify({ nid: _b, cid: _p, sort: _d });
    
    resp = await fetchUrl('https://www.itingshu.net/api/mapi/play', {
      method: 'POST',
      headers: apiHeaders,
      body: apiBody,
    });
    
    console.log(`API Status: ${resp.status}`);
    console.log(`Response: ${resp.body}`);
    
    try {
      const json = JSON.parse(resp.body);
      if (json.url) {
        console.log(`\n✅ Audio URL: ${json.url}`);
        if (json.msg) console.log(`Message: ${json.msg.substring(0, 100)}`);
      }
    } catch(e) {
      console.log(`Parse error: ${e.message}`);
    }
  } else {
    console.log("Trying alternative: use captured AJAX call");
    if (capturedAjax) {
      // Make the API call with the captured parameters
      console.log("Making API call with captured ajax params...");
      const apiHeaders = {
        'Cookie': cookieStr,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'sc': _c,
        'sp': capturedAjax.headers.sp,
        'Referer': 'https://www.itingshu.net/play/31494_1_171863.html',
      };
      const apiBody = querystring.stringify(capturedAjax.data);
      
      resp = await fetchUrl('https://www.itingshu.net' + capturedAjax.url, {
        method: 'POST',
        headers: apiHeaders,
        body: apiBody,
      });
      
      console.log(`API Status: ${resp.status}`);
      console.log(`Response: ${resp.body}`);
    } else {
      console.log("No AJAX call captured either.");
      // Try without the page scripts - just load mian.js directly
      console.log("\n=== Direct approach ===");
      const dom2 = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
        url: 'https://www.itingshu.net/play/31494_1_171863.html',
        runScripts: 'dangerously',
      });
      const w2 = dom2.window;
      w2.eval(jqCode);
      w2.$.ajax = function(){};
      w2.$.fn.jPlayer = function(){return this;};
      
      // Patch the eval to not depend on specific element structure
      // Just load the mian.js and see what happens
      w2.eval(mianCode);
      
      console.log("_0x9926ad in w2:", typeof w2._0x9926ad);
      
      if (typeof w2._0x9926ad === 'function') {
        const sp = w2._0x9926ad(_c);
        console.log(`Computed sp: ${sp}`);
        
        const apiHeaders = {
          'Cookie': cookieStr,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'sc': _c,
          'sp': sp,
          'Referer': 'https://www.itingshu.net/play/31494_1_171863.html',
        };
        const apiBody = querystring.stringify({ nid: _b, cid: _p, sort: _d });
        
        resp = await fetchUrl('https://www.itingshu.net/api/mapi/play', {
          method: 'POST',
          headers: apiHeaders,
          body: apiBody,
        });
        
        console.log(`API Status: ${resp.status}`);
        console.log(`Response: ${resp.body}`);
      }
    }
  }
  
  console.log("\n=== Done ===");
}

main().catch(e => console.error(e));
