const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { saveSolutionToFile } = require('./SaveSolution.js');
const { SudokuSolver } = require('./solver.js');
const app = express();
const server = http.createServer(app);

const PORT = 3005; // Master server port

// Storage structures for tracking distributed Sudoku solving jobs
const jobQueue = [];
const completedJobs = {};          // Results organized by job ID
const originalSubJobsStore = {};   // Initial sub-jobs by job ID
const currentBlueprintStore = {};  // Current puzzle state
const jobStartTimes = {};          // Time tracking for jobs
const lastUpdateTimes = {};
const finalSolvedResults = {};     // Completed solutions

// Tracks assignment order for sub-jobs
const nextSubJobIndex = {};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Helper function for detailed logging during development
function debugLog(prefix, data) {
  console.log(`[DEBUG] ${prefix}:`, JSON.stringify(data, null, 2));
}

// Checks if a board is empty (all zeros)
function isEmptyBoard(board) {
  return board.every(row => row.every(cell => cell === 0));
}

// Validates if a column contains all required numbers exactly once
function isColumnValid(column, fullSize) {
  const expectedSet = new Set();
  for (let d = 1; d <= fullSize; d++) {
    expectedSet.add(d);
  }
  const colNumbers = column.map(row => row[0]);
  if (colNumbers.includes(0)) return false;
  const colSet = new Set(colNumbers);
  if (colSet.size !== expectedSet.size) return false;
  for (const num of expectedSet) {
    if (!colSet.has(num)) return false;
  }
  return true;
}

// Assembles individual column solutions into a complete board
function combineSections(jobId) {
  const blueprint = currentBlueprintStore[jobId];
  const gridSize = blueprint.length;
  const combinedBoard = blueprint.map(row => row.slice());
  console.log(`[DEBUG] Combining sub-jobs for job ${jobId}`);
  (completedJobs[jobId] || []).forEach(result => {
    if (!isColumnValid(result.board, gridSize)) {
      throw new Error(`Sub-job ${result.id} column not fully solved or invalid.`);
    }
    const col = result.colIndex;
    for (let row = 0; row < gridSize; row++) {
      combinedBoard[row][col] = result.board[row][0];
    }
  });
  debugLog("Combined board", combinedBoard);
  return combinedBoard;
}

// Performs full validation of a Sudoku solution
function isValidSudoku(board) {
  const n = board.length;
  const root = Math.sqrt(n);
  if (!Number.isInteger(root)) throw new Error("Grid size must be a perfect square");
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (board[i][j] === 0) return false;
    }
  }
  for (let i = 0; i < n; i++) {
    const rowSet = new Set();
    const colSet = new Set();
    for (let j = 0; j < n; j++) {
      if (rowSet.has(board[i][j])) return false;
      rowSet.add(board[i][j]);
      if (colSet.has(board[j][i])) return false;
      colSet.add(board[j][i]);
    }
  }
  for (let i = 0; i < n; i += root) {
    for (let j = 0; j < n; j += root) {
      const blockSet = new Set();
      for (let r = i; r < i + root; r++) {
        for (let c = j; c < j + root; c++) {
          if (blockSet.has(board[r][c])) return false;
          blockSet.add(board[r][c]);
        }
      }
    }
  }
  return true;
}

// Gets a single column from a Sudoku board
function extractColumn(board, col) {
  const gridSize = board.length;
  const column = [];
  for (let row = 0; row < gridSize; row++) {
    column.push([board[row][col]]);
  }
  return column;
}

// Identifies columns with validation issues
function getConflictingColumns(combinedBoard) {
  const gridSize = combinedBoard.length;
  const conflictingColumns = [];
  for (let col = 0; col < gridSize; col++) {
    const column = [];
    for (let row = 0; row < gridSize; row++) {
      column.push([combinedBoard[row][col]]);
    }
    if (!isColumnValid(column, gridSize)) {
      conflictingColumns.push(col);
    }
  }
  return conflictingColumns;
}

// Adds problematic columns back to the job queue
function requeueConflictingColumns(jobId, conflictingColumns) {
  console.log(`[DEBUG] Requeuing conflicting columns for job ${jobId}:`, conflictingColumns);
  const board = currentBlueprintStore[jobId];
  const gridSize = board.length;
  conflictingColumns.forEach(col => {
    for (let row = 0; row < gridSize; row++) {
      board[row][col] = 0;
    }
    if (completedJobs[jobId]) {
      completedJobs[jobId] = completedJobs[jobId].filter(job => job.colIndex !== col);
    }
    if (!nextSubJobIndex[jobId]) {
      nextSubJobIndex[jobId] = originalSubJobsStore[jobId].length + 1;
    }
    const subJobId = `${jobId}.${nextSubJobIndex[jobId]++}`;
    const subColumn = extractColumn(board, col);
    const subJob = { id: subJobId, board: subColumn, colIndex: col, originalBoard: board, triedNumbers: {} };
    subJob.partialBoard = board.map(row => [...row]);
    subJob.isRequeued = true;
    jobQueue.push(subJob);
    console.log(`[DEBUG] Requeued sub-job ${subJobId} for column ${col}`);
  });
  currentBlueprintStore[jobId] = board;
  completedJobs[jobId] = [];
  console.log(`[DEBUG] Cleared old completedJobs for job ${jobId} after requeue`);
}

// Updates the master board with confirmed values from partial solutions
function updatePartialBoardFromSure(jobId) {
  const subJobs = originalSubJobsStore[jobId];
  if (!subJobs || !subJobs.length) return;
  const gridSize = subJobs[0].originalBoard.length;
  let updatedBoard = currentBlueprintStore[jobId].map(row => [...row]);
  (completedJobs[jobId] || []).forEach(result => {
    const col = result.colIndex;
    for (let row = 0; row < gridSize; row++) {
      updatedBoard[row][col] = result.sure && result.sure[row] ? result.board[row][0] : 0;
    }
  });
  debugLog("Updated partial board", updatedBoard);
  currentBlueprintStore[jobId] = updatedBoard;
  originalSubJobsStore[jobId].forEach(job => {
    job.partialBoard = updatedBoard.map(row => [...row]);
    job.isRequeued = true;
  });
}

// Completely restarts the solving process with updated information
function requeueJobs(jobId) {
  console.log(`[DEBUG] Requeuing sub-jobs for job ${jobId} (full requeue)`);
  const gridSize = currentBlueprintStore[jobId].length;
  let updatedBoard = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  (completedJobs[jobId] || []).forEach(result => {
    const col = result.colIndex;
    result.sure && result.sure.forEach((flag, r) => {
      if (flag) updatedBoard[r][col] = result.board[r][0];
    });
  });
  debugLog("Updated blueprint board", updatedBoard);
  currentBlueprintStore[jobId] = updatedBoard;
  nextSubJobIndex[jobId] = 1;
  const subJobs = splitAndQueueJob(jobId, updatedBoard, gridSize, true);
  originalSubJobsStore[jobId] = subJobs;
  completedJobs[jobId] = [];
  lastUpdateTimes[jobId] = Date.now();
}

// Breaks a Sudoku puzzle into column-based sub-problems
function splitAndQueueJob(jobId, board, gridSize, isRequeued = false) {
  console.log(`[DEBUG] Splitting board for job ${jobId}`);
  debugLog("Blueprint board", board);
  const subJobs = [];
  nextSubJobIndex[jobId] = 1;
  for (let col = 0; col < gridSize; col++) {
    const subColumn = board.map(row => [row[col]]);
    const subJobId = `${jobId}.${nextSubJobIndex[jobId]++}`;
    const subJob = { id: subJobId, board: subColumn, colIndex: col, originalBoard: board, triedNumbers: {} };
    if (isRequeued) {
      subJob.partialBoard = board.map(row => [...row]);
      subJob.isRequeued = true;
    }
    subJobs.push(subJob);
    jobQueue.push(subJob);
  }
  debugLog("Sub-jobs after splitting", subJobs.map(j => ({ id: j.id, colIndex: j.colIndex })));
  return subJobs;
}

// API endpoint for retrieving final solutions
app.get('/FinalsolvedResults', (req, res) => {
  const { jobId } = req.query;
  console.log(`[DEBUG] Received request for job ${jobId}`);
  if (!jobId) return res.status(400).json({ error: 'Missing jobId parameter' });
  if (finalSolvedResults[jobId]) {
    return res.status(200).json({ jobId, solvedBoard: finalSolvedResults[jobId].board, status: 'completed' });
  }
  return res.status(404).json({ error: 'Solution not found or not ready' });
});

// API endpoint to submit a new Sudoku puzzle
app.post('/solve', (req, res) => {
  const { board } = req.body;
  if (!Array.isArray(board)) return res.status(400).json({ error: 'Invalid board format.' });
  const gridSize = board.length;
  const jobId = Date.now().toString();
  jobStartTimes[jobId] = Date.now();
  if (isEmptyBoard(board)) {
    try {
      const col0 = board.map(r => [r[0]]);
      const solver = new SudokuSolver();
      const result = solver.hybridSolve(col0, board, 0);
      result.sure = Array.isArray(result.sure) ? result.sure.map(() => true) : [];
      for (let i = 0; i < gridSize; i++) board[i][0] = result.column[i][0];
      completedJobs[jobId] = [];
      nextSubJobIndex[jobId] = 1;
      const subJobId = `${jobId}.${nextSubJobIndex[jobId]++}`;
      completedJobs[jobId].push({ id: subJobId, board: result.column, colIndex: 0, triedNumbers: {}, originalBoard: board, sure: result.sure });
    } catch (e) {
      return res.status(500).json({ error: 'Error pre-solving empty grid.' });
    }
  }
  currentBlueprintStore[jobId] = board;
  originalSubJobsStore[jobId] = splitAndQueueJob(jobId, board, gridSize);
  lastUpdateTimes[jobId] = Date.now();
  res.status(200).json({ jobId, message: 'Job accepted and queued', status: 'processing', partialBoard: board });
});

// API endpoint for checking queue size
app.get('/totalJobs', (req, res) => {
  res.status(200).json({ totalJobs: jobQueue.length });
});

// API endpoint for workers to get new jobs
app.get('/queue', (req, res) => {
  const job = jobQueue.shift();
  if (!job) return res.status(404).json({ error: 'No jobs available' });
  const jobId = job.id.split('.')[0];
  if (job.isRequeued) job.partialBoard = currentBlueprintStore[jobId].map(r => [...r]);
  res.status(200).json(job);
});

// API endpoint for workers to submit completed column solutions
app.post('/result', (req, res) => {
  const { id, board, colIndex, sure } = req.body;
  const jobId = id.split('.')[0];
  
  console.log(`[DEBUG] Result received for job ${jobId}: column ${colIndex}`);
  
  if (!id || !board || colIndex == null || !sure) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  completedJobs[jobId] = completedJobs[jobId] || [];
  completedJobs[jobId].push({ id, board, colIndex, sure });
  lastUpdateTimes[jobId] = Date.now();
  
  const expected = originalSubJobsStore[jobId]?.length || 0;
  const completed = completedJobs[jobId]?.length || 0;
  console.log(`[DEBUG] Progress for job ${jobId}: ${completed}/${expected} columns completed`);
  
  res.json({ status: 'received' });
});

// Periodically checks for completed jobs and combines their results
function checkAndCombineResults() {
  const now = Date.now();
  Object.keys(originalSubJobsStore).forEach(jobId => {
    const expected = originalSubJobsStore[jobId]?.length || 0;
    const actual = completedJobs[jobId]?.length || 0;

    if (actual === expected) {
      console.log(`[DEBUG] All results (${actual}/${expected}) received for job ${jobId}, combining columns into board...`);
      
      try {
        const combinedBoard = combineSections(jobId);
        
        if (isValidSudoku(combinedBoard)) {
          console.log(`[DEBUG] Valid combined solution found for job ${jobId}`);
          finalSolvedResults[jobId] = { 
            board: combinedBoard, 
            timestamp: Date.now() 
          };
          saveSolutionToFile(jobId, combinedBoard);
          // Cleanup job data
          delete originalSubJobsStore[jobId];
          delete completedJobs[jobId];
          delete currentBlueprintStore[jobId];
          delete jobStartTimes[jobId];
          delete lastUpdateTimes[jobId];
          delete nextSubJobIndex[jobId];
        } else {
          console.log(`[DEBUG] Invalid combined solution for job ${jobId}, checking for conflicts`);
          const conflicts = getConflictingColumns(combinedBoard);
          console.log(`[DEBUG] Found ${conflicts.length} conflicting columns for job ${jobId}`);
          
          if (conflicts.length > 0) {
            requeueConflictingColumns(jobId, conflicts);
          } else {
            requeueJobs(jobId);
          }
        }
      } catch (e) {
        console.error(`[ERROR] Combining failed for job ${jobId}:`, e);
        requeueJobs(jobId);
      }
    } else if (actual > 0) {
      updatePartialBoardFromSure(jobId);
      const threshold = 60000;  // 1 minute
      if (now - (lastUpdateTimes[jobId] || 0) > threshold) {
        console.log(`[DEBUG] Job ${jobId} stalled (${actual}/${expected}), requeuing all columns`);
        requeueJobs(jobId);
      }
    }
  });
  
  setTimeout(checkAndCombineResults, 1000);
}
checkAndCombineResults();

server.listen(PORT, () => {
  console.log(`Master server running on port ${PORT}`);
});
