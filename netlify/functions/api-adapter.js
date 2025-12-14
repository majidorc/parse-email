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
  // Netlify uses lowercase header keys, but we need to preserve cookie header properly
  const headers = {};
  if (event.headers) {
    Object.keys(event.headers).forEach(key => {
      const lower = key.toLowerCase();
      headers[lower] = event.headers[key];
      headers[key] = event.headers[key]; // Also keep original case for compatibility
    });
  }
  
  // Handle multiValueHeaders for cookies (Netlify may provide cookies here)
  if (event.multiValueHeaders) {
    Object.keys(event.multiValueHeaders).forEach(key => {
      const lower = key.toLowerCase();
      if (lower === 'cookie') {
        // Combine multiple cookie headers
        headers[lower] = event.multiValueHeaders[key].join('; ');
        headers[key] = headers[lower];
      }
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

// Helper to format Netlify response with proper cookie handling
function formatNetlifyResponse(response) {
  const headers = { ...response.headers };
  const multiValueHeaders = {};
  
  // Extract Set-Cookie headers (Netlify requires them in multiValueHeaders)
  const setCookieHeaders = [];
  Object.keys(headers).forEach(key => {
    if (key.toLowerCase() === 'set-cookie') {
      setCookieHeaders.push(headers[key]);
      delete headers[key];
    }
  });
  
  // Add Set-Cookie to multiValueHeaders if present
  if (setCookieHeaders.length > 0) {
    multiValueHeaders['Set-Cookie'] = setCookieHeaders;
  }
  
  const result = {
    statusCode: response.statusCode,
    headers: headers,
    body: response.body
  };
  
  // Only include multiValueHeaders if we have cookies
  if (Object.keys(multiValueHeaders).length > 0) {
    result.multiValueHeaders = multiValueHeaders;
  }
  
  return result;
}

module.exports = { createRequestResponse, formatNetlifyResponse };

