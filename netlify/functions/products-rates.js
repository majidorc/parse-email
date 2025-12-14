const handler = require('../../api/products-rates.js');
const { createRequestResponse, formatNetlifyResponse } = require('./api-adapter');

exports.handler = async (event, context) => {
  // Set a timeout to prevent hanging
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log('[PRODUCTS-RATES] Function invoked:', {
    path: event.path,
    method: event.httpMethod,
    query: event.queryStringParameters
  });
  
  // Add timeout protection
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Function timeout after 25 seconds')), 25000);
  });
  
  try {
    const { req, res, getResponse } = createRequestResponse(event);
    
    // Ensure the handler is called properly
    const handlerFunc = typeof handler === 'function' ? handler : handler.default || handler.handler;
    
    if (!handlerFunc) {
      throw new Error('Handler function not found');
    }
    
    console.log('[PRODUCTS-RATES] Calling handler function...');
    
    // Wrap handler call in Promise to catch any synchronous errors
    const handlerPromise = Promise.resolve().then(() => handlerFunc(req, res));
    
    // Race between handler and timeout
    await Promise.race([
      handlerPromise,
      timeoutPromise
    ]);
    
    console.log('[PRODUCTS-RATES] Handler completed, getting response...');
    const response = getResponse();
    
    console.log('[PRODUCTS-RATES] Response:', {
      statusCode: response.statusCode,
      hasBody: !!response.body,
      bodyLength: response.body ? response.body.length : 0
    });
    
    // Check if response was set
    if (!response.body && response.statusCode === 200) {
      console.warn('Products rates: No response body set, returning empty response');
      return formatNetlifyResponse({
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No response from handler' })
      });
    }
    
    // Ensure we have a valid response
    if (!response.statusCode) {
      console.warn('Products rates: No status code set, defaulting to 200');
      response.statusCode = 200;
    }
    
    if (!response.body) {
      console.warn('Products rates: No body set, defaulting to empty object');
      response.body = JSON.stringify({});
    }
    
    const formattedResponse = formatNetlifyResponse(response);
    console.log('[PRODUCTS-RATES] Returning formatted response');
    return formattedResponse;
  } catch (error) {
    console.error('[PRODUCTS-RATES] Function error:', error);
    console.error('[PRODUCTS-RATES] Error name:', error.name);
    console.error('[PRODUCTS-RATES] Error message:', error.message);
    console.error('[PRODUCTS-RATES] Error stack:', error.stack);
    console.error('[PRODUCTS-RATES] Event path:', event.path);
    console.error('[PRODUCTS-RATES] Event query:', event.queryStringParameters);
    
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

