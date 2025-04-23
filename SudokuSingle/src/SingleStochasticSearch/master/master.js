// master.js

const express = require('express');
const http = require('http');
const cors = require('cors');
const { saveSolutionToFile } = require('./saveSolution');

const app = express();
const server = http.createServer(app);
const PORT = 3070;

app.use(cors());
app.use(express.json());

let jobQueue = [];
const completedJobs = {};
const pendingJobs = {}; // Map: jobId -> { job, slaveId, assignedAt }
const currentBlueprints = {}; // For grid forwarding: jobId -> current (partial or final) board
const slaveStatus = {}; // Maps slaveId to last heartbeat timestamp

// Helper: check for duplicates among non-zero values.
function hasDuplicates(arr) {
  const filtered = arr.filter(x => x !== 0);
  return new Set(filtered).size !== filtered.length;
}

// Validates the structure and basic consistency of the board.
function isValidGrid(board) {
  if (!Array.isArray(board) || board.length === 0) return false;
  const n = board.length;
  for (const row of board) {
    if (!Array.isArray(row) || row.length !== n) return false;
    for (const cell of row) {
      if (typeof cell !== 'number') return false;
    }
    if (hasDuplicates(row)) return false;
  }
  for (let col = 0; col < n; col++) {
    const colValues = [];
    for (let row = 0; row < n; row++) {
      colValues.push(board[row][col]);
    }
    if (hasDuplicates(colValues)) return false;
  }
  const blockSize = Math.sqrt(n);
  if (blockSize % 1 === 0) {
    for (let blockRow = 0; blockRow < blockSize; blockRow++) {
      for (let blockCol = 0; blockCol < blockSize; blockCol++) {
        const blockValues = [];
        for (let i = 0; i < blockSize; i++) {
          for (let j = 0; j < blockSize; j++) {
            blockValues.push(board[blockRow * blockSize + i][blockCol * blockSize + j]);
          }
        }
        if (hasDuplicates(blockValues)) return false;
      }
    }
  }
  return true;
}

// --- Naked singles propagation for an entire grid ---
// For each empty cell, if exactly one candidate (based on row, column, and block constraints) exists, fill it.
function applyNakedSinglesToBoard(board) {
  const n = board.length;
  let changed = true;

  function isValid(board, row, col, num) {
    // Check row & column.
    for (let i = 0; i < n; i++) {
      if (board[row][i] === num || board[i][col] === num) return false;
    }
    // Check subgrid.
    const root = Math.sqrt(n);
    const boxRowStart = Math.floor(row / root) * root;
    const boxColStart = Math.floor(col / root) * root;
    for (let r = 0; r < root; r++) {
      for (let c = 0; c < root; c++) {
        if (board[boxRowStart + r][boxColStart + c] === num) return false;
      }
    }
    return true;
  }

  while (changed) {
    changed = false;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        if (board[row][col] === 0) {
          let candidates = [];
          for (let num = 1; num <= n; num++) {
            if (isValid(board, row, col, num)) {
              candidates.push(num);
            }
          }
          if (candidates.length === 1) {
            board[row][col] = candidates[0];
            changed = true;
          }
        }
      }
    }
  }
  return board;
}

// Heartbeat endpoint: slaves ping here periodically.
app.post('/heartbeat', (req, res) => {
  const { slaveId } = req.body;
  if (!slaveId) return res.status(400).json({ error: 'slaveId is required.' });
  slaveStatus[slaveId] = Date.now();
  console.debug(`Received heartbeat from slave ${slaveId}`);
  res.sendStatus(200);
});

// Endpoint to submit a new Sudoku board job.
app.post('/solve', (req, res) => {
  const { board } = req.body;
  if (!board || !Array.isArray(board)) {
    console.log("Invalid grid: Board is not an array.");
    return res.status(400).json({ error: 'Invalid board format.' });
  }
  if (!isValidGrid(board)) {
    console.log("Invalid grid received.");
    return res.status(400).json({ error: "Invalid grid." });
  }
  const jobId = Date.now().toString();
  
  // Apply naked singles to the submitted board to produce an initial (partial) blueprint.
  const partialBoard = applyNakedSinglesToBoard(board.map(row => row.slice()));
  
  const job = { id: jobId, board };
  jobQueue.push(job);
  currentBlueprints[jobId] = partialBoard;
  console.log(`Job ${jobId} enqueued. Partial board:`, partialBoard);
  
  res.status(200).json({
    jobId,
    message: 'Job accepted and queued',
    partialBoard
  });
});

// /queue endpoint: slave must supply slaveId as a query parameter.
app.get('/queue', (req, res) => {
  const slaveId = req.query.slaveId;
  if (!slaveId) return res.status(400).json({ error: 'slaveId is required as a query parameter.' });
  const job = jobQueue.shift();
  if (!job) return res.status(404).json({ error: 'No jobs available' });
  pendingJobs[job.id] = { job, slaveId, assignedAt: Date.now() };
  console.log(`Dispatching job ${job.id} to slave ${slaveId}.`);
  res.status(200).json(job);
});

// Endpoint for slave to post the solved board.
app.post('/result', (req, res) => {
  const { id, solvedBoard, unsolvable, message } = req.body;
  if (!id || (solvedBoard === undefined && unsolvable !== true)) {
    return res.status(400).json({ error: 'Invalid payload.' });
  }
  if (pendingJobs[id]) delete pendingJobs[id];
  
  if (unsolvable) {
    console.log(`Job ${id} reported unsolvable: ${message}`);
    completedJobs[id] = [{ unsolvable: true, message }];
    currentBlueprints[id] = null;
    return res.status(200).json({ id, status: 'unsolvable' });
  }
  
  if (!completedJobs[id]) completedJobs[id] = [];
  const exists = completedJobs[id].some(sol => JSON.stringify(sol) === JSON.stringify(solvedBoard));
  if (!exists) {
    completedJobs[id].push(solvedBoard);
    saveSolutionToFile(id, solvedBoard);
  } else {
    console.log(`Duplicate solution for job ${id} not saved.`);
  }
  
  // Update the current blueprint with the final solution.
  currentBlueprints[id] = solvedBoard;
  
  console.log(`Job ${id} completed. Solution received.`);
  res.status(200).json({ id, status: 'completed' });
});

// New endpoint to retrieve the current (partial or final) grid for a given job.
app.get('/grid/:jobId', (req, res) => {
  const { jobId } = req.params;
  const grid = currentBlueprints[jobId];
  if (grid) res.status(200).json({ jobId, partialBoard: grid });
  else res.status(404).json({ error: 'No grid update available.' });
});

// Endpoint to query final result.
app.get('/result/:jobId', (req, res) => {
  const { jobId } = req.params;
  const result = completedJobs[jobId];
  if (result) res.status(200).json({ jobId, solvedBoards: result });
  else res.status(404).json({ error: 'Result not ready or invalid jobId.' });
});

server.listen(PORT, () => {
  console.log(`Master server running on port ${PORT}`);
});

// Periodically check for dead slaves and requeue their pending jobs.
setInterval(() => {
  const now = Date.now();
  for (const [slaveId, lastHeartbeat] of Object.entries(slaveStatus)) {
    if (now - lastHeartbeat > 90000) { // 90 seconds
      console.warn(`Slave ${slaveId} missed heartbeat. Last seen: ${new Date(lastHeartbeat).toLocaleTimeString()}`);
      for (const [jobId, pending] of Object.entries(pendingJobs)) {
        if (pending.slaveId === slaveId) {
          console.warn(`Requeuing job ${jobId} assigned to dead slave ${slaveId}.`);
          jobQueue.push(pending.job);
          delete pendingJobs[jobId];
        }
      }
      delete slaveStatus[slaveId];
    }
  }
}, 60000);