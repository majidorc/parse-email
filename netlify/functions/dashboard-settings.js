const handler = require('../../api/dashboard-settings.js');
const { createRequestResponse, formatNetlifyResponse } = require('./api-adapter');

exports.handler = async (event, context) => {
  try {
    const { req, res, getResponse } = createRequestResponse(event);
    await handler(req, res);
    const response = getResponse();
    return formatNetlifyResponse(response);
  } catch (error) {
    console.error('Dashboard settings function error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

