const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const https = require('https');
const querystring = require('querystring');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const http = url.startsWith('https') ? https : require('http');
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
    const req = http.request(opts, (res) => {
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
  // Step 1: Get fresh session
  let resp = await fetchUrl('https://www.itingshu.net/play/31494_1_171863.html');
  
  // Follow redirects (cookie setting)
  let cookieStr = '';
  for (let i = 0; i < 5; i++) {
    if (!resp.body.includes('var reversed = "')) break;
    const rm = resp.body.match(/var reversed = "([^"]+)"/s);
    const rev = rm[1].replace(/\n/g, '').replace(/\r/g, '');
    const b64 = rev.split('').reverse().join('');
    const decoded = Buffer.from(b64, 'base64').toString('latin1');
    const token = decoded.match(/var token = '([^']+)'/)[1];
    cookieStr = `__51guid__=${token}`;
    
    // Also copy any set-cookie from response
    if (resp.headers['set-cookie']) {
      const cookies = Array.isArray(resp.headers['set-cookie']) ? resp.headers['set-cookie'] : [resp.headers['set-cookie']];
      for (const c of cookies) {
        const [keyVal] = c.split(';');
        if (!keyVal.startsWith('__51guid__')) {
          cookieStr += '; ' + keyVal;
        }
      }
    }
    
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
  const _d = getMeta('d') || 'read';
  console.log(`Meta: _b=${_b}, _p=${_p}, _c=${_c}, _d=${_d}`);
  console.log(`Cookies: ${cookieStr.substring(0, 80)}...`);
  
  // Step 2: Compute sp from mian.js
  const mianCode = fs.readFileSync('/tmp/mian_orig.js', 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://www.itingshu.net/play/31494_1_171863.html',
    runScripts: 'dangerously',
  });
  const window = dom.window;
  
  // Load jQuery
  window.eval(fs.readFileSync('/home/jayson2013/node_modules/jquery/dist/jquery.min.js', 'utf8'));
  window.$.fn.jPlayer = function() { return this; };
  
  // Run mian.js
  try { window.eval(mianCode); } catch(e) {}
  
  if (typeof window._0x9926ad !== 'function') {
    console.log("_0x9926ad not found!");
    return;
  }
  
  const sp = window._0x9926ad(_c);
  console.log(`sp: ${sp.substring(0, 40)}...`);
  
  // Step 3: Make API call with proper sp
  console.log("\n=== API call with proper sp ===");
  const apiHeaders = {
    'Cookie': cookieStr,
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'sc': _c,
    'sp': sp,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': 'https://www.itingshu.net/play/31494_1_171863.html',
  };
  const apiBody = querystring.stringify({ nid: _b, cid: _p, sort: _d });
  
  resp = await fetchUrl('https://www.itingshu.net/api/mapi/play', {
    method: 'POST',
    headers: apiHeaders,
    body: apiBody,
  });
  
  console.log(`Status: ${resp.status}`);
  let json;
  try { json = JSON.parse(resp.body); } catch(e) { console.log(`Body: ${resp.body.substring(0, 200)}`); return; }
  
  console.log(`status: ${json.status}`);
  console.log(`msg: ${(json.msg || '').substring(0, 80)}`);
  console.log(`url: ${json.url || 'N/A'}`);
  console.log(`ourl: ${json.ourl || 'N/A'}`);
  console.log(`nextid: ${json.nextid || 'N/A'}`);
  console.log(`megx: ${json.megx || 'N/A'}`);
  
  if (json.url) {
    console.log(`\n✅ Audio URL: ${json.url}`);
    // Check if the URL is accessible
    const ac = await fetchUrl(json.url, { method: 'HEAD' });
    console.log(`Audio check: HTTP ${ac.status}, Type: ${ac.headers['content-type'] || 'N/A'}`);
  }
  
  // Step 4: Also try with empty sp for comparison 
  console.log("\n=== API call with EMPTY sp ===");
  resp = await fetchUrl('https://www.itingshu.net/api/mapi/play', {
    method: 'POST',
    headers: { ...apiHeaders, 'sp': '' },
    body: apiBody,
  });
  try { json = JSON.parse(resp.body); console.log(`status: ${json.status}, url: ${(json.url || 'N/A').substring(0, 60)}...`); } catch(e) { console.log(resp.body.substring(0,100)); }
  
  // Step 5: Try with just PHPSESSID cookie (no __51guid__)
  console.log("\n=== API with different cookie strategies ===");
  // Try with the cookies from the page
  const phpsessidMatch = cookieStr.match(/PHPSESSID=([^;]+)/);
  const phpsessid = phpsessidMatch ? phpsessidMatch[1] : '';
  
  if (phpsessid) {
    console.log(`PHPSESSID: ${phpsessid}`);
    resp = await fetchUrl('https://www.itingshu.net/api/mapi/play', {
      method: 'POST',
      headers: {
        'Cookie': `PHPSESSID=${phpsessid}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'sc': _c,
        'sp': sp,
        'Referer': 'https://www.itingshu.net/play/31494_1_171863.html',
      },
      body: apiBody,
    });
    try { json = JSON.parse(resp.body); console.log(`Only PHPSESSID: status ${json.status}, url: ${(json.url || 'N/A').substring(0, 60)}...`); } catch(e) {}
  }
  
  console.log("\n=== Done ===");
}

main().catch(e => console.error(e));
