// Adapter to convert Netlify event to Express-style req/res
function createRequestResponse(event) {
  // Parse query string parameters
  const query = event.queryStringParameters || {};
  
  // Parse body - handle both JSON and raw string
  // Netlify may base64 encode binary content
  let parsedBody = {};
  let rawBody = event.body || '';
  
  if (event.body) {
    if (event.isBase64Encoded) {
      // Decode base64 body
      rawBody = Buffer.from(event.body, 'base64').toString('utf-8');
    } else if (typeof event.body === 'string') {
      rawBody = event.body;
    } else {
      rawBody = JSON.stringify(event.body);
    }
    
    // Try to parse as JSON, but keep raw if it fails (for webhook)
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (e) {
      parsedBody = {};
    }
  }
  
  // Normalize headers (Netlify provides them in lowercase)
  const headers = {};
  if (event.headers) {
    Object.keys(event.headers).forEach(key => {
      headers[key.toLowerCase()] = event.headers[key];
      headers[key] = event.headers[key]; // Also keep original case for compatibility
    });
  }
  
  // Create a mock request object
  const req = {
    method: event.httpMethod,
    url: event.path + (event.rawQuery ? '?' + event.rawQuery : ''),
    path: event.path,
    pathname: event.path.split('?')[0],
    query: query,
    headers: headers,
    body: parsedBody,
    rawBody: rawBody,
    get: function(header) {
      const lower = header.toLowerCase();
      return this.headers[lower] || this.headers[header] || '';
    }
  };

  // Create a mock response object
  let statusCode = 200;
  let responseHeaders = {};
  let body = null;

  const res = {
    status: function(code) {
      statusCode = code;
      return this;
    },
    json: function(data) {
      body = JSON.stringify(data);
      responseHeaders['Content-Type'] = 'application/json';
      return this;
    },
    send: function(data) {
      if (typeof data === 'string') {
        body = data;
      } else {
        body = JSON.stringify(data);
        if (!responseHeaders['Content-Type']) {
          responseHeaders['Content-Type'] = 'application/json';
        }
      }
      return this;
    },
    setHeader: function(name, value) {
      responseHeaders[name] = value;
      return this;
    },
    end: function(data) {
      if (data !== undefined) {
        body = typeof data === 'string' ? data : JSON.stringify(data);
      }
      return this;
    },
    getHeader: function(name) {
      return responseHeaders[name];
    }
  };

  return { 
    req, 
    res, 
    getResponse: () => ({
      statusCode, 
      headers: responseHeaders, 
      body 
    }) 
  };
}

module.exports = { createRequestResponse };

