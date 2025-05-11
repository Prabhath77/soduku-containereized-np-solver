// Worker script that gets jobs from a master server to solve Sudoku chunks
// This slave node runs continuously to process Sudoku block solving tasks
const axios = require('axios');
const { StochasticBlockSolver } = require('./solver.js');
// Master server URL can be configured via environment variable or defaults to localhost
const MASTER_URL = process.env.MASTER_URL || "http://localhost:3010";

// Check if every cell has a number (non-zero)
// Returns true if the block is completely filled, false otherwise
function isBlockSolved(block) {
  for (let i = 0; i < block.length; i++) {
    for (let j = 0; j < block[i].length; j++) {
      // A zero indicates an empty cell that needs to be filled
      if (block[i][j] === 0) return false;
    }
  }
  return true;
}

// Gets the total number of jobs waiting in the queue from master server
async function fetchTotalJobs() {
  // Total list of jobs available
  try {
    const response = await axios.get(`${MASTER_URL}/totalJobs`);
    return response.data.totalJobs;
  } catch (error) {
    console.error('Error checking job queue:', error.message);
    // Return 0 when we can't connect to indicate no available jobs
    return 0;
  }
}

// Retrieves a single job from the master's queue
async function fetchJob() {
  // Take a job from the queue if available
  try {
    const response = await axios.get(`${MASTER_URL}/queue`);
    return response.data;
  } catch (error) {
    // 404 means the queue is empty (no jobs available)
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error('Error fetching job:', error.message);
    return null;
  }
}

// Process a job by solving the assigned Sudoku block
async function solveSubJob(job) {
  // Extract job details - includes block position, current state and iteration info
  const { id, board, blockRow, blockCol, originalBoard, partialBoard, iteration } = job;
  // Use partial solution if available, otherwise use the original board
  const referenceBoard = partialBoard || originalBoard;
  
  console.log(`Processing job ${id} for block (${blockRow}, ${blockCol})`);
  console.log('Block before solving:', board);
  console.log('Reference board:', referenceBoard);
  
  try {
    // Track execution time for performance monitoring
    const startTime = process.hrtime();
    
    // Check if the block is already solved. If the block is already solved, we can mark all cells as unsure
    if (isBlockSolved(board)) {
      console.log('Block is already solved, marking all cells as unsure');
      // Create a mask where no cells are marked as "sure" (confident solutions)
      const sureMask = Array(board.length).fill().map(() => Array(board[0].length).fill(false));
      
      // Submit the unchanged block back to the master with all cells marked as unsure
      await axios.post(`${MASTER_URL}/result`, {
        id,
        board,
        blockRow,
        blockCol,
        sure: sureMask,
        iteration
      });
      
      console.log('Result recorded for job', id);
      return;
    }
    
    // Create a new StochasticBlockSolver instance and solve the block
    // The solver will use probability-based methods to fill the block
    const solver = new StochasticBlockSolver(referenceBoard, blockRow, blockCol, referenceBoard);
    const result = solver.solve();
    
    // Calculate and log execution time
    const diff = process.hrtime(startTime);
    const elapsedSeconds = (diff[0] + diff[1] / 1e9).toFixed(3);
    console.log(`Job ${id} completed in ${elapsedSeconds}s`);
    
    console.log('Solved block:', result.block);
    console.log('Sure mask:', result.sure);
    
    // Sending the result back to the master server
    // Includes the solved block and a mask indicating which cells we're confident about
    await axios.post(`${MASTER_URL}/result`, {
      id,
      board: result.block,
      blockRow,
      blockCol,
      sure: result.sure,
      iteration
    });
    
    console.log('Result recorded for job', id);
  } catch (error) {
    console.error(`Error solving job ${id}:`, error);
    
    try {
      // Even on error, submit a result back to avoid blocking the master
      // All cells are marked as unsure in this case
      await axios.post(`${MASTER_URL}/result`, {
        id,
        board,
        blockRow, 
        blockCol,
        sure: Array(board.length).fill().map(() => Array(board[0].length).fill(false)),
        iteration
      });
      console.log('Error result recorded for job', id);
    } catch (submitError) {
      console.error('Failed to submit error result:', submitError.message);
    }
  }
}

// Main worker loop that continuously checks for and processes jobs
async function fetchAndSolve() {
  // Main worker loop to fetch jobs and solve them
  try {
    // First check if any jobs are available
    const totalJobs = await fetchTotalJobs();
    console.log('Total jobs available:', totalJobs);
    
    if (totalJobs > 0) {
      console.log('Fetching job...');
      // Try to get a job assignment from the master
      const job = await fetchJob();
      
      if (job) {
        // Process the job if we received one
        await solveSubJob(job);
      }
    } else {
      console.log('No jobs available, waiting...');
    }
    
    // Wait for a short period before checking for new jobs
    // This creates a polling mechanism with a 1-second interval
    setTimeout(fetchAndSolve, 1000);
  } catch (error) {
    console.error('Error in fetch and solve loop:', error);
    // On error, wait longer before retrying to avoid overwhelming the server
    setTimeout(fetchAndSolve, 5000);
  }
}

// Start the worker process
console.log('Slave worker started.');
fetchAndSolve();
