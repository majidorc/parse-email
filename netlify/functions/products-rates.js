const handler = require('../../api/products-rates.js');
const { createRequestResponse } = require('./api-adapter');

exports.handler = async (event, context) => {
  try {
    const { req, res, getResponse } = createRequestResponse(event);
    await handler(req, res);
    const response = getResponse();
    return {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body
    };
  } catch (error) {
    console.error('Products rates function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

