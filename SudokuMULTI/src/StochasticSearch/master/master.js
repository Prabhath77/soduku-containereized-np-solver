const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { getBlockDimensions } = require('./solver.js');
const { saveSolutionToFile } = require('./SaveSolution.js');
const { StochasticBlockSolver } = require('./solver.js');

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
const nextSubJobIndex = {};       

const finalSolvedResults = {};

const resultQueue = {};
let isProcessingResults = false;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Print formatted debug information
function debugLog(prefix, data) {
  console.log(`[DEBUG] ${prefix}:`, JSON.stringify(data, null, 2));
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
      const val = combinedBoard[i][j];
      if (val === 0) continue;
      if (seen[val]) {
        const prevBlock = { row: Math.floor(i / blockRows), col: Math.floor(seen[val].j / blockCols) };
        const currBlock = { row: Math.floor(i / blockRows), col: Math.floor(j / blockCols) };
        conflictSet.add(`${prevBlock.row},${prevBlock.col}`);
        conflictSet.add(`${currBlock.row},${currBlock.col}`);
      } else {
        seen[val] = { i, j };
      }
    }
  }

  // Check column conflicts
  for (let j = 0; j < gridSize; j++) {
    const seen = {};
    for (let i = 0; i < gridSize; i++) {
      const val = combinedBoard[i][j];
      if (val === 0) continue;
      if (seen[val]) {
        const prevBlock = { row: Math.floor(seen[val].i / blockRows), col: Math.floor(j / blockCols) };
        const currBlock = { row: Math.floor(i / blockRows), col: Math.floor(j / blockCols) };
        conflictSet.add(`${prevBlock.row},${prevBlock.col}`);
        conflictSet.add(`${currBlock.row},${currBlock.col}`);
      } else {
        seen[val] = { i, j };
      }
    }
  }

  // Convert to array of conflict objects
  const conflicts = [];
  conflictSet.forEach(str => {
    const parts = str.split(',').map(Number);
    conflicts.push({ blockRow: parts[0], blockCol: parts[1] });
  });
  return conflicts;
}

// Extract a single block from the full board
function extractBlock(board, blockRow, blockCol) {
  const gridSize = board.length;
  const [blockRows, blockCols] = getBlockDimensions(gridSize);
  const subGrid = [];
  for (let i = 0; i < blockRows; i++) {
    const rowValues = [];
    for (let j = 0; j < blockCols; j++) {
      rowValues.push(board[blockRow * blockRows + i][blockCol * blockCols + j]);
    }
    subGrid.push(rowValues);
  }
  return subGrid;
}

// Split a Sudoku board into smaller blocks and queue them as jobs
function splitAndQueueJob(jobId, board, gridSize, isRequeued = false) {
  const subJobs = [];
  const [blockRows, blockCols] = getBlockDimensions(gridSize);
  const numBlocksRow = gridSize / blockRows;
  const numBlocksCol = gridSize / blockCols;

  nextSubJobIndex[jobId] = 1;
  console.log(`[DEBUG] Splitting board for job ${jobId}`);

  let actualSubJobCount = 0;

  for (let br = 0; br < numBlocksRow; br++) {
    for (let bc = 0; bc < numBlocksCol; bc++) {
      let hasEmptyCell = false;
      const subGrid = [];
      for (let i = 0; i < blockRows; i++) {
        const rowValues = [];
        for (let j = 0; j < blockCols; j++) {
          const r = br * blockRows + i;
          const c = bc * blockCols + j;
          const value = board[r][c];
          rowValues.push(value);
          if (value === 0) hasEmptyCell = true;
        }
        subGrid.push(rowValues);
      }
      if (hasEmptyCell) {
        const subJobId = `${jobId}.${nextSubJobIndex[jobId]++}`;
        const subJob = {
          id: subJobId,
          board: subGrid,
          blockRow: br,
          blockCol: bc,
          originalBoard: board.map(row => [...row])
        };
        if (isRequeued) {
          subJob.partialBoard = board.map(row => [...row]);
          subJob.isRequeued = true;
        }
        subJobs.push(subJob);
        jobQueue.push(subJob);
        console.log(`[DEBUG] Queued sub-job ${subJobId} for block (${br}, ${bc})${isRequeued ? ' [REQUEUED]' : ''}`);
        actualSubJobCount++;  // Count only blocks that need solving
      }
    }
  }
  
  // Update job count to reflect only blocks that need solving
  if (!isRequeued) {
    jobSubJobCount[jobId] = actualSubJobCount;
  }
  
  return subJobs;
}

// remove
const lastBoardLogTimes = {};
// Update the main board with cells that we're confident about
function updatePartialBoardFromSure(parentId) {
  console.log(`[DEBUG] Updating partial board from sure values for job ${parentId}`);
  const subJobs = originalSubJobsStore[parentId];
  if (!subJobs || subJobs.length === 0) return false;

  const gridSize = subJobs[0].originalBoard.length;
  const [blockRows, blockCols] = getBlockDimensions(gridSize);

  const initialBoard = initialBlueprintStore[parentId];
  let updatedBoard = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));

  // Apply original fixed values from the puzzle
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if (initialBoard[i][j] !== 0) {
        updatedBoard[i][j] = initialBoard[i][j];
      }
    }
  }

  let hasChanges = false;

  // Apply only cells marked as "sure" from completed jobs
  (completedJobs[parentId] || []).forEach(result => {
    const br = result.blockRow;
    const bc = result.blockCol;
    
    for (let i = 0; i < blockRows; i++) {
      for (let j = 0; j < blockCols; j++) {
        if (result.sure && result.sure[i][j] === true) {
          const globalRow = br * blockRows + i;
          const globalCol = bc * blockCols + j;
          
          if (updatedBoard[globalRow][globalCol] !== result.board[i][j]) {
            hasChanges = true;
          }
          updatedBoard[globalRow][globalCol] = result.board[i][j];
        }
      }
    }
  });

  currentBlueprintStore[parentId] = updatedBoard;
  
  // Update all pending jobs with the latest board state
  originalSubJobsStore[parentId].forEach(job => {
    job.partialBoard = updatedBoard.map(row => [...row]);
  });

  // console.log(`[DEBUG] Blueprint updated for job ${parentId}`);
  // debugLog("Updated board", updatedBoard);

  // Log with throttling
  const now = Date.now();
  if (!lastBoardLogTimes[parentId] || now - lastBoardLogTimes[parentId] > 5000) {
    console.log(`[DEBUG] Blueprint updated for job ${parentId}`);
    debugLog("Updated board", updatedBoard);
    lastBoardLogTimes[parentId] = now;
  }
  
  return hasChanges;
}

// Reprocess blocks with conflicts
function requeueConflictingBlocks(parentId, conflictingBlocks) {
  console.log(`[DEBUG] Requeuing conflicting blocks for job ${parentId}:`, conflictingBlocks);
  
  updatePartialBoardFromSure(parentId);
  
  let board = currentBlueprintStore[parentId];
  const gridSize = board.length;
  
  nextSubJobIndex[parentId] = 1;
  
  completedJobs[parentId] = [];
  console.log(`[DEBUG] Cleared all previous results for job ${parentId} for new iteration`);
  
  conflictingBlocks.forEach(conflict => {
    const subGrid = extractBlock(board, conflict.blockRow, conflict.blockCol);
    
    const subJobId = `${parentId}.${nextSubJobIndex[parentId]++}`;
    
    const subJob = {
      id: subJobId,
      board: subGrid,
      blockRow: conflict.blockRow,
      blockCol: conflict.blockCol,
      originalBoard: board.map(row => [...row]),  
      partialBoard: board.map(row => [...row]),   
      triedNumbers: {},
      isRequeued: true
    };
    
    jobQueue.push(subJob);
    originalSubJobsStore[parentId].push(subJob);
    console.log(`[DEBUG] Requeued sub-job ${subJobId} for block (${conflict.blockRow}, ${conflict.blockCol})`);
  });
}

// Restart the solving process for all parts of a puzzle
function requeueJobs(parentId) {
  console.log(`[DEBUG] Requeuing all sub-jobs for job ${parentId} (full requeue)`);
  
  updatePartialBoardFromSure(parentId);
  let blueprint = currentBlueprintStore[parentId];
  
  completedJobs[parentId] = [];
  
  const gridSize = blueprint.length;
  const subJobs = splitAndQueueJob(parentId, blueprint, gridSize, true);
  originalSubJobsStore[parentId] = subJobs;
  lastUpdateTimes[parentId] = Date.now();
}

// Merge all solved blocks into one complete board
function combineSections(parentId) {
  console.log(`[DEBUG] Combining results for job ${parentId}`);
  const blueprint = currentBlueprintStore[parentId];
  
  if (!blueprint) {
    console.error(`No blueprint available for job ${parentId}, falling back to initial blueprint`);
    // Fall back to initial blueprint instead of throwing
    if (initialBlueprintStore[parentId]) {
      return initialBlueprintStore[parentId].map(row => [...row]);
    }
    throw new Error(`No blueprint available for job ${parentId}`);
  }
  
  const gridSize = blueprint.length;
  const combinedBoard = blueprint.map(row => [...row]);
  const [blockRows, blockCols] = getBlockDimensions(gridSize);
  
  let validSubJobs = 0;
  let invalidSubJobs = 0;
  
  (completedJobs[parentId] || []).forEach(subJob => {
    try {
      // Check if subJob or its board is undefined/malformed
      if (!subJob || !subJob.board || !Array.isArray(subJob.board)) {
        console.error(`[DEBUG] Invalid sub-job structure for ${subJob?.id || 'unknown'}`);
        invalidSubJobs++;
        return; // Continue with next subjob - skip this one
      }
      
      // Validate the block dimensions
      if (subJob.board.length !== blockRows || 
          subJob.board.some(row => row.length !== blockCols)) {
        console.error(`[DEBUG] Invalid dimensions for sub-job ${subJob.id}: expected ${blockRows}x${blockCols}`);
        invalidSubJobs++;
        return; // Continue with next subjob - skip this one
      }
      
      // Check block validity
      if (!isBlockValid(subJob.board, blockRows * blockCols)) {
        console.error(`[DEBUG] Sub-job ${subJob.id} block invalid - skipping this block`);
        invalidSubJobs++;
        return; // Continue with next subjob - skip this one
      }
      
      // Validate block position
      if (typeof subJob.blockRow !== 'number' || typeof subJob.blockCol !== 'number' ||
          subJob.blockRow < 0 || subJob.blockCol < 0 ||
          subJob.blockRow >= gridSize/blockRows || subJob.blockCol >= gridSize/blockCols) {
        console.error(`[DEBUG] Invalid block position for sub-job ${subJob.id}: (${subJob.blockRow}, ${subJob.blockCol})`);
        invalidSubJobs++;
        return; // Continue with next subjob - skip this one
      }
      
      // Apply the block to the combined board with boundary checks
      const br = subJob.blockRow;
      const bc = subJob.blockCol;
      
      for (let i = 0; i < blockRows; i++) {
        if (i >= subJob.board.length) continue;
        
        for (let j = 0; j < blockCols; j++) {
          if (j >= subJob.board[i].length) continue;
          
          const globalRow = br * blockRows + i;
          const globalCol = bc * blockCols + j;
          
          if (globalRow < gridSize && globalCol < gridSize) {
            combinedBoard[globalRow][globalCol] = subJob.board[i][j];
          }
        }
      }
      
      validSubJobs++;
      
    } catch (error) {
      console.error(`[DEBUG] Error processing sub-job ${subJob?.id || 'unknown'}: ${error.message}`);
      invalidSubJobs++;
      return; // Continue with next subjob - skip this one
    }
  });
  
  console.log(`[DEBUG] Combined ${validSubJobs} valid sub-jobs, skipped ${invalidSubJobs} invalid sub-jobs`);
  debugLog("Combined board", combinedBoard);
  return combinedBoard;
}

// Verify if a completed Sudoku board follows all the rules
function isValidSudoku(board) {
  const gridSize = board.length;
  
  // Check rows
  for (let row = 0; row < gridSize; row++) {
    const rowSet = new Set();
    for (let col = 0; col < gridSize; col++) {
      const value = board[row][col];
      if (value === 0) return false;
      if (rowSet.has(value)) return false;
      rowSet.add(value);
    }
  }
  
  // Check columns
  for (let col = 0; col < gridSize; col++) {
    const colSet = new Set();
    for (let row = 0; row < gridSize; row++) {
      const value = board[row][col];
      if (colSet.has(value)) return false; 
      colSet.add(value);
    }
  }
  
  // Check blocks
  const [blockRows, blockCols] = getBlockDimensions(gridSize);
  for (let blockRow = 0; blockRow < gridSize/blockRows; blockRow++) {
    for (let blockCol = 0; blockCol < gridSize/blockCols; blockCol++) {
      const subGrid = extractBlock(board, blockRow, blockCol);
      if (!isBlockValid(subGrid, gridSize)) return false;
    }
  }
  
  return true;
}

// Periodically check progress and combine partial results
function checkAndCombineResults() {
  const now = Date.now();
  Object.keys(originalSubJobsStore).forEach(parentId => {
    const expected = jobSubJobCount[parentId];
    const actual = completedJobs[parentId] ? completedJobs[parentId].length : 0;
    
    console.log(`[DEBUG] Job ${parentId}: ${actual}/${expected} subjobs completed`);

    if (actual > 0) {
      updatePartialBoardFromSure(parentId);
    }

    const blueprint = currentBlueprintStore[parentId];
    
    // 1. Analyze which blocks still need processing
    const [blockRows, blockCols] = getBlockDimensions(blueprint.length);
    const numBlocksRow = blueprint.length / blockRows;
    const numBlocksCol = blueprint.length / blockCols;
    
    // Track which blocks still need processing
    const unsolvedBlocks = [];
    let totalUnsolvedCells = 0;
    
    // Check each block to see if it's fully solved
    for (let br = 0; br < numBlocksRow; br++) {
      for (let bc = 0; bc < numBlocksCol; bc++) {
        const blockGrid = extractBlock(blueprint, br, bc);
        const emptyCellCount = blockGrid.flat().filter(cell => cell === 0).length;
        
        if (emptyCellCount > 0) {
          unsolvedBlocks.push({ blockRow: br, blockCol: bc, emptyCellCount });
          totalUnsolvedCells += emptyCellCount;
        }
      }
    }
    
    // 2. Check if there are jobs for this parent in the queue
    const jobsInQueue = jobQueue.filter(job => job.id.startsWith(`${parentId}.`)).length;
    
    console.log(`[DEBUG] Job ${parentId}: ${unsolvedBlocks.length} blocks with ${totalUnsolvedCells} unsolved cells, ${jobsInQueue} jobs in queue`);
    
    // 3. Make intelligent decisions about requeuing
    if (unsolvedBlocks.length > 0 && jobsInQueue === 0) {
      // We have unsolved blocks but no jobs in queue - possible stall
      
      // Check if we've made progress since last update
      const lastBlueprint = completedJobs[parentId] && completedJobs[parentId].length > 0 ? 
        completedJobs[parentId][0].originalBoard : initialBlueprintStore[parentId];
      
      // Count empty cells in last blueprint
      const lastEmptyCells = lastBlueprint.flat().filter(cell => cell === 0).length;
      const currentEmptyCells = blueprint.flat().filter(cell => cell === 0).length;
      const progress = lastEmptyCells - currentEmptyCells;
      
      if (progress <= 0 && now - lastUpdateTimes[parentId] > 10000) {
        // No progress made and it's been at least 10 seconds - try specific blocks first
        console.log(`[DEBUG] STALLED JOB DETECTED: ${parentId} has ${unsolvedBlocks.length} unsolved blocks with no progress`);
        
        if (unsolvedBlocks.length <= 3) {
          // If only a few blocks are problematic, just requeue those
          console.log(`[DEBUG] Requeuing only ${unsolvedBlocks.length} problem blocks`);
          requeueConflictingBlocks(parentId, unsolvedBlocks);
        } else {
          // Too many problem blocks, do a full requeue
          console.log(`[DEBUG] Too many problem blocks (${unsolvedBlocks.length}), doing full requeue`);
          requeueJobs(parentId);
        }
        return; // Skip further processing for this job
      }
    }

    const isCompleteBlueprint = blueprint.every(row => row.every(cell => cell !== 0));

    const threshold = 90000 * (blueprint.length / 9);

    if (actual < expected) {
      if (isCompleteBlueprint && isValidSudoku(blueprint)) {
        // Solution found through partial results
        const elapsedMinutes = ((Date.now() - jobStartTimes[parentId]) / 60000).toFixed(2);
        console.log(`[DEBUG] Job ${parentId} solved via blueprint in ${elapsedMinutes} minutes.`);
        console.log(`Final board for job ${parentId}:`, blueprint);
        saveSolutionToFile(parentId, blueprint);
        
        finalSolvedResults[parentId] = {
          jobId: parentId,
          solvedBoard: blueprint,
          status: 'completed',
          solveTime: elapsedMinutes
        };
        
        // Clean up completed job data
        delete originalSubJobsStore[parentId];
        delete completedJobs[parentId];
        delete jobSubJobCount[parentId];
        delete lastUpdateTimes[parentId];
        delete jobStartTimes[parentId];
        delete currentBlueprintStore[parentId];
        delete initialBlueprintStore[parentId];
        delete nextSubJobIndex[parentId];
      } else if (now - lastUpdateTimes[parentId] > threshold) {
        // Timeout - restart processing
        console.log(`[DEBUG] No update for job ${parentId} in over ${(threshold/60000).toFixed(2)} minutes. Requeuing missing sub-jobs.`);
        requeueJobs(parentId);
      }
    } else if (actual === expected) {
      try {
        // All sub-jobs completed, try to combine
        const combinedBoard = combineSections(parentId);
        if (isValidSudoku(combinedBoard)) {
          // Puzzle solved successfully
          const elapsedMinutes = ((Date.now() - jobStartTimes[parentId]) / 60000).toFixed(2);
          console.log(`[DEBUG] Job ${parentId} solved in ${elapsedMinutes} minutes.`);
          console.log(`Final board for job ${parentId}:`, combinedBoard);
          saveSolutionToFile(parentId, combinedBoard);
          
          finalSolvedResults[parentId] = {
            jobId: parentId,
            solvedBoard: combinedBoard,
            status: 'completed',
            solveTime: elapsedMinutes
          };
          
          // Clean up job data
          delete originalSubJobsStore[parentId];
          delete completedJobs[parentId];
          delete jobSubJobCount[parentId];
          delete lastUpdateTimes[parentId];
          delete jobStartTimes[parentId];
          delete currentBlueprintStore[parentId];
          delete initialBlueprintStore[parentId];
          delete nextSubJobIndex[parentId];
        } else {
          // Handle invalid combined result
          console.log(`[DEBUG] Combined board for job ${parentId} is invalid. Updating partial board based on sure mask.`);
          updatePartialBoardFromSure(parentId);
          const newCombinedBoard = combineSections(parentId);
          const conflictingBlocks = getConflictingBlocks(newCombinedBoard);
          if (conflictingBlocks.length > 0) {
            console.log(`[DEBUG] Job ${parentId}: Found conflicts in blocks. Requeuing only those blocks.`);
            requeueConflictingBlocks(parentId, conflictingBlocks);
          } else {
            console.log(`[DEBUG] No specific conflicts identified. Requeuing entire job.`);
            requeueJobs(parentId);
          }
        }
      } catch (error) {
        console.error(`[DEBUG] Error combining sub-jobs for job ${parentId}:`, error.message);
        requeueJobs(parentId);
      }
    }
  });
  setTimeout(checkAndCombineResults, 1000);
}

// API to get solved results for a specific job
app.get('/FinalsolvedResults', (req, res) => {
  const { jobId } = req.query;
  
  if (!jobId) {
    return res.status(400).json({ error: 'Missing jobId parameter' });
  }
  
  if (finalSolvedResults[jobId]) {
    return res.status(200).json(finalSolvedResults[jobId]);
  }
  
  try {
    if (completedJobs[jobId] && completedJobs[jobId].length === jobSubJobCount[jobId]) {
        try {
          const combinedBoard = combineSections(jobId);
          
          // Check if the solution is complete (no zeros)
          if (!combinedBoard.some(row => row.some(cell => cell === 0))) {
            const elapsedMinutes = ((Date.now() - jobStartTimes[jobId]) / 60000).toFixed(2);
            
            // Store this result for future requests
            finalSolvedResults[jobId] = {
              jobId: jobId,
              solvedBoard: combinedBoard,
              status: 'completed',
              solveTime: elapsedMinutes
            };
            
            return res.status(200).json(finalSolvedResults[jobId]);
          }
        } catch (combineError) {
          console.error(`Error combining results for job ${jobId}:`, combineError);
          // Continue to the processing status response
        }
      }
      // Check if job exists but is still in progress
      if (jobStartTimes[jobId] || currentBlueprintStore[jobId]) {
        const completedCount = completedJobs[jobId]?.length || 0;
        const totalCount = jobSubJobCount[jobId] || 0;
        
        return res.status(200).json({
          jobId: jobId,
          status: 'processing',
          progress: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
        });
      }
      // Job not found
      return res.status(404).json({
        error: 'Job not found',
        status: 'unknown'
      });
    } catch (error) {
      console.error(`Error retrieving results for job ${jobId}:`, error);
    
      // Return processing status instead of error to keep frontend polling
      return res.status(200).json({
        jobId: jobId,
        status: 'processing',
        message: 'An error occurred while retrieving results, but the job may still be processing'
      });
    }
});

// Process new Sudoku puzzle submission
app.post('/solve', (req, res) => {
  const { board } = req.body;
  if (!board || !Array.isArray(board)) {
    return res.status(400).json({ error: 'Invalid board format.' });
  }
  const gridSize = board.length;
  const jobId = Date.now().toString();
  console.log(`[DEBUG] New job ${jobId} for ${gridSize}x${gridSize} grid`);
  jobStartTimes[jobId] = Date.now();

  initialBlueprintStore[jobId] = board.map(row => [...row]);

  // For empty boards, pre-solve first block to get started
  if (isEmptyBoard(board)) {
    try {
      const solver = new StochasticBlockSolver(board, 0, 0);
      const result = solver.solve();
      const [blockRows, blockCols] = getBlockDimensions(gridSize);
      
      for (let i = 0; i < blockRows; i++) {
        for (let j = 0; j < blockCols; j++) {
          board[i][j] = result.block[i][j];
          result.sure[i][j] = true;
        }
      }
      console.log(`[DEBUG] Empty grid detected. Pre-solved block (0,0) and forced sure mask; updated blueprint board.`);
    } catch (error) {
      console.error("[DEBUG] Error pre-solving block (0,0) for empty board:", error);
      return res.status(500).json({ error: "Error pre-solving empty grid." });
    }
  }
  
  currentBlueprintStore[jobId] = board.map(row => [...row]);
  const subJobs = splitAndQueueJob(jobId, board, gridSize);
  jobSubJobCount[jobId] = subJobs.length;
  originalSubJobsStore[jobId] = subJobs;
  lastUpdateTimes[jobId] = Date.now();
  console.log(`[DEBUG] ${subJobs.length} sub-jobs queued for job ${jobId}`);
  
  res.status(200).json({
    jobId,
    message: 'Job accepted and queued for processing',
    status: 'processing'
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
  
  const parentId = job.id.split('.')[0];
  
  if (!job.originalBoard && initialBlueprintStore[parentId]) {
    job.originalBoard = initialBlueprintStore[parentId].map(row => [...row]);
  }
  
  if (job.isRequeued && currentBlueprintStore[parentId]) {
    job.partialBoard = currentBlueprintStore[parentId].map(row => [...row]);
  }
  
  // Fix empty blocks if needed
  const isAllZeroes = job.board.every(row => row.every(cell => cell === 0));
  if (isAllZeroes) {
    const [blockRows, blockCols] = getBlockDimensions(job.originalBoard.length);
    
    const extractedBlock = extractBlock(
      currentBlueprintStore[parentId],
      job.blockRow,
      job.blockCol
    );
    
    if (!extractedBlock.every(row => row.every(cell => cell === 0))) {
      job.board = extractedBlock;
    }
  }
  
  res.status(200).json(job);
});

// Process results from workers
// app.post('/result', (req, res) => {
//   const { id, board, blockRow, blockCol, triedNumbers, originalBoard, sure, partialBoard } = req.body;
  
//   const orig = partialBoard || originalBoard;
//   if (!id || !board || blockRow === undefined || blockCol === undefined || typeof sure === 'undefined') {
//     return res.status(400).json({ error: 'Missing id, board, blockRow, blockCol, or sure array' });
//   }
  
//   const parentId = id.split('.')[0];
//   let finalOrig = orig;
  
//   if (!finalOrig) {
//     const subJobs = originalSubJobsStore[parentId];
//     if (subJobs) {
//       const subJob = subJobs.find(job => job.id === id);
//       if (subJob) finalOrig = subJob.partialBoard || subJob.originalBoard;
//     }
//   }
  
//   if (!finalOrig && initialBlueprintStore[parentId]) {
//     finalOrig = initialBlueprintStore[parentId];
//   }
  
//   if (!finalOrig) {
//     return res.status(400).json({ error: 'Partial board missing' });
//   }
  
//   console.log(`[DEBUG] Received result for sub-job ${id}`);
//   debugLog("Result board", board);
//   debugLog("Sure mask", sure);
  
//   // Store the result
//   if (!completedJobs[parentId]) {
//     completedJobs[parentId] = [];
//   }
//   completedJobs[parentId].push({ id, board, blockRow, blockCol, triedNumbers, originalBoard: finalOrig, sure });
//   lastUpdateTimes[parentId] = Date.now();
  
//   updatePartialBoardFromSure(parentId);
  
//   res.status(200).json({ id, status: 'partial' });
// });

app.post('/result', (req, res) => {
  const { id, board, blockRow, blockCol, triedNumbers, originalBoard, sure, partialBoard } = req.body;
  
  if (!id || !board || blockRow === undefined || blockCol === undefined || typeof sure === 'undefined') {
    return res.status(400).json({ error: 'Missing id, board, blockRow, blockCol, or sure array' });
  }
  
  const parentId = id.split('.')[0];
  
  // Add to queue instead of processing immediately
  if (!resultQueue[parentId]) {
    resultQueue[parentId] = [];
  }
  
  // Queue the result with all its data
  resultQueue[parentId].push({
    id, board, blockRow, blockCol, triedNumbers, originalBoard, sure, partialBoard
  });
  
  // Update timestamp
  lastUpdateTimes[parentId] = Date.now();
  
  console.log(`[DEBUG] Queued result for sub-job ${id} (${resultQueue[parentId].length} results pending for job ${parentId})`);
  
  // Respond immediately without waiting for processing
  res.status(200).json({ id, status: 'queued' });
  
  // Trigger processing if not already running
  if (!isProcessingResults) {
    processResultQueue();
  }
});

// New function to process results sequentially
async function processResultQueue() {
  if (isProcessingResults) return;
  
  isProcessingResults = true;
  
  try {
    // Process each job's results
    for (const parentId of Object.keys(resultQueue)) {
      // Process all queued results for this job
      while (resultQueue[parentId] && resultQueue[parentId].length > 0) {
        const result = resultQueue[parentId].shift();
        await processResult(result);
      }
      
      // Clean up empty queues
      if (resultQueue[parentId] && resultQueue[parentId].length === 0) {
        delete resultQueue[parentId];
      }
    }
  } catch (error) {
    console.error('[DEBUG] Error processing result queue:', error);
  } finally {
    isProcessingResults = false;
    
    // Check if more results arrived while processing
    if (Object.keys(resultQueue).some(key => resultQueue[key].length > 0)) {
      setImmediate(processResultQueue);
    }
  }
}

// Process a single result
async function processResult(result) {
  const { id, board, blockRow, blockCol, triedNumbers, originalBoard, sure, partialBoard } = result;
  
  const parentId = id.split('.')[0];
  let finalOrig = partialBoard || originalBoard;
  
  if (!finalOrig) {
    const subJobs = originalSubJobsStore[parentId];
    if (subJobs) {
      const subJob = subJobs.find(job => job.id === id);
      if (subJob) finalOrig = subJob.partialBoard || subJob.originalBoard;
    }
  }
  
  if (!finalOrig && initialBlueprintStore[parentId]) {
    finalOrig = initialBlueprintStore[parentId];
  }
  
  if (!finalOrig) {
    console.error(`[DEBUG] Partial board missing for job ${id}`);
    return;
  }
  
  console.log(`[DEBUG] Processing result for sub-job ${id}`);
  debugLog("Result board", board);
  debugLog("Sure mask", sure);
  
  // Store the result
  if (!completedJobs[parentId]) {
    completedJobs[parentId] = [];
  }
  
  completedJobs[parentId].push({ 
    id, board, blockRow, blockCol, triedNumbers, 
    originalBoard: finalOrig, sure 
  });
  
  // Update the partial board with new results
  updatePartialBoardFromSure(parentId);
}

// Start the result checking process
checkAndCombineResults();

server.listen(PORT, () => {
  console.log(`StochasticSearch master server running on port ${PORT}`);
});
