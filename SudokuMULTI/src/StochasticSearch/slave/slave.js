// Worker file that connects to a master server to solve parts of Sudoku puzzles

const axios = require('axios');
const { StochasticBlockSolver } = require('./solver.js');

// Server address - defaults to localhost if not provided
const MASTER_URL = process.env.MASTER_URL || "http://localhost:3010";

// Checks if a block has no empty cells (all filled with numbers)
function isBlockSolved(block) {
  return block.every(row => row.every(cell => cell !== 0));
}

// Asks the master server how many jobs are waiting to be solved
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

// Gets a Sudoku subproblem from the master server
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

// Takes a job and tries to solve the Sudoku block
async function solveSubJob(job) {
  const { id, board, blockRow, blockCol, originalBoard, triedNumbers, partialBoard } = job;
  const referenceBoard = partialBoard || originalBoard;
  
  console.log(`Processing job ${id} for block (${blockRow}, ${blockCol})`);
  console.log('Block before solving:', board);
  console.log('Reference board:', referenceBoard);
  
  try {
    const startTime = Date.now();
    const solver = new StochasticBlockSolver(referenceBoard, blockRow, blockCol);
    const result = solver.solve();
    const duration = (Date.now() - startTime) / 1000;
    
    if (result && isBlockSolved(result.block)) {
      // Success - block is fully solved
      console.log(`Job ${id} completed in ${duration}s`);
      console.log('Solved block:', result.block);
      console.log('Sure mask:', result.sure);
      
      await axios.post(`${MASTER_URL}/result`, { 
        id, 
        board: result.block, 
        blockRow, 
        blockCol, 
        triedNumbers, 
        originalBoard: referenceBoard, 
        sure: result.sure,
        partialBoard: referenceBoard
      });
      
      console.log(`Result recorded for job ${id}`);
      return true;
    } else {
      // Could not solve the block completely
      console.log(`Job ${id} did not converge. Posting failure result.`);
      
      await axios.post(`${MASTER_URL}/result`, { 
        id, 
        board: result ? result.block : board, 
        blockRow, 
        blockCol, 
        triedNumbers, 
        originalBoard: referenceBoard, 
        sure: result ? result.sure : [],
        partialBoard: referenceBoard
      });
      
      return false;
    }
  } catch (error) {
    console.error(`Error solving job ${id}:`, error.message);
    return false;
  }
}

// Main worker loop - keeps checking for jobs and solving them
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
  
  // Wait a bit before looking for another job
  setTimeout(fetchAndSolve, 1000);
}

console.log('Slave worker started.');
fetchAndSolve();