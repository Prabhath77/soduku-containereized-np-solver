const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { getBlockDimensions, isValid, enhancedConstraintPropagation } = require('./solver.js');
const { saveSolutionToFile } = require('./SaveSolution.js');
const { StochasticBlockSolver } = require('./solver.js');

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Storage for all Sudoku jobs and states
let jobQueue = [];
const completedJobs = {};
const jobSubJobCount = {};
const originalSubJobsStore = {};
const jobStartTimes = {};
const lastUpdateTimes = {};
const currentBlueprintStore = {};
const initialBlueprintStore = {};
const finalSolvedResults = {};
const nextSubJobIndex = {};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Apply advanced constraint propagation to the entire board
function applyAdvancedConstraintPropagation(board) {
  return enhancedConstraintPropagation(board);
}

// Free memory by removing all data for completed jobs
function cleanupJobData(jobId) {
  delete originalSubJobsStore[jobId];
  delete completedJobs[jobId];
  delete jobSubJobCount[jobId];
  delete currentBlueprintStore[jobId];
  delete initialBlueprintStore[jobId];
  delete jobStartTimes[jobId];
  delete lastUpdateTimes[jobId];
  delete nextSubJobIndex[jobId];
  if (global.gc) global.gc();
}

// Remove solved results older than one hour
function cleanupOldResults() {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  for (const [id, res] of Object.entries(finalSolvedResults)) {
    if (res.timestamp && now - res.timestamp > ONE_HOUR) {
      delete finalSolvedResults[id];
    }
  }
  setTimeout(cleanupOldResults, 15 * 60 * 1000);
}

// Extract a sub-block from the board at position (br, bc)
function extractBlock(board, br, bc) {
  const N = board.length;
  const [rSize, cSize] = getBlockDimensions(N);
  const block = [];
  for (let i = 0; i < rSize; i++) {
    const row = [];
    for (let j = 0; j < cSize; j++) {
      row.push(board[br * rSize + i][bc * cSize + j]);
    }
    block.push(row);
  }
  return block;
}

// Divide a Sudoku board into smaller blocks and add them to the job queue
function splitAndQueueJob(jobId, board, N, requeue = false) {
  const [rSize, cSize] = getBlockDimensions(N);
  nextSubJobIndex[jobId] = 1;
  const subs = [];
  for (let br = 0; br < N / rSize; br++) {
    for (let bc = 0; bc < N / cSize; bc++) {
      const block = extractBlock(board, br, bc);
      if (block.flat().some(v => v === 0)) {
        const id = `${jobId}.${nextSubJobIndex[jobId]++}`;
        const job = { id, board: block, blockRow: br, blockCol: bc };
        if (requeue) job.isRequeued = true;
        jobQueue.push(job);
        subs.push(job);
      }
    }
  }
  return subs;
}

// Update the current board state using confirmed values from completed jobs
function updatePartialBoardFromSure(jobId) {
  const initial = initialBlueprintStore[jobId];
  const N = initial.length;
  const [rSize, cSize] = getBlockDimensions(N);

  // Start with initial clues
  const updated = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (initial[i][j] !== 0) updated[i][j] = initial[i][j];
    }
  }

  // Add confirmed values from completed sub-jobs
  (completedJobs[jobId] || []).forEach(res => {
    const baseRow = res.blockRow * rSize;
    const baseCol = res.blockCol * cSize;
    for (let i = 0; i < rSize; i++) {
      for (let j = 0; j < cSize; j++) {
        if (res.sure[i][j]) {
          updated[baseRow + i][baseCol + j] = res.board[i][j];
        }
      }
    }
  });
  
  // Apply advanced constraint propagation to potentially discover more values
  applyAdvancedConstraintPropagation(updated);

  currentBlueprintStore[jobId] = updated;
  originalSubJobsStore[jobId].forEach(sb => sb.isRequeued = true);
}

// Find blocks with conflicting values in rows or columns
function getConflictingBlocks(board) {
  const N = board.length;
  const [rSize, cSize] = getBlockDimensions(N);
  const conflicts = new Set();

  // Check rows for conflicts
  for (let i = 0; i < N; i++) {
    const seen = {};
    for (let j = 0; j < N; j++) {
      const v = board[i][j];
      if (v === 0) continue;
      if (seen[v] !== undefined) {
        const prevJ = seen[v];
        const prevBr = Math.floor(i / rSize);
        const prevBc = Math.floor(prevJ / cSize);
        conflicts.add(`${prevBr},${prevBc}`);
        conflicts.add(`${Math.floor(i / rSize)},${Math.floor(j / cSize)}`);
      } else seen[v] = j;
    }
  }

  // Check columns for conflicts
  for (let j = 0; j < N; j++) {
    const seen = {};
    for (let i = 0; i < N; i++) {
      const v = board[i][j];
      if (v === 0) continue;
      if (seen[v] !== undefined) {
        const prevI = seen[v];
        const prevBr = Math.floor(prevI / rSize);
        const prevBc = Math.floor(j / cSize);
        conflicts.add(`${prevBr},${prevBc}`);
        conflicts.add(`${Math.floor(i / rSize)},${Math.floor(j / cSize)}`);
      } else seen[v] = i;
    }
  }

  return Array.from(conflicts).map(str => {
    const [br, bc] = str.split(',').map(Number);
    return { blockRow: br, blockCol: bc };
  });
}

// Requeue only blocks with conflicts to be resolved
function requeueConflictingBlocks(jobId, conflictBlocks) {
  console.log(`[DEBUG] Requeuing ${conflictBlocks.length} conflicting blocks for job ${jobId}: ${conflictBlocks.map(c => `(${c.blockRow},${c.blockCol})`).join(', ')}`);
  
  updatePartialBoardFromSure(jobId);
  const board = currentBlueprintStore[jobId];
  const N = board.length;
  const [rSize, cSize] = getBlockDimensions(N);
  nextSubJobIndex[jobId] = 1;

  // Remove conflicting blocks from completed jobs
  completedJobs[jobId] = (completedJobs[jobId] || []).filter(res =>
    !conflictBlocks.some(c => c.blockRow === res.blockRow && c.blockCol === res.blockCol)
  );

  // Add conflicting blocks back to the job queue
  conflictBlocks.forEach(c => {
    const block = extractBlock(board, c.blockRow, c.blockCol);
    const id = `${jobId}.${nextSubJobIndex[jobId]++}`;
    const sub = { id, board: block, blockRow: c.blockRow, blockCol: c.blockCol, isRequeued: true };
    jobQueue.push(sub);
    originalSubJobsStore[jobId].push(sub);
  });
}

// Restart the entire job if it's taking too long
function requeueAll(jobId) {
  updatePartialBoardFromSure(jobId);

  // Remove pending jobs for this puzzle
  jobQueue = jobQueue.filter(j => j.id.split('.')[0] !== jobId);

  // Reset completed jobs
  completedJobs[jobId] = [];

  // Create fresh sub-jobs
  const board = currentBlueprintStore[jobId];
  const N = board.length;
  originalSubJobsStore[jobId] = splitAndQueueJob(jobId, board, N, true);

  lastUpdateTimes[jobId] = Date.now();
}

// Combine all solved sub-blocks into one complete board
function combineSections(jobId) {
  const base = currentBlueprintStore[jobId];
  if (!base) throw new Error(`No blueprint for ${jobId}`);
  const N = base.length;
  const [rSize, cSize] = getBlockDimensions(N);
  const combined = base.map(r => [...r]);

  (completedJobs[jobId] || []).forEach(res => {
    const r0 = res.blockRow * rSize;
    const c0 = res.blockCol * cSize;
    for (let i = 0; i < rSize; i++) {
      for (let j = 0; j < cSize; j++) {
        combined[r0 + i][c0 + j] = res.board[i][j];
      }
    }
  });

  return combined;
}

// Check if a Sudoku board is valid and complete
function isValidSudoku(board) {
  const N = board.length;
  const root = Math.sqrt(N);
  if (!Number.isInteger(root)) return false;
  if (board.flat().some(v => v === 0)) return false;

  // Check rows and columns
  for (let i = 0; i < N; i++) {
    const row = new Set();
    const col = new Set();
    for (let j = 0; j < N; j++) {
      row.add(board[i][j]);
      col.add(board[j][i]);
    }
    if (row.size !== N || col.size !== N) return false;
  }

  // Check blocks
  for (let br = 0; br < root; br++) {
    for (let bc = 0; bc < root; bc++) {
      const block = new Set();
      for (let i = 0; i < root; i++) {
        for (let j = 0; j < root; j++) {
          block.add(board[br*root + i][bc*root + j]);
        }
      }
      if (block.size !== N) return false;
    }
  }

  return true;
}

// Main processing loop to check job progress and combine results
function checkAndCombineResults() {
  const now = Date.now();
  Object.keys(originalSubJobsStore).forEach(jobId => {
    const expected = jobSubJobCount[jobId] || originalSubJobsStore[jobId].length;
    const actual = (completedJobs[jobId] || []).length;

    if (actual > 0) updatePartialBoardFromSure(jobId);

    if (actual < expected) {
      // Requeue if no progress after threshold time
      // Use a longer threshold for difficult puzzles
      const threshold = 120000 * ((currentBlueprintStore[jobId]?.length || 9) / 9);
      if (now - (lastUpdateTimes[jobId] || 0) > threshold) requeueAll(jobId);
    } else {
      console.log(`[DEBUG] All results (${actual}/${expected}) received for job ${jobId}, combining board...`);
      
      const blueprint = currentBlueprintStore[jobId];
      if (blueprint.every(r => r.every(c => c !== 0)) && isValidSudoku(blueprint)) {
        finalSolvedResults[jobId] = { board: blueprint, timestamp: now };
        saveSolutionToFile(jobId, blueprint);
        cleanupJobData(jobId);
        return;
      }

      try {
        const full = combineSections(jobId);
        if (isValidSudoku(full)) {
          finalSolvedResults[jobId] = { board: full, timestamp: now };
          saveSolutionToFile(jobId, full);
          console.log(`[DEBUG] Valid combined solution found for job ${jobId}`);
          cleanupJobData(jobId);
        } else {
          console.log(`[DEBUG] Invalid combined solution for job ${jobId}, requeuing conflicting blocks`);
          requeueConflictingBlocks(jobId, getConflictingBlocks(full));
        }
      } catch (e) {
        console.log(`[DEBUG] Error combining sections for job ${jobId}: ${e.message}`);
        requeueAll(jobId);
      }
    }
  });
  setTimeout(checkAndCombineResults, 1000);
}

// API endpoint to request a Sudoku solution
app.post('/solve', (req, res) => {
  const { board } = req.body;
  if (!Array.isArray(board)) return res.status(400).json({ error: 'Invalid board' });

  const N = board.length;
  const jobId = Date.now().toString();

  jobStartTimes[jobId] = Date.now();
  initialBlueprintStore[jobId] = board.map(r => [...r]);
  
  // Create a working copy of the board
  const workingBoard = board.map(r => [...r]);
  
  // Apply advanced constraint propagation to the entire board first
  applyAdvancedConstraintPropagation(workingBoard);
  
  // Check if the board is already solved
  if (workingBoard.flat().every(v => v !== 0) && isValidSudoku(workingBoard)) {
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

  // Handle completely empty boards with direct solver
  if (board.flat().every(v => v === 0)) {
    try {
      const solver = new StochasticBlockSolver(board, 0, 0);
      const out = solver.solve();
      const [rSize, cSize] = getBlockDimensions(N);
      for (let i = 0; i < rSize; i++) {
        for (let j = 0; j < cSize; j++) {
          workingBoard[i][j] = out.block[i][j];
        }
      }
    } catch {
      // Continue with distributed solving if pre-solve fails
    }
  }
  
  currentBlueprintStore[jobId] = workingBoard.map(r => [...r]);
  const subs = splitAndQueueJob(jobId, workingBoard, N);
  jobSubJobCount[jobId] = subs.length;
  originalSubJobsStore[jobId] = subs;
  lastUpdateTimes[jobId] = Date.now();

  res.json({ jobId, status: 'processing' });
});

// API endpoint for workers to get the next job
app.get('/queue', (req, res) => {
  const job = jobQueue.shift();
  if (!job) return res.status(404).json({ error: 'No jobs' });

  const parentId = job.id.split('.')[0];
  job.originalBoard = job.isRequeued
    ? currentBlueprintStore[parentId]
    : initialBlueprintStore[parentId];

  res.json(job);
});

// API endpoint to receive completed sub-job results
app.post('/result', (req, res) => {
  const { id, board, blockRow, blockCol, sure } = req.body;
  const jobId = id.split('.')[0];
  if (!id || !board || blockRow == null || blockCol == null || !Array.isArray(sure)) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  completedJobs[jobId] = completedJobs[jobId] || [];
  completedJobs[jobId].push({ id, board, blockRow, blockCol, sure });
  lastUpdateTimes[jobId] = Date.now();
  updatePartialBoardFromSure(jobId);
  
  console.log(`[DEBUG] Result received for job ${jobId}: block (${blockRow},${blockCol}), progress: ${completedJobs[jobId].length}/${jobSubJobCount[jobId] || originalSubJobsStore[jobId].length}`);

  res.json({ id, status: 'partial' });
});

// API endpoint to check solution status
app.get('/FinalsolvedResults', (req, res) => {
  const { jobId } = req.query;
  if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

  if (finalSolvedResults[jobId]) {
    return res.json({ jobId, solvedBoard: finalSolvedResults[jobId].board, status: 'completed' });
  }

  const cur = currentBlueprintStore[jobId];
  if (cur && isValidSudoku(cur)) {
    return res.json({ jobId, solvedBoard: cur, status: 'completed' });
  }

  if (cur) {
    const filled = cur.flat().filter(v => v !== 0).length;
    const total = cur.length * cur.length;
    return res.json({ status: 'processing', progress: Math.floor((filled / total) * 100) });
  }

  res.status(404).json({ error: 'not found' });
});

// API endpoint to get the number of pending jobs
app.get('/totalJobs', (req, res) => {
  res.json({ totalJobs: jobQueue.length });
});

// Start background processes and server
checkAndCombineResults();
cleanupOldResults();
server.listen(PORT, () => console.log(`Master server running on port ${PORT}`));