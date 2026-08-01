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
    if (options.cookie) opts.headers['Cookie'] = options.cookie;
    if (options.method === 'POST' && options.body) {
      opts.headers['Content-Type'] = options.headers?.['Content-Type'] || 'application/x-www-form-urlencoded';
      opts.headers['Content-Length'] = Buffer.byteLength(options.body);
    }
    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (options.method === 'POST' && options.body) req.write(options.body);
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
  let token = decoded.match(/var token = '([^']+)'/)[1];
  
  // Step 2-3: Get real page (may need two redirects)
  let cookieStr = `__51guid__=${token}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    resp = await fetchUrl('https://www.itingshu.net/play/31494_1_171863.html', {
      headers: { 'Cookie': cookieStr },
    });
    if (!resp.body.includes('var reversed = "')) break;
    const rm = resp.body.match(/var reversed = "([^"]+)"/s);
    const rev2 = rm[1].replace(/\n/g, '').replace(/\r/g, '');
    const b642 = rev2.split('').reverse().join('');
    const decoded2 = Buffer.from(b642, 'base64').toString('latin1');
    token = decoded2.match(/var token = '([^']+)'/)[1];
    cookieStr = `__51guid__=${token}`;
  }
  
  const getMeta = (name) => {
    const m = resp.body.match(new RegExp(`<meta name="_${name}"\\s*content="([^"]*)"`));
    return m ? m[1] : null;
  };
  
  const _b = getMeta('b');
  const _p = getMeta('p');
  const _c = getMeta('c');
  const _d = getMeta('d') || 'read';
  console.log(`Meta: _b=${_b}, _p=${_p}, _c=${_c}, _d=${_d}`);
  
  // Step 4: Load mian.js to get _0x9926ad
  console.log("=== Loading mian.js ===");
  const mianCode = fs.readFileSync('/tmp/mian_orig.js', 'utf8');
  
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.itingshu.net/play/31494_1_171863.html',
    runScripts: 'dangerously',
  });
  const window = dom.window;
  
  // Load jQuery
  window.eval(fs.readFileSync('/home/jayson2013/node_modules/jquery/dist/jquery.min.js', 'utf8'));
  
  // Add minimal jQuery plugins
  window.$.fn.jPlayer = function() { return this; };
  
  // Run mian.js - catch errors
  try {
    window.eval(mianCode);
  } catch(e) {
    // Ignore errors from event handlers
  }
  
  // Check if _0x9926ad is available
  if (typeof window._0x9926ad !== 'function') {
    console.log("_0x9926ad not available!");
    return;
  }
  
  // Compute sp
  const sp = window._0x9926ad(_c);
  console.log(`Computed sp length ${sp.length}: ${sp.substring(0, 30)}...`);
  
  // Step 5: Make API call
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
  
  try {
    const json = JSON.parse(resp.body);
    console.log(`status: ${json.status}`);
    console.log(`msg: ${(json.msg || '').substring(0, 80)}`);
    console.log(`url: ${json.url || 'N/A'}`);
    console.log(`ourl: ${json.ourl || 'N/A'}`);
    console.log(`nextid: ${json.nextid || 'N/A'}`);
    console.log(`megx: ${json.megx || 'N/A'}`);
    
    if (json.url) {
      console.log(`\n✅ Audio URL: ${json.url}`);
      // Verify
      const ac = await fetchUrl(json.url, { method: 'HEAD' });
      console.log(`Audio: HTTP ${ac.status}, Type: ${ac.headers['content-type'] || 'N/A'}`);
    }
  } catch(e) {
    console.log(`Response body: ${resp.body.substring(0, 200)}`);
  }
  
  console.log("\n=== Done ===");
}

main().catch(e => console.error(e));
