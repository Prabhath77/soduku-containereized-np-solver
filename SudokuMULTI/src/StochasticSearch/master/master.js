// Required modules for the server
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
// Import solver functions from external module
const { getBlockDimensions, getCandidates, StochasticBlockSolver } = require('./solver.js');
const { saveSolutionToFile } = require('./SaveSolution.js');

// Express server setup
const app = express();
const server = http.createServer(app);
const PORT = 3010;

// Job management data structures
const jobQueue = [];               // Queue of pending jobs to be processed
const completedJobs = {};          // Store completed sub-jobs by parent job ID
const jobSubJobCount = {};         // Track number of sub-jobs per parent job
const originalSubJobsStore = {};   // Keep original sub-job information for reference
const jobStartTimes = {};          // Track when jobs were started for timeout purposes
const lastUpdateTimes = {};        // Track last activity for each job to detect stalls
const currentBlueprintStore = {};  // Current state of each Sudoku puzzle being solved
const initialBlueprintStore = {};  // Original state of each puzzle for reference
const iterationCounts = {};        // Track solving iterations for each puzzle
const finalSolvedResults = {};     // Completed puzzles ready for client retrieval

// Middleware setup
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Debug logging helper function
function debugLog(prefix, data) {
  console.log(`[DEBUG] ${prefix}:`, JSON.stringify(data, null, 2));
}

// Apply naked singles technique (when a cell has only one possible value)
function applyNakedSingles(board) {
  const n = board.length;
  const workingBoard = board.map(row => [...row]);
  
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 100; // Prevent infinite loops
  
  // Continue until no more changes or max iterations reached
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    
    // Check each cell in the grid
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (workingBoard[i][j] === 0) {
          // Find valid candidates for this empty cell
          const candidates = getCandidates(workingBoard, i, j);
          console.log(`Cell (${i},${j}) has ${candidates.length} candidates: ${candidates}`);
          // If only one candidate, it must be the value for this cell
          if (candidates.length === 1) {
            workingBoard[i][j] = candidates[0];
            changed = true;
            console.log(`Applied naked single at (${i},${j}): ${candidates[0]}`);
          }
        }
      }
    }
  }
  
  // Copy results back to original board
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      board[i][j] = workingBoard[i][j];
    }
  }
  
  console.log(`[DEBUG] Applied naked singles in ${iterations} iterations`);
  return board;
}

// Check if a board is completely empty (all zeros)
function isEmptyBoard(board) {
  return board.every(row => row.every(cell => cell === 0));
}

// Identify blocks with conflicting values in rows or columns
function getConflictingBlocks(combinedBoard) {
  const gridSize = combinedBoard.length;
  const [blockRows, blockCols] = getBlockDimensions(gridSize);
  const conflictSet = new Set();

  // Look for row conflicts (same value in the same row)
  for (let i = 0; i < gridSize; i++) {
    const seen = {};
    for (let j = 0; j < gridSize; j++) {
      const value = combinedBoard[i][j];
      if (value === 0) continue;
      
      if (seen[value]) {
        // Found duplicate value in row, mark both containing blocks as conflicting
        const firstBlockCol = Math.floor(seen[value] / blockCols);
        const secondBlockCol = Math.floor(j / blockCols);
        const blockRow = Math.floor(i / blockRows);
        
        conflictSet.add(`${blockRow},${firstBlockCol}`);
        conflictSet.add(`${blockRow},${secondBlockCol}`);
      } else {
        seen[value] = j;
      }
    }
  }

  // Look for column conflicts (same value in the same column)
  for (let j = 0; j < gridSize; j++) {
    const seen = {};
    for (let i = 0; i < gridSize; i++) {
      const value = combinedBoard[i][j];
      if (value === 0) continue;
      
      if (seen[value]) {
        // Found duplicate value in column, mark both containing blocks as conflicting
        const firstBlockRow = Math.floor(seen[value] / blockRows);
        const secondBlockRow = Math.floor(i / blockRows);
        const blockCol = Math.floor(j / blockCols);
        
        conflictSet.add(`${firstBlockRow},${blockCol}`);
        conflictSet.add(`${secondBlockRow},${blockCol}`);
      } else {
        seen[value] = i;
      }
    }
  }

  // Convert set of conflict coordinates into array of conflict objects
  const conflicts = [];
  for (const coord of conflictSet) {
    const [blockRow, blockCol] = coord.split(',').map(Number);
    conflicts.push({ blockRow, blockCol });
  }
  
  return conflicts;
}

// Extract a specific block from the full Sudoku board
function extractBlock(board, blockRow, blockCol) {
  const n = board.length;
  const [blockRows, blockCols] = getBlockDimensions(n);
  const block = [];
  
  // Copy block cells into a new 2D array
  for (let i = 0; i < blockRows; i++) {
    const row = [];
    for (let j = 0; j < blockCols; j++) {
      row.push(board[blockRow * blockRows + i][blockCol * blockCols + j]);
    }
    block.push(row);
  }
  
  return block;
}

// Split a Sudoku puzzle into blocks for distributed solving
function splitAndQueueJob(jobId, board, gridSize, isRequeued = false) {
  console.log(`[DEBUG] Splitting board for job ${jobId}`);
  const [blockRows, blockCols] = getBlockDimensions(gridSize);
  const numBlockRows = gridSize / blockRows;
  const numBlockCols = gridSize / blockCols;
  const subJobs = [];
  
  let subJobCounter = 1;
  // Track solving iterations to manage progressive refinement
  if (isRequeued) {
    iterationCounts[jobId] = (iterationCounts[jobId] || 0) + 1;
    console.log(`[DEBUG] Starting iteration ${iterationCounts[jobId]} for job ${jobId}`);
  } else {
    iterationCounts[jobId] = 1;
  }
  
  // Create sub-jobs for each unsolved block
  for (let blockRow = 0; blockRow < numBlockRows; blockRow++) {
    for (let blockCol = 0; blockCol < numBlockCols; blockCol++) {
      // Get this specific block
      const block = extractBlock(board, blockRow, blockCol);
      
      // Skip blocks that are already completely solved
      if (block.flat().every(cell => cell !== 0)) continue;
      
      // Create a unique ID for this sub-job
      const subJobId = `${jobId}.${subJobCounter++}`;
      const subJob = { 
        id: subJobId, 
        board: block, 
        blockRow, 
        blockCol, 
        originalBoard: board.map(row => [...row]),
        iteration: iterationCounts[jobId]
      };
      
      // For requeued jobs, include current partial solution
      if (isRequeued) {
        subJob.isRequeued = true;
        subJob.partialBoard = board.map(row => [...row]);
      }
      
      subJobs.push(subJob);
      jobQueue.push(subJob);
    }
  }
  
  // Record how many sub-jobs were created for this job
  jobSubJobCount[jobId] = subJobs.length;
  
  console.log(`[DEBUG] Created ${subJobs.length} sub-jobs for job ${jobId} (iteration ${iterationCounts[jobId]})`);
  
  return subJobs;
}

// Update the global board state with "sure" values from completed jobs
function updatePartialBoardFromSure(parentId) {
  const blueprint = initialBlueprintStore[parentId];
  if (!blueprint) {
    console.error(`[ERROR] No blueprint found for job ${parentId}`);
    return;
  }
  
  const n = blueprint.length;
  const [blockRows, blockCols] = getBlockDimensions(n);
  let updatedBoard = Array(n).fill().map(() => Array(n).fill(0));
  
  // Start with original fixed values from the puzzle
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (blueprint[i][j] !== 0) {
        updatedBoard[i][j] = blueprint[i][j];
      }
    }
  }
  
  // Add "sure" values from completed jobs in the current iteration
  const currentIteration = iterationCounts[parentId] || 1;
  const currentResults = (completedJobs[parentId] || []).filter(job => job.iteration === currentIteration);
  
  // Apply high-confidence values from solved blocks
  currentResults.forEach(result => {
    const { blockRow, blockCol, board, sure } = result;
    const startRow = blockRow * blockRows;
    const startCol = blockCol * blockCols;
    
    for (let i = 0; i < blockRows; i++) {
      for (let j = 0; j < blockCols; j++) {
        if (sure && sure[i][j]) {
          updatedBoard[startRow + i][startCol + j] = board[i][j];
        }
      }
    }
  });
  
  // Apply constraint propagation to infer additional values
  applyNakedSingles(updatedBoard);
  
  // Store updated board for this job
  currentBlueprintStore[parentId] = updatedBoard;
  
  debugLog("Updated partial blueprint", updatedBoard);
}

// Requeue specific blocks that have conflicts for re-solving
function requeueConflictingBlocks(parentId, conflictingBlocks) {
  console.log(`[DEBUG] Requeuing ${conflictingBlocks.length} conflicting blocks for job ${parentId}: ${conflictingBlocks.map(c => `(${c.blockRow},${c.blockCol})`).join(', ')}`);
  
  // Update board with current "sure" values before requeuing
  updatePartialBoardFromSure(parentId);
  
  const blueprint = currentBlueprintStore[parentId];
  
  const newJobs = [];
  
  // Remove conflicting jobs from completed list to replace them
  completedJobs[parentId] = (completedJobs[parentId] || []).filter(job => 
    !conflictingBlocks.some(block => 
      block.blockRow === job.blockRow && block.blockCol === job.blockCol
    )
  );
  
  // Start new iteration for progressive refinement
  iterationCounts[parentId] = (iterationCounts[parentId] || 0) + 1;
  const newIteration = iterationCounts[parentId];
  console.log(`[DEBUG] Starting iteration ${newIteration} for job ${parentId} with conflicting blocks`);
  
  let subJobCounter = 1;
  
  // Create new jobs for the blocks with conflicts
  conflictingBlocks.forEach(({ blockRow, blockCol }) => {
    const block = extractBlock(blueprint, blockRow, blockCol);
    const id = `${parentId}.${subJobCounter++}`;
    
    const job = {
      id, 
      board: block, 
      blockRow, 
      blockCol, 
      originalBoard: blueprint,
      partialBoard: blueprint.map(row => [...row]),
      isRequeued: true,
      iteration: newIteration
    };
    
    newJobs.push(job);
  });
  
  // Update job count for this iteration
  jobSubJobCount[parentId] = newJobs.length;
  
  // Add all new jobs to the queue at once
  jobQueue.push(...newJobs);
  
  // Update timestamp to prevent timeout
  lastUpdateTimes[parentId] = Date.now();
  
  console.log(`[DEBUG] Successfully added ${newJobs.length} jobs for iteration ${newIteration}`);
}

// Requeue all blocks for a job (full restart with current knowledge)
function requeueJobs(parentId) {
  console.log(`[DEBUG] Requeuing all blocks for job ${parentId} (full restart)`);
  
  // First get confident values from existing solutions
  updatePartialBoardFromSure(parentId);
  
  // Clear pending jobs for this parent
  for (let i = jobQueue.length - 1; i >= 0; i--) {
    if (jobQueue[i].id.startsWith(parentId + '.')) {
      jobQueue.splice(i, 1);
    }
  }
  
  // Reset completed jobs for a fresh iteration
  completedJobs[parentId] = [];
  
  // Get current blueprint and create new jobs
  const blueprint = currentBlueprintStore[parentId];
  const n = blueprint.length;
  originalSubJobsStore[parentId] = splitAndQueueJob(parentId, blueprint, n, true);
  
  // Update timestamp to prevent timeout
  lastUpdateTimes[parentId] = Date.now();
}

// Combine individual block solutions into a complete board
function combineSections(parentId) {
  console.log(`[DEBUG] Combining sections for job ${parentId}`);
  
  const blueprint = currentBlueprintStore[parentId];
  if (!blueprint) {
    throw new Error(`No blueprint for job ${parentId}`);
  }
  
  const n = blueprint.length;
  const [blockRows, blockCols] = getBlockDimensions(n);
  const combined = blueprint.map(row => [...row]);
  
  // Only use results from current iteration to avoid mixing inconsistent solutions
  const currentIteration = iterationCounts[parentId];
  const currentResults = (completedJobs[parentId] || []).filter(job => job.iteration === currentIteration);
  
  console.log(`[DEBUG] Using ${currentResults.length} results from iteration ${currentIteration}`);
  
  // Merge solutions into the combined board, prioritizing "sure" values
  currentResults.forEach(result => {
    const { blockRow, blockCol, board, sure } = result;
    const startRow = blockRow * blockRows;
    const startCol = blockCol * blockCols;
    
    for (let i = 0; i < blockRows; i++) {
      for (let j = 0; j < blockCols; j++) {
        if (sure && sure[i][j]) {
          // High-confidence values take priority
          combined[startRow + i][startCol + j] = board[i][j];
        } else if (combined[startRow + i][startCol + j] === 0) {
          // Fall back to uncertain values if needed
          combined[startRow + i][startCol + j] = board[i][j];
        }
      }
    }
  });
  
  return combined;
}

// Validate a complete Sudoku solution
function isValidSudoku(board) {
  if (!board) return false;
  
  const n = board.length;
  
  // Check for any remaining empty cells
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (board[i][j] === 0) return false;
    }
  }
  
  // Check rows for duplicates
  for (let i = 0; i < n; i++) {
    const rowSet = new Set();
    for (let j = 0; j < n; j++) {
      if (rowSet.has(board[i][j])) return false;
      rowSet.add(board[i][j]);
    }
  }
  
  // Check columns for duplicates
  for (let j = 0; j < n; j++) {
    const colSet = new Set();
    for (let i = 0; i < n; i++) {
      if (colSet.has(board[i][j])) return false;
      colSet.add(board[i][j]);
    }
  }
  
  // Check each block for duplicates
  const [blockRows, blockCols] = getBlockDimensions(n);
  for (let blockRow = 0; blockRow < n/blockRows; blockRow++) {
    for (let blockCol = 0; blockCol < n/blockCols; blockCol++) {
      const blockSet = new Set();
      for (let i = 0; i < blockRows; i++) {
        for (let j = 0; j < blockCols; j++) {
          const value = board[blockRow * blockRows + i][blockCol * blockCols + j];
          if (blockSet.has(value)) return false;
          blockSet.add(value);
        }
      }
    }
  }
  
  return true;
}

// Regularly check if jobs are complete or need adjustment
function checkAndCombineResults() {
  const now = Date.now();
  
  // Check each active job
  Object.keys(originalSubJobsStore).forEach(jobId => {
    const currentIteration = iterationCounts[jobId] || 1;
    const currentResults = (completedJobs[jobId] || []).filter(job => job.iteration === currentIteration);
    const expected = jobSubJobCount[jobId] || 0;
    const actual = currentResults.length;
    
    if (actual > 0) {
      // Update with confirmed values when there's new data
      updatePartialBoardFromSure(jobId);
    }
    
    // Check if all sub-jobs for this iteration are completed
    if (expected > 0 && actual >= expected) {
      console.log(`[DEBUG] All results (${actual}/${expected}) received for job ${jobId} iteration ${currentIteration}, combining...`);
      
      // Try constraint propagation solution first (may be simpler)
      const blueprint = currentBlueprintStore[jobId];
      if (blueprint.flat().every(cell => cell !== 0) && isValidSudoku(blueprint)) {
        // Solution found through constraint propagation
        finalSolvedResults[jobId] = { 
          board: blueprint,
          timestamp: now 
        };
        saveSolutionToFile(jobId, blueprint);
        console.log(`[DEBUG] Job ${jobId} completed through constraint propagation`);
        
        // Clean up completed job data
        delete originalSubJobsStore[jobId];
        delete completedJobs[jobId];
        delete currentBlueprintStore[jobId];
        delete initialBlueprintStore[jobId];
        delete jobStartTimes[jobId];
        delete lastUpdateTimes[jobId];
        delete iterationCounts[jobId];
        return;
      }
      
      // Try combining all block solutions
      try {
        const combinedBoard = combineSections(jobId);
        
        if (isValidSudoku(combinedBoard)) {
          // Valid solution found by combining blocks
          finalSolvedResults[jobId] = { 
            board: combinedBoard,
            timestamp: now 
          };
          saveSolutionToFile(jobId, combinedBoard);
          console.log(`[DEBUG] Valid combined solution found for job ${jobId} at iteration ${currentIteration}`);
          
          // Clean up completed job data
          delete originalSubJobsStore[jobId];
          delete completedJobs[jobId];
          delete currentBlueprintStore[jobId];
          delete initialBlueprintStore[jobId];
          delete jobStartTimes[jobId];
          delete lastUpdateTimes[jobId];
          delete iterationCounts[jobId];
        } else {
          // Conflicts detected, try again with refined approach
          console.log(`[DEBUG] Invalid combined solution for job ${jobId}, checking for conflicts`);
          const conflictingBlocks = getConflictingBlocks(combinedBoard);
          
          if (conflictingBlocks.length > 0) {
            // Only retry the specific blocks causing conflicts
            console.log(`[DEBUG] Found ${conflictingBlocks.length} conflicting blocks`);
            requeueConflictingBlocks(jobId, conflictingBlocks);
          } else {
            // If can't identify specific conflicts, restart everything
            requeueJobs(jobId);
          }
        }
      } catch (e) {
        console.error(`[ERROR] Error combining sections for job ${jobId}:`, e);
        requeueJobs(jobId);
      }
    } else if (expected > 0 && now - (lastUpdateTimes[jobId] || 0) > 120000) {
      // Requeue if job appears to be stalled (no updates for 2 minutes)
      console.log(`[DEBUG] Job ${jobId} stalled (${actual}/${expected}) in iteration ${currentIteration}, requeuing all blocks`);
      requeueJobs(jobId);
    }
  });
  
  // Schedule next check
  setTimeout(checkAndCombineResults, 1000);
}

// API route to retrieve final results of a job
app.get('/FinalsolvedResults', (req, res) => {
  const { jobId } = req.query;
  console.log(`[DEBUG] Checking results for job ${jobId}`);
  
  if (!jobId) {
    return res.status(400).json({ error: 'Missing jobId parameter' });
  }
  
  // Return completed solution if available
  if (finalSolvedResults[jobId]) {
    return res.status(200).json({ 
      jobId, 
      solvedBoard: finalSolvedResults[jobId].board, 
      status: 'completed' 
    });
  }
  
  // Check if current state is already a valid solution
  const current = currentBlueprintStore[jobId];
  if (current && isValidSudoku(current)) {
    finalSolvedResults[jobId] = { 
      board: current, 
      timestamp: Date.now() 
    };
    return res.status(200).json({ 
      jobId, 
      solvedBoard: current, 
      status: 'completed' 
    });
  }
  
  // Return progress information if job is still processing
  if (current) {
    const filled = current.flat().filter(cell => cell !== 0).length;
    const total = current.length * current.length;
    const currentIteration = iterationCounts[jobId] || 1;
    return res.json({ 
      status: 'processing', 
      progress: Math.floor((filled / total) * 100),
      iteration: currentIteration
    });
  }
  
  return res.status(404).json({ error: 'Job not found or not yet started' });
});

// API endpoint to submit a new Sudoku solving job
app.post('/solve', (req, res) => {
  const { board } = req.body;
  
  if (!Array.isArray(board)) {
    return res.status(400).json({ error: 'Invalid board format' });
  }
  
  const gridSize = board.length;
  const jobId = Date.now().toString();
  
  // Initialize job tracking data
  jobStartTimes[jobId] = Date.now();
  initialBlueprintStore[jobId] = board.map(row => [...row]);
  iterationCounts[jobId] = 1;
  
  // Work with a copy of the board
  const workingBoard = board.map(row => [...row]);
  
  // Try constraint propagation first as it's fastest
  applyNakedSingles(workingBoard);
  
  // Check if already solved by simple techniques
  if (workingBoard.flat().every(cell => cell !== 0) && isValidSudoku(workingBoard)) {
    finalSolvedResults[jobId] = { 
      board: workingBoard, 
      timestamp: Date.now() 
    };
    saveSolutionToFile(jobId, workingBoard);
    
    return res.json({ 
      jobId, 
      status: 'completed',
      solvedBoard: workingBoard 
    });
  }
  
  // Special case for completely empty boards - seed with one solved block
  if (isEmptyBoard(workingBoard)) {
    const [blockRows, blockCols] = getBlockDimensions(gridSize);
    try {
      // Initialize with one solved block to bootstrap the process
      const solver = new StochasticBlockSolver(workingBoard, 0, 0);
      const result = solver.solve();
      
      // Set first block with a valid solution
      for (let i = 0; i < blockRows; i++) {
        for (let j = 0; j < blockCols; j++) {
          workingBoard[i][j] = result.block[i][j];
        }
      }
      
      // Propagate constraints from this seed block
      applyNakedSingles(workingBoard);
    } catch (e) {
      console.error('[ERROR] Failed to pre-solve first block:', e);
    }
  }
  
  // Store current state
  currentBlueprintStore[jobId] = workingBoard;
  
  // Split puzzle into blocks and queue for distributed solving
  const subJobs = splitAndQueueJob(jobId, workingBoard, gridSize);
  jobSubJobCount[jobId] = subJobs.length;
  originalSubJobsStore[jobId] = subJobs;
  lastUpdateTimes[jobId] = Date.now();
  
  return res.json({ 
    jobId, 
    status: 'processing',
    message: 'Job accepted and queued',
    partialBoard: workingBoard
  });
});

// API endpoint to check job queue status
app.get('/totalJobs', (req, res) => {
  res.status(200).json({ totalJobs: jobQueue.length });
});

// API endpoint for workers to get next job
app.get('/queue', (req, res) => {
  const job = jobQueue.shift();
  
  if (!job) {
    return res.status(404).json({ error: 'No jobs available' });
  }
  
  const jobId = job.id.split('.')[0];
  
  // Provide latest global board state for context in requeued jobs
  if (job.isRequeued && currentBlueprintStore[jobId]) {
    job.partialBoard = currentBlueprintStore[jobId];
  }
  
  return res.status(200).json(job);
});

// API endpoint for workers to submit results
app.post('/result', (req, res) => {
  const { id, board, blockRow, blockCol, sure, iteration } = req.body;
  const jobId = id.split('.')[0];
  
  console.log(`[DEBUG] Result received for job ${jobId}: block (${blockRow}, ${blockCol}) from iteration ${iteration || 1}`);
  
  if (!id || !board || blockRow === undefined || blockCol === undefined || !sure) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Store with iteration info for progressive refinement
  completedJobs[jobId] = completedJobs[jobId] || [];
  completedJobs[jobId].push({ 
    id, 
    board, 
    blockRow, 
    blockCol, 
    sure,
    iteration: iteration || 1 
  });
  
  // Track last activity to detect stalled jobs
  lastUpdateTimes[jobId] = Date.now();
  
  // Update shared state with new results
  updatePartialBoardFromSure(jobId);
  
  // Log progress for monitoring
  const currentIteration = iterationCounts[jobId] || 1;
  const currentResults = completedJobs[jobId].filter(job => job.iteration === currentIteration);
  const expected = jobSubJobCount[jobId] || 0;
  const actual = currentResults.length;
  console.log(`[DEBUG] Progress for job ${jobId} iteration ${currentIteration}: ${actual}/${expected} blocks completed`);
  
  return res.json({ status: 'received' });
});

// Start the periodic result checker
checkAndCombineResults();

// Start the server
server.listen(PORT, () => {
  console.log(`StochasticSearch master server running on port ${PORT}`);
});
