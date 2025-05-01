// Worker file that connects to a master server to solve parts of Sudoku puzzles

const axios = require('axios');
const { StochasticBlockSolver } = require('../solver.js');

// Server address - defaults to localhost if not provided
const MASTER_URL = process.env.MASTER_URL || "http://localhost:3010";

// Checks if a block has no empty cells (all filled with numbers)
function isBlockSolved(block) {
  for (let i = 0; i < block.length; i++) {
    for (let j = 0; j < block[i].length; j++) {
      if (block[i][j] === 0) return false;
    }
  }
  return true;
}

// Asks the master server how many jobs are waiting to be solved
async function fetchTotalJobs() {
  try {
    const response = await axios.get(`${MASTER_URL}/totalJobs`);
    return response.data.totalJobs;
  } catch (error) {
    console.error('Error checking job queue:', error.message);
    return 0;
  }
}

// Gets a Sudoku subproblem from the master server
async function fetchJob() {
  try {
    const response = await axios.get(`${MASTER_URL}/queue`);
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null; // No jobs available
    }
    console.error('Error fetching job:', error.message);
    return null;
  }
}

// Takes a job and tries to solve the Sudoku block
async function solveSubJob(job) {
  const { id, board, blockRow, blockCol, originalBoard, partialBoard, iteration } = job;
  const referenceBoard = partialBoard || originalBoard;
  
  console.log(`Processing job ${id} for block (${blockRow}, ${blockCol})`);
  console.log('Block before solving:', board);
  console.log('Reference board:', referenceBoard);
  
  try {
    const startTime = process.hrtime();
    
    // Skip solving if the block is already fully filled
    if (isBlockSolved(board)) {
      console.log('Block is already solved, marking all cells as unsure');
      // Create a sureMask where only the original values are marked as sure
      const sureMask = Array(board.length).fill().map(() => Array(board[0].length).fill(false));
      
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
    
    // Otherwise solve the block
    const solver = new StochasticBlockSolver(referenceBoard, blockRow, blockCol, referenceBoard);
    const result = solver.solve();
    
    // Log the solution time
    const diff = process.hrtime(startTime);
    const elapsedSeconds = (diff[0] + diff[1] / 1e9).toFixed(3);
    console.log(`Job ${id} completed in ${elapsedSeconds}s`);
    
    // Validate the solution
    console.log('Solved block:', result.block);
    console.log('Sure mask:', result.sure);
    
    // Send the result back to the master
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
    
    // Send back the original block with all cells marked as unsure
    try {
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

// Main worker loop - keeps checking for jobs and solving them
async function fetchAndSolve() {
  try {
    const totalJobs = await fetchTotalJobs();
    console.log('Total jobs available:', totalJobs);
    
    if (totalJobs > 0) {
      console.log('Fetching job...');
      const job = await fetchJob();
      
      if (job) {
        await solveSubJob(job);
      }
    } else {
      console.log('No jobs available, waiting...');
    }
    
    // Wait a moment before looking for more jobs
    setTimeout(fetchAndSolve, 1000);
  } catch (error) {
    console.error('Error in fetch and solve loop:', error);
    setTimeout(fetchAndSolve, 5000); // Wait longer before retry on error
  }
}

console.log('Slave worker started.');
fetchAndSolve();