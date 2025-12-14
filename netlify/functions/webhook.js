const handler = require('../../api/webhook.js');
const { createRequestResponse } = require('./api-adapter');

// Helper to convert string/buffer to async iterable (for getRawBody)
// getRawBody expects req itself to be iterable, not req.body
function makeRequestIterable(req, bodyData) {
  if (!bodyData) {
    // Return empty iterable if no body
    req[Symbol.asyncIterator] = async function*() {};
    return req;
  }
  
  // Make req itself iterable
  const bodyBuffer = Buffer.isBuffer(bodyData) 
    ? bodyData 
    : Buffer.from(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData), 'utf-8');
  
  req[Symbol.asyncIterator] = async function*() {
    yield bodyBuffer;
  };
  
  return req;
}

exports.handler = async (event, context) => {
  try {
    const { req, res, getResponse } = createRequestResponse(event);
    
    // For webhook, getRawBody expects req to be iterable
    // Handle base64 encoded bodies
    let bodyData = event.body;
    if (event.isBase64Encoded && event.body) {
      bodyData = Buffer.from(event.body, 'base64');
    } else if (typeof event.body === 'string') {
      bodyData = Buffer.from(event.body, 'utf-8');
    }
    
    // Make req itself iterable with the body data
    makeRequestIterable(req, bodyData);
    
    await handler(req, res);
    const response = getResponse();
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body
    };
  } catch (error) {
    console.error('Webhook function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

