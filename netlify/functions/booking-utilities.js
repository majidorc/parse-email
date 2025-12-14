const handler = require('../../api/booking-utilities.js');
const { createRequestResponse, formatNetlifyResponse } = require('./api-adapter');

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log('[BOOKING-UTILITIES] Function invoked:', {
    path: event.path,
    method: event.httpMethod,
    body: event.body ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body) : null
  });
  
  // Add timeout protection (25 seconds)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Function timeout after 25 seconds')), 25000);
  });
  
  try {
    const { req, res, getResponse } = createRequestResponse(event);
    
    const handlerFunc = typeof handler === 'function' ? handler : handler.default || handler.handler;
    
    if (!handlerFunc) {
      throw new Error('Handler function not found');
    }
    
    console.log('[BOOKING-UTILITIES] Calling handler function...');
    
    // Wrap handler call in Promise to catch any synchronous errors
    const handlerPromise = Promise.resolve().then(() => handlerFunc(req, res));
    
    // Race between handler and timeout
    await Promise.race([
      handlerPromise,
      timeoutPromise
    ]);
    
    console.log('[BOOKING-UTILITIES] Handler completed, getting response...');
    const response = getResponse();
    
    console.log('[BOOKING-UTILITIES] Response:', {
      statusCode: response.statusCode,
      hasBody: !!response.body
    });
    
    // Ensure we have a valid response
    if (!response.statusCode) {
      response.statusCode = 200;
    }
    
    if (!response.body) {
      response.body = JSON.stringify({ error: 'No response from handler' });
    }
    
    return formatNetlifyResponse(response);
  } catch (error) {
    console.error('[BOOKING-UTILITIES] Function error:', error);
    console.error('[BOOKING-UTILITIES] Error name:', error.name);
    console.error('[BOOKING-UTILITIES] Error message:', error.message);
    console.error('[BOOKING-UTILITIES] Error stack:', error.stack);
    
    return {
      statusCode: error.message.includes('timeout') ? 504 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: error.message || 'Internal server error',
        type: error.name || 'Error',
        details: error.stack
      })
    };
  }
};

