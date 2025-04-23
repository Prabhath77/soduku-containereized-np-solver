// Import libraries for HTTP requests and the Sudoku solver
const axios = require('axios');
const { StochasticBlockSolver } = require('/Users/harshsharma/Desktop/Sudoku/SudokuMULTI/src/ConstraintPropagationBacktracking/solver.js');

// Set the URL to connect to the master server
const MASTER_URL = process.env.MASTER_URL || 'http://localhost:3000';

// Check if a Sudoku block is completely filled (no zeros)
function isBlockSolved(block) {
  for (let i = 0; i < block.length; i++) {
    for (let j = 0; j < block[i].length; j++) {
      if (block[i][j] === 0) return false;
    }
  }
  return true;
}

// Get the total number of available jobs from the master
async function fetchTotalJobs() {
  try {
    const response = await axios.get(`${MASTER_URL}/totalJobs`);
    console.log(`Total jobs: ${response.data.totalJobs}`);
    return response.data.totalJobs;
  } catch (error) {
    console.error('Error fetching total jobs:', error.message);
    return 0;
  }
}

// Get a job from the master's queue
async function fetchJob() {
  try {
    console.log(`Fetching job...`);
    const response = await axios.get(`${MASTER_URL}/queue`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error(`Error fetching job: ${error.message}`);
    return null;
  }
}

// Solve a Sudoku block and send the result back to the master
async function solveSubJob(job) {
  const { id, board, blockRow, blockCol, originalBoard, triedNumbers } = job;
  console.log(`Processing job ${id} for block (${blockRow}, ${blockCol})`);
  console.log('Block before solving:', board);
  console.log('Original board (blueprint):', originalBoard);
  
  try {
    const startTime = Date.now();
    const solver = new StochasticBlockSolver(originalBoard, blockRow, blockCol);
    const result = solver.solve();
    const duration = (Date.now() - startTime) / 1000;
    if (result && isBlockSolved(result.block)) {
      console.log(`Job ${id} completed in ${duration}s`);
      console.log('Solved block:', result.block);
      console.log('Sure mask:', result.sure);
      await axios.post(`${MASTER_URL}/result`, { 
        id, 
        board: result.block, 
        blockRow, 
        blockCol, 
        triedNumbers, 
        originalBoard, 
        sure: result.sure 
      });
      console.log(`Result recorded for job ${id}`);
      return true;
    } else {
      console.log(`Job ${id} did not converge. Posting failure result.`);
      await axios.post(`${MASTER_URL}/result`, { 
        id, 
        board: result ? result.block : board, 
        blockRow, 
        blockCol, 
        triedNumbers, 
        originalBoard, 
        sure: result ? result.sure : [] 
      });
      return false;
    }
  } catch (error) {
    console.error(`Error solving job ${id}:`, error.message);
    return false;
  }
}

// Main loop to continuously fetch and solve jobs
async function fetchAndSolve() {
  try {
    const totalJobs = await fetchTotalJobs();
    if (totalJobs === 0) {
      console.log('No jobs available. Retrying...');
      setTimeout(fetchAndSolve, 1000);
      return;
    }
    const job = await fetchJob();
    if (job) {
      await solveSubJob(job);
    }
  } catch (error) {
    console.error('Error in slave worker:', error.message);
  }
  setTimeout(fetchAndSolve, 1000);
}

// Start the worker
console.log('Slave worker started.');
fetchAndSolve();