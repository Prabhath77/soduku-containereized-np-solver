const axios = require('axios');
const { solveSudoku } = require('./solver.js');
const os = require('os');
const MASTER_URL = process.env.MASTER_URL || "http://localhost:3050";

// Create a unique slaveId.
const slaveId = `${os.hostname()}-${Math.floor(Math.random() * 10000)}`;

// Send heartbeat to master.
function sendHeartbeat() {
  axios.post(`${MASTER_URL}/heartbeat`, { slaveId })
    .then(() => console.debug(`Slave (${slaveId}): heartbeat sent.`))
    .catch(err => console.error(`Slave (${slaveId}): heartbeat error - ${err.message}`));
}

setInterval(sendHeartbeat, 30000);
sendHeartbeat();

// Fetch a job for this slave.
async function fetchJob() {
  try {
    const response = await axios.get(`${MASTER_URL}/queue`, { params: { slaveId } });
    if (response.status === 200) {
      return response.data;
    }
  } catch (error) {
    // No job available or error.
  }
  return null;
}

// Process a job: solve the board using our updated solver.
async function processJob(job) {
  const { id, board } = job;
  console.log(`Slave: Processing job ${id}`);
  const solvedBoard = solveSudoku(board);
  if (!solvedBoard) {
    console.error(`Slave: Job ${id} has no solution.`);
    return;
  }
  console.debug(`Slave: Job ${id} solved board:`, solvedBoard);
  
  const payload = { id, solvedBoard };
  try {
    await axios.post(`${MASTER_URL}/result`, payload);
    console.log(`Slave: Job ${id} result posted.`);
  } catch (error) {
    console.error(`Slave: Failed to post result for job ${id}: ${error.message}`);
  }
}

// Poll for jobs continuously.
async function pollJobs() {
  while (true) {
    const job = await fetchJob();
    if (job) {
      await processJob(job);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

console.log(`Slave (${slaveId}) started.`);
pollJobs();