// Worker that processes Sudoku columns received from the master server and sends back solutions

const axios = require('axios');
const { SudokuSolver } = require('./solver.js');
const MASTER_URL = process.env.MASTER_URL || "http://localhost:3005";

// Validates if a column is completely solved by checking that no cell contains zero
function isColumnSolved(column) {
  for (let i = 0; i < column.length; i++) {
    if (column[i][0] === 0) return false;
  }
  return true;
}

// Retrieves the total number of available Sudoku jobs from the master server
async function fetchTotalJobs() {
  try {
    const response = await axios.get(`${MASTER_URL}/totalJobs`);
    console.log(`Total jobs available: ${response.data.totalJobs}`);
    return response.data.totalJobs;
  } catch (error) {
    console.error('Error fetching total jobs:', error.message);
    return 0;
  }
}

// Requests the next available job from the master server's queue
async function fetchJob() {
  try {
    console.log(`Fetching next job`);
    const response = await axios.get(`${MASTER_URL}/queue`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error(`Error in slave worker: ${error.message}`);
    return null;
  }
}

// Processes a single column job by applying the solver algorithm and submitting results back to master
async function solveSubJob(job) {
  const { id, board, colIndex, originalBoard, triedNumbers } = job;
  console.log(`Processing job ${id} for column ${colIndex}`);
  console.log('Column before solving:', board);
  console.log('Original board (blueprint):', originalBoard);
  try {
    const startTime = Date.now();
    const solver = new SudokuSolver();
    // Apply the hybrid solving algorithm to this column
    const result = solver.hybridSolve(board, originalBoard, colIndex);
    const duration = (Date.now() - startTime) / 1000;
    console.log(`Completed job ${id} in ${duration}s`);
    console.log('Solved column:', result.column);
    console.log('Sure mask:', result.sure);
    await axios.post(`${MASTER_URL}/result`, {
      id,
      board: result.column,
      colIndex,
      originalBoard,
      triedNumbers,
      sure: result.sure
    });
    console.log(`Result recorded for job ${id}`);
    return true;
  } catch (error) {
    console.error(`Error solving job ${id}:`, error.message);
    return false;
  }
}

// Main worker loop that continuously checks for new jobs and processes them
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

// Initialize the worker and begin processing jobs
console.log('Slave worker started.');
fetchAndSolve();