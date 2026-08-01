const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const https = require('https');
const http = require('http');
const querystring = require('querystring');

// =========================================================
// STEP 1: Load the real page with proper session handling
// =========================================================

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
  // Step 1: First request to get the cookie
  console.log("=== Step 1: First request ===");
  let resp = await fetchUrl('https://www.itingshu.net/play/31494_1_171863.html');
  
  // Extract reversed base64 script
  const revMatch = resp.body.match(/var reversed = "([^"]+)"/s);
  if (!revMatch) { console.log("No reversed script"); return; }
  
  const rev = revMatch[1].replace(/\n/g, '').replace(/\r/g, '');
  const b64 = rev.split('').reverse().join('');
  const decoded = Buffer.from(b64, 'base64').toString('latin1');
  const tokenMatch = decoded.match(/var token = '([^']+)'/);
  if (!tokenMatch) { console.log("No token"); return; }
  const token = tokenMatch[1];
  console.log("Token obtained");
  
  // Get cookies from response
  let cookieStr = `__51guid__=${token}`;
  if (resp.headers['set-cookie']) {
    const setCookies = Array.isArray(resp.headers['set-cookie']) ? resp.headers['set-cookie'] : [resp.headers['set-cookie']];
    for (const c of setCookies) {
      const [keyVal] = c.split(';');
      cookieStr += '; ' + keyVal;
    }
  }
  
  // Step 2: Second request with cookie to get the real page
  console.log("=== Step 2: Second request ===");
  resp = await fetchUrl('https://www.itingshu.net/play/31494_1_171863.html', {
    headers: { 'Cookie': cookieStr, 'Referer': 'https://www.itingshu.net/' },
  });
  
  if (resp.body.includes('var reversed = "')) {
    // Still loading page - extract new token
    const revMatch2 = resp.body.match(/var reversed = "([^"]+)"/s);
    const rev2 = revMatch2[1].replace(/\n/g, '').replace(/\r/g, '');
    const b642 = rev2.split('').reverse().join('');
    const decoded2 = Buffer.from(b642, 'base64').toString('latin1');
    const token2Match = decoded2.match(/var token = '([^']+)'/);
    const token2 = token2Match[1];
    cookieStr = `__51guid__=${token2}`;
    
    // Step 3: Third request with new cookie
    console.log("=== Step 3: Third request ===");
    resp = await fetchUrl('https://www.itingshu.net/play/31494_1_171863.html', {
      headers: { 'Cookie': cookieStr, 'Referer': 'https://www.itingshu.net/' },
    });
  }
  
  // Extract meta values
  const getMeta = (name) => {
    const m = resp.body.match(new RegExp(`<meta name="_${name}"\\s*content="([^"]*)"`));
    return m ? m[1] : null;
  };
  
  const _b = getMeta('b');
  const _p = getMeta('p');
  const _c = getMeta('c');
  const _d = getMeta('d');
  console.log(`Meta: _b=${_b}, _p=${_p}, _c=${_c}, _d=${_d}`);
  
  // Save the page for jsdom
  fs.writeFileSync('/tmp/current_play_page.html', resp.body);
  
  // Step 4: Evaluate mian.js in jsdom with the real page
  console.log("=== Step 4: Evaluate JS to compute sp ===");
  
  const dom = new JSDOM(resp.body, {
    url: 'https://www.itingshu.net/play/31494_1_171863.html',
    referrer: 'https://www.itingshu.net/',
    contentType: 'text/html',
    userAgent: 'Mozilla/5.0',
    runScripts: 'dangerously',
  });
  
  const window = dom.window;
  
  // Wait for jQuery to load (or inject it)
  await new Promise(resolve => {
    // Check every 50ms for jQuery
    const check = setInterval(() => {
      if (window.$ && window.$.ajax) {
        clearInterval(check);
        resolve();
      }
    }, 50);
    setTimeout(() => { clearInterval(check); resolve(); }, 5000);
  });
  
  // Now compute sp by calling _0x9926ad
  if (typeof window._0x9926ad === 'function') {
    const sp = window._0x9926ad(_c);
    console.log(`Computed sp: ${sp}`);
    
    // Step 5: Make the API call
    console.log("\n=== Step 5: API call ===");
    const headers = {
      'Cookie': cookieStr,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'sc': _c,
      'sp': sp,
      'Referer': 'https://www.itingshu.net/play/31494_1_171863.html',
    };
    const body = querystring.stringify({ nid: _b, cid: _p, sort: _d });
    
    resp = await fetchUrl('https://www.itingshu.net/api/mapi/play', {
      method: 'POST',
      headers: headers,
      body: body,
    });
    
    console.log(`API Status: ${resp.status}`);
    console.log(`API Response: ${resp.body}`);
    
    try {
      const json = JSON.parse(resp.body);
      if (json.url) {
        console.log(`\n✅ Audio URL: ${json.url}`);
        
        // Verify the URL works
        const audioCheck = await fetchUrl(json.url, { method: 'HEAD' });
        console.log(`Audio check: HTTP ${audioCheck.status}, Type: ${audioCheck.headers['content-type']}, Size: ${audioCheck.headers['content-length']}`);
      }
    } catch(e) {
      console.log(`Parse error: ${e.message}`);
    }
  } else {
    console.log("_0x9926ad not found!");
  }
  
  console.log("\n=== Done ===");
}

main().catch(e => console.error(e));
