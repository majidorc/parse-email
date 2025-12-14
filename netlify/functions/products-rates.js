const handler = require('../../api/products-rates.js');
const { createRequestResponse, formatNetlifyResponse } = require('./api-adapter');

exports.handler = async (event, context) => {
  // Set a timeout to prevent hanging
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Add timeout protection
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Function timeout after 25 seconds')), 25000);
  });
  
  try {
    const { req, res, getResponse } = createRequestResponse(event);
    
    // Ensure the handler is called properly
    const handlerFunc = typeof handler === 'function' ? handler : handler.default || handler.handler;
    
    // Race between handler and timeout
    await Promise.race([
      handlerFunc(req, res),
      timeoutPromise
    ]);
    
    const response = getResponse();
    
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
    
    return formatNetlifyResponse(response);
  } catch (error) {
    console.error('Products rates function error:', error);
    console.error('Error stack:', error.stack);
    console.error('Event path:', event.path);
    console.error('Event query:', event.queryStringParameters);
    return {
      statusCode: error.message.includes('timeout') ? 504 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: error.message,
        type: error.name,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

