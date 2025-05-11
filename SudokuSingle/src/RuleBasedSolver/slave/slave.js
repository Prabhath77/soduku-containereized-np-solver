const axios = require('axios');
const { solveSudoku } = require('./solver');
const os = require('os');
const MASTER_URL = process.env.MASTER_URL || "http://localhost:3060";

// Generate a unique slaveId.
const slaveId = `${os.hostname()}-${Math.floor(Math.random() * 10000)}`;

// Function to send a heartbeat to the master.
function sendHeartbeat() {
  axios.post(`${MASTER_URL}/heartbeat`, { slaveId })
    .then(() => console.debug(`Slave (${slaveId}): heartbeat sent.`))
    .catch(err => console.error(`Slave (${slaveId}): heartbeat error - ${err.message}`));
}

// Function to fetch a job from the master.
async function fetchJob() {
  try {
    const response = await axios.get(`${MASTER_URL}/queue`, { params: { slaveId } });
    if (response.status === 200) {
      return response.data;
    }
  } catch (error) {
    // No job available or an error occurred.
  }
  return null;
}

// Process a job using the simulated annealing based solver (now with naked singles pre-processing).
async function processJob(job) {
  const { id, board } = job;
  console.log(`Slave: Processing job ${id}`);

  // Optionally, set up a heartbeat interval for this job.
  const heartbeatInterval = setInterval(sendHeartbeat, 30000);
  sendHeartbeat();

  const solvedBoard = solveSudoku(board);
  console.debug(`Slave: Job ${id} solved board:`, solvedBoard);
  
  const payload = { id, solvedBoard };
  try {
    await axios.post(`${MASTER_URL}/result`, payload);
    console.log(`Slave: Job ${id} result posted.`);
  } catch (error) {
    console.error(`Slave: Failed to post result for job ${id}: ${error.message}`);
  }
  
  clearInterval(heartbeatInterval);
}

// Polling loop to continuously request jobs.
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