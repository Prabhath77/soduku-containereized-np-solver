const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { getBlockDimensions } = require('../solver.js');
const { saveSolutionToFile } = require('./SaveSolution.js');
const { StochasticBlockSolver } = require('../solver.js');

const app = express();
const server = http.createServer(app);

const PORT = 3010;

// Main storage for tracking all Sudoku solving jobs
const jobQueue = [];
const completedJobs = {};          
const jobSubJobCount = {};         
const originalSubJobsStore = {};    
const jobStartTimes = {};          
const lastUpdateTimes = {};        
const currentBlueprintStore = {};  
const initialBlueprintStore = {};  
const iterationCounts = {};        // Track iteration number for each job
const finalSolvedResults = {};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Print formatted debug information
function debugLog(prefix, data) {
  console.log(`[DEBUG] ${prefix}:`, JSON.stringify(data, null, 2));
}

// Check if a value is valid at a given position
function isConsistent(board, row, col, value) {
  const n = board.length;
  
  // Check row
  for (let i = 0; i < n; i++) {
    if (board[row][i] === value) {
      return false;
    }
  }
  
  // Check column
  for (let i = 0; i < n; i++) {
    if (board[i][col] === value) {
      return false;
    }
  }
  
  // Check block
  const [blockRows, blockCols] = getBlockDimensions(n);
  const blockRowStart = Math.floor(row / blockRows) * blockRows;
  const blockColStart = Math.floor(col / blockCols) * blockCols;
  
  for (let i = 0; i < blockRows; i++) {
    for (let j = 0; j < blockCols; j++) {
      if (board[blockRowStart + i][blockColStart + j] === value) {
        return false;
      }
    }
  }
  
  return true;
}

// Get valid candidates for a cell
function getCandidates(board, row, col) {
  if (board[row][col] !== 0) {
    return [];
  }
  
  const n = board.length;
  const candidates = [];
  
  for (let num = 1; num <= n; num++) {
    if (isConsistent(board, row, col, num)) {
      candidates.push(num);
    }
  }
  
  return candidates;
}

// Apply naked singles constraint propagation
function applyNakedSingles(board) {
  const n = board.length;
  const workingBoard = board.map(row => [...row]);
  
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 100; // Limit iterations to prevent infinite loops
  
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (workingBoard[i][j] === 0) {
          const candidates = getCandidates(workingBoard, i, j);
          if (candidates.length === 1) {
            workingBoard[i][j] = candidates[0];
            changed = true;
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

// Check if board is completely empty
function isEmptyBoard(board) {
  return board.every(row => row.every(cell => cell === 0));
}

// Check if all numbers in a block follow Sudoku rules
function isBlockValid(subGrid, fullSize) {
  const expectedSet = new Set();
  for (let d = 1; d <= fullSize; d++) {
    expectedSet.add(d);
  }
  const blockNumbers = subGrid.flat();
  if (blockNumbers.includes(0)) return false;
  if (blockNumbers.length !== fullSize) return false;
  const blockSet = new Set(blockNumbers);
  if (blockSet.size !== expectedSet.size) return false;
  for (const num of expectedSet) {
    if (!blockSet.has(num)) return false;
  }
  return true;
}

// Identify blocks that have conflicting values
function getConflictingBlocks(combinedBoard) {
  const gridSize = combinedBoard.length;
  const [blockRows, blockCols] = getBlockDimensions(gridSize);
  const conflictSet = new Set();

  // Check row conflicts
  for (let i = 0; i < gridSize; i++) {
    const seen = {};
    for (let j = 0; j < gridSize; j++) {
      const value = combinedBoard[i][j];
      if (value === 0) continue;
      
      if (seen[value]) {
        // Found duplicate in row - mark both blocks as conflicting
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

  // Check column conflicts
  for (let j = 0; j < gridSize; j++) {
    const seen = {};
    for (let i = 0; i < gridSize; i++) {
      const value = combinedBoard[i][j];
      if (value === 0) continue;
      
      if (seen[value]) {
        // Found duplicate in column - mark both blocks as conflicting
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

  // Convert to array of conflict objects
  const conflicts = [];
  for (const coord of conflictSet) {
    const [blockRow, blockCol] = coord.split(',').map(Number);
    conflicts.push({ blockRow, blockCol });
  }
  
  return conflicts;
}

// Extract a single block from the full board
function extractBlock(board, blockRow, blockCol) {
  const n = board.length;
  const [blockRows, blockCols] = getBlockDimensions(n);
  const block = [];
  
  for (let i = 0; i < blockRows; i++) {
    const row = [];
    for (let j = 0; j < blockCols; j++) {
      row.push(board[blockRow * blockRows + i][blockCol * blockCols + j]);
    }
    block.push(row);
  }
  
  return block;
}

// Split a Sudoku board into smaller blocks and queue them as jobs
function splitAndQueueJob(jobId, board, gridSize, isRequeued = false) {
  console.log(`[DEBUG] Splitting board for job ${jobId}`);
  const [blockRows, blockCols] = getBlockDimensions(gridSize);
  const numBlockRows = gridSize / blockRows;
  const numBlockCols = gridSize / blockCols;
  const subJobs = [];
  
  // Reset counters for new iteration
  let subJobCounter = 1;
  
  // Increment iteration count
  if (isRequeued) {
    iterationCounts[jobId] = (iterationCounts[jobId] || 0) + 1;
    console.log(`[DEBUG] Starting iteration ${iterationCounts[jobId]} for job ${jobId}`);
  } else {
    iterationCounts[jobId] = 1;
  }
  
  for (let blockRow = 0; blockRow < numBlockRows; blockRow++) {
    for (let blockCol = 0; blockCol < numBlockCols; blockCol++) {
      // Extract this block from the board
      const block = extractBlock(board, blockRow, blockCol);
      
      // Skip if block is already solved (no 0s)
      if (block.flat().every(cell => cell !== 0)) continue;
      
      // Create a sub-job for this block
      const subJobId = `${jobId}.${subJobCounter++}`;
      const subJob = { 
        id: subJobId, 
        board: block, 
        blockRow, 
        blockCol, 
        originalBoard: board.map(row => [...row]),
        iteration: iterationCounts[jobId]
      };
      
      if (isRequeued) {
        subJob.isRequeued = true;
        subJob.partialBoard = board.map(row => [...row]);
      }
      
      subJobs.push(subJob);
      jobQueue.push(subJob);
    }
  }
  
  // Update job count for this iteration
  jobSubJobCount[jobId] = subJobs.length;
  
  console.log(`[DEBUG] Created ${subJobs.length} sub-jobs for job ${jobId} (iteration ${iterationCounts[jobId]})`);
  
  return subJobs;
}

// Update the main board with cells that we're confident about
function updatePartialBoardFromSure(parentId) {
  const blueprint = initialBlueprintStore[parentId];
  if (!blueprint) {
    console.error(`[ERROR] No blueprint found for job ${parentId}`);
    return;
  }
  
  const n = blueprint.length;
  const [blockRows, blockCols] = getBlockDimensions(n);
  let updatedBoard = Array(n).fill().map(() => Array(n).fill(0));
  
  // Start with fixed original values
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (blueprint[i][j] !== 0) {
        updatedBoard[i][j] = blueprint[i][j];
      }
    }
  }
  
  // Add all values we're sure about from completed sub-jobs of the current iteration
  const currentIteration = iterationCounts[parentId] || 1;
  const currentResults = (completedJobs[parentId] || []).filter(job => job.iteration === currentIteration);
  
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
  
  // Apply naked singles propagation
  applyNakedSingles(updatedBoard);
  
  currentBlueprintStore[parentId] = updatedBoard;
  
  debugLog("Updated partial blueprint", updatedBoard);
}

// Reprocess blocks with conflicts
function requeueConflictingBlocks(parentId, conflictingBlocks) {
  // Improved logging with detailed block information
  console.log(`[DEBUG] Requeuing ${conflictingBlocks.length} conflicting blocks for job ${parentId}: ${conflictingBlocks.map(c => `(${c.blockRow},${c.blockCol})`).join(', ')}`);
  
  // Make sure we have an updated blueprint
  updatePartialBoardFromSure(parentId);
  
  // Get current blueprint state
  const blueprint = currentBlueprintStore[parentId];
  
  // Create a batch of jobs to add atomically
  const newJobs = [];
  
  // Remove conflicting blocks from completed jobs first
  completedJobs[parentId] = (completedJobs[parentId] || []).filter(job => 
    !conflictingBlocks.some(block => 
      block.blockRow === job.blockRow && block.blockCol === job.blockCol
    )
  );
  
  // Increment iteration count
  iterationCounts[parentId] = (iterationCounts[parentId] || 0) + 1;
  const newIteration = iterationCounts[parentId];
  console.log(`[DEBUG] Starting iteration ${newIteration} for job ${parentId} with conflicting blocks`);
  
  // Reset counter for sub-jobs in this new iteration
  let subJobCounter = 1;
  
  // Prepare all jobs before adding them to the queue
  conflictingBlocks.forEach(({ blockRow, blockCol }) => {
    const block = extractBlock(blueprint, blockRow, blockCol);
    const id = `${parentId}.${subJobCounter++}`;
    
    // Create complete job object with all necessary fields
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
  
  // Add all jobs to the queue at once (atomic operation)
  jobQueue.push(...newJobs);
  
  // Only update timestamp when ALL jobs are queued
  lastUpdateTimes[parentId] = Date.now();
  
  console.log(`[DEBUG] Successfully added ${newJobs.length} jobs for iteration ${newIteration}`);
}

// Restart the solving process for all parts of a puzzle
function requeueJobs(parentId) {
  console.log(`[DEBUG] Requeuing all blocks for job ${parentId} (full restart)`);
  
  // First update the blueprint with confirmed values
  updatePartialBoardFromSure(parentId);
  
  // Clear pending jobs for this puzzle
  for (let i = jobQueue.length - 1; i >= 0; i--) {
    if (jobQueue[i].id.startsWith(parentId + '.')) {
      jobQueue.splice(i, 1);
    }
  }
  
  // Reset completed jobs for new iteration counting
  completedJobs[parentId] = [];
  
  // Create fresh sub-jobs based on current state
  const blueprint = currentBlueprintStore[parentId];
  const n = blueprint.length;
  originalSubJobsStore[parentId] = splitAndQueueJob(parentId, blueprint, n, true);
  
  // Update timestamps
  lastUpdateTimes[parentId] = Date.now();
}

// Merge all solved blocks into one complete board
function combineSections(parentId) {
  console.log(`[DEBUG] Combining sections for job ${parentId}`);
  
  const blueprint = currentBlueprintStore[parentId];
  if (!blueprint) {
    throw new Error(`No blueprint for job ${parentId}`);
  }
  
  const n = blueprint.length;
  const [blockRows, blockCols] = getBlockDimensions(n);
  const combined = blueprint.map(row => [...row]);
  
  // Only use results from the current iteration
  const currentIteration = iterationCounts[parentId];
  const currentResults = (completedJobs[parentId] || []).filter(job => job.iteration === currentIteration);
  
  console.log(`[DEBUG] Using ${currentResults.length} results from iteration ${currentIteration}`);
  
  // Fill in values from completed blocks
  currentResults.forEach(result => {
    const { blockRow, blockCol, board, sure } = result;
    const startRow = blockRow * blockRows;
    const startCol = blockCol * blockCols;
    
    for (let i = 0; i < blockRows; i++) {
      for (let j = 0; j < blockCols; j++) {
        // Only use values we're sure about or fill in with proposed solutions if needed
        if (sure && sure[i][j]) {
          combined[startRow + i][startCol + j] = board[i][j];
        } else if (combined[startRow + i][startCol + j] === 0) {
          // Use uncertain values only if we don't have anything better
          combined[startRow + i][startCol + j] = board[i][j];
        }
      }
    }
  });
  
  return combined;
}

// Verify if a completed Sudoku board follows all the rules
function isValidSudoku(board) {
  if (!board) return false;
  
  const n = board.length;
  
  // Check for incomplete cells
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (board[i][j] === 0) return false;
    }
  }
  
  // Check rows
  for (let i = 0; i < n; i++) {
    const rowSet = new Set();
    for (let j = 0; j < n; j++) {
      if (rowSet.has(board[i][j])) return false;
      rowSet.add(board[i][j]);
    }
  }
  
  // Check columns
  for (let j = 0; j < n; j++) {
    const colSet = new Set();
    for (let i = 0; i < n; i++) {
      if (colSet.has(board[i][j])) return false;
      colSet.add(board[i][j]);
    }
  }
  
  // Check blocks
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

// Periodically check progress and combine partial results
function checkAndCombineResults() {
  const now = Date.now();
  
  Object.keys(originalSubJobsStore).forEach(jobId => {
    const currentIteration = iterationCounts[jobId] || 1;
    const currentResults = (completedJobs[jobId] || []).filter(job => job.iteration === currentIteration);
    const expected = jobSubJobCount[jobId] || 0;
    const actual = currentResults.length;
    
    if (actual > 0) {
      // Update the blueprint with any newly confirmed values
      updatePartialBoardFromSure(jobId);
    }
    
    // If all subjobs for the current iteration are complete, try to combine into full solution
    if (expected > 0 && actual >= expected) {
      console.log(`[DEBUG] All results (${actual}/${expected}) received for job ${jobId} iteration ${currentIteration}, combining...`);
      
      // Check if we already have a valid solution directly from constraint propagation
      const blueprint = currentBlueprintStore[jobId];
      if (blueprint.flat().every(cell => cell !== 0) && isValidSudoku(blueprint)) {
        finalSolvedResults[jobId] = { 
          board: blueprint,
          timestamp: now 
        };
        saveSolutionToFile(jobId, blueprint);
        console.log(`[DEBUG] Job ${jobId} completed through constraint propagation`);
        
        // Clean up resources
        delete originalSubJobsStore[jobId];
        delete completedJobs[jobId];
        delete currentBlueprintStore[jobId];
        delete initialBlueprintStore[jobId];
        delete jobStartTimes[jobId];
        delete lastUpdateTimes[jobId];
        delete iterationCounts[jobId];
        return;
      }
      
      // Otherwise try to combine all block solutions
      try {
        const combinedBoard = combineSections(jobId);
        
        if (isValidSudoku(combinedBoard)) {
          // Success! We have a valid solution
          finalSolvedResults[jobId] = { 
            board: combinedBoard,
            timestamp: now 
          };
          saveSolutionToFile(jobId, combinedBoard);
          console.log(`[DEBUG] Valid combined solution found for job ${jobId} at iteration ${currentIteration}`);
          
          // Clean up resources
          delete originalSubJobsStore[jobId];
          delete completedJobs[jobId];
          delete currentBlueprintStore[jobId];
          delete initialBlueprintStore[jobId];
          delete jobStartTimes[jobId];
          delete lastUpdateTimes[jobId];
          delete iterationCounts[jobId];
        } else {
          // Found some conflicts, requeue problematic blocks
          console.log(`[DEBUG] Invalid combined solution for job ${jobId}, checking for conflicts`);
          const conflictingBlocks = getConflictingBlocks(combinedBoard);
          
          if (conflictingBlocks.length > 0) {
            console.log(`[DEBUG] Found ${conflictingBlocks.length} conflicting blocks`);
            requeueConflictingBlocks(jobId, conflictingBlocks);
          } else {
            // No specific conflicts found but solution is invalid, restart everything
            requeueJobs(jobId);
          }
        }
      } catch (e) {
        console.error(`[ERROR] Error combining sections for job ${jobId}:`, e);
        requeueJobs(jobId);
      }
    } else if (expected > 0 && now - (lastUpdateTimes[jobId] || 0) > 120000) {
      // If no progress for 2 minutes, restart
      console.log(`[DEBUG] Job ${jobId} stalled (${actual}/${expected}) in iteration ${currentIteration}, requeuing all blocks`);
      requeueJobs(jobId);
    }
  });
  
  // Check again after 1 second
  setTimeout(checkAndCombineResults, 1000);
}

// API to get solved results for a specific job
app.get('/FinalsolvedResults', (req, res) => {
  const { jobId } = req.query;
  console.log(`[DEBUG] Checking results for job ${jobId}`);
  
  if (!jobId) {
    return res.status(400).json({ error: 'Missing jobId parameter' });
  }
  
  if (finalSolvedResults[jobId]) {
    return res.status(200).json({ 
      jobId, 
      solvedBoard: finalSolvedResults[jobId].board, 
      status: 'completed' 
    });
  }
  
  // Check if we have a current state that might be solved
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
  
  // Return progress information
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

// Process new Sudoku puzzle submission
app.post('/solve', (req, res) => {
  const { board } = req.body;
  
  if (!Array.isArray(board)) {
    return res.status(400).json({ error: 'Invalid board format' });
  }
  
  const gridSize = board.length;
  const jobId = Date.now().toString();
  
  jobStartTimes[jobId] = Date.now();
  initialBlueprintStore[jobId] = board.map(row => [...row]);
  iterationCounts[jobId] = 1;
  
  // Create a working copy of the board
  const workingBoard = board.map(row => [...row]);
  
  // Apply ONLY naked singles constraint propagation
  applyNakedSingles(workingBoard);
  
  // Check if the board is already solved by constraint propagation alone
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
  
  // Handle completely empty boards
  if (isEmptyBoard(workingBoard)) {
    const [blockRows, blockCols] = getBlockDimensions(gridSize);
    try {
      // Pre-solve the first block to provide a starting point
      const solver = new StochasticBlockSolver(workingBoard, 0, 0);
      const result = solver.solve();
      
      // Update the board with the first block solution
      for (let i = 0; i < blockRows; i++) {
        for (let j = 0; j < blockCols; j++) {
          workingBoard[i][j] = result.block[i][j];
        }
      }
      
      // Apply naked singles again
      applyNakedSingles(workingBoard);
    } catch (e) {
      console.error('[ERROR] Failed to pre-solve first block:', e);
    }
  }
  
  // Store current board state
  currentBlueprintStore[jobId] = workingBoard;
  
  // Split the puzzle into blocks and queue them
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

// Get number of jobs waiting in the queue
app.get('/totalJobs', (req, res) => {
  res.status(200).json({ totalJobs: jobQueue.length });
});

// Assign a job to a worker
app.get('/queue', (req, res) => {
  const job = jobQueue.shift();
  
  if (!job) {
    return res.status(404).json({ error: 'No jobs available' });
  }
  
  const jobId = job.id.split('.')[0];
  
  // For requeued jobs, provide the latest board state
  if (job.isRequeued && currentBlueprintStore[jobId]) {
    job.partialBoard = currentBlueprintStore[jobId];
  }
  
  return res.status(200).json(job);
});

// Process results from workers
app.post('/result', (req, res) => {
  const { id, board, blockRow, blockCol, sure, iteration } = req.body;
  const jobId = id.split('.')[0];
  
  console.log(`[DEBUG] Result received for job ${jobId}: block (${blockRow}, ${blockCol}) from iteration ${iteration || 1}`);
  
  if (!id || !board || blockRow === undefined || blockCol === undefined || !sure) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Store the result with iteration tracking
  completedJobs[jobId] = completedJobs[jobId] || [];
  completedJobs[jobId].push({ 
    id, 
    board, 
    blockRow, 
    blockCol, 
    sure,
    iteration: iteration || 1 
  });
  
  // Update last activity timestamp
  lastUpdateTimes[jobId] = Date.now();
  
  // Update partial blueprint with confirmed values
  updatePartialBoardFromSure(jobId);
  
  // Log progress
  const currentIteration = iterationCounts[jobId] || 1;
  const currentResults = completedJobs[jobId].filter(job => job.iteration === currentIteration);
  const expected = jobSubJobCount[jobId] || 0;
  const actual = currentResults.length;
  console.log(`[DEBUG] Progress for job ${jobId} iteration ${currentIteration}: ${actual}/${expected} blocks completed`);
  
  return res.json({ status: 'received' });
});

// Start the result checking process
checkAndCombineResults();

server.listen(PORT, () => {
  console.log(`StochasticSearch master server running on port ${PORT}`);
});