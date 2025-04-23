const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 80;

// Kubernetes service mappings - internal service DNS names
const kubernetesServices = {
  "constraint-propagation": "http://master-service:3000/solve",
  "column-based": "http://columnbased-master-service:3005/solve",
  "multi-stochastic": "http://stochasticsearch-master-service:3010/solve",
  "backtracking": "http://backtracking-single-master-service:3050/solve",
  "rule-based": "http://rulebased-single-master-service:3060/solve",
  "single-stochastic": "http://stochasticsearch-single-master-service:3070/solve"
};

// Middleware for logging requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// CORS settings for API access
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Disable caching for development
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname)));

// API routes for solving - CORRECTED FOR AXIOS
app.post('/api/solve/:solver', async (req, res) => {
  const solver = req.params.solver;
  const serviceUrl = kubernetesServices[solver];
  
  if (!serviceUrl) {
    return res.status(400).json({ 
      error: 'Unknown solver',
      displayMessage: 'Selected solver is not available'
    });
  }

  console.log(`Forwarding request to solver: ${solver} at ${serviceUrl}`);

  try {
    // Correct axios usage
    const response = await axios.post(serviceUrl, req.body, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    // Axios response handling is different - data is already parsed
    console.log(`Solver ${solver} response received`);
    res.json(response.data);
    
  } catch (error) {
    console.error(`Error with solver ${solver}:`, error.message);
    
    // Get status code from axios error if available
    const statusCode = error.response ? error.response.status : 500;
    
    res.status(statusCode).json({
      success: false,
      error: 'Solver error',
      message: error.message
    });
  }
});

// API routes for result polling - CORRECTED FOR AXIOS
app.get('/api/result/:solver/:jobId', async (req, res) => {
  const { solver, jobId } = req.params;
  const baseUrl = kubernetesServices[solver].replace('/solve', '');
  let resultUrl;
  
  if (["constraint-propagation", "column-based", "multi-stochastic"].includes(solver)) {
    resultUrl = `${baseUrl}/FinalsolvedResults?jobId=${jobId}`;
  } else {
    resultUrl = `${baseUrl}/result/${jobId}`;
  }
  
  console.log(`Polling for results: ${resultUrl}`);
  
  try {
    // Correct axios usage
    const response = await axios.get(resultUrl);
    
    // With axios, we don't need to check response.ok or call .json()
    res.json(response.data);
    
  } catch (error) {
    console.log(`Error polling for results: ${error.message}`);
    
    // Handle 404 separately for polling
    if (error.response && error.response.status === 404) {
      return res.status(404).json({ 
        error: 'Result not ready',
        status: 'processing'
      });
    }
    
    res.status(500).json({ 
      error: error.message,
      status: 'error'
    });
  }
});

// Fallback route - serve index.html for all routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Server error', 
    message: err.message 
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});