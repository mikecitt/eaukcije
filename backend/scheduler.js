const cron = require('node-cron');
const { runRefresh } = require('./services/refresh');

async function scheduledRefresh(label) {
  console.log(`[scheduler] ${label} — starting refresh`);
  try {
    const { newCount, updatedCount, failedCount } = await runRefresh();
    console.log(`[scheduler] ${label} — done: ${newCount} new, ${updatedCount} updated${failedCount ? `, ${failedCount} failed` : ''}`);
  } catch (err) {
    console.error(`[scheduler] ${label} — error:`, err.message);
  }
}

// 00:00 and 12:00 every day
cron.schedule('0 0 * * *',  () => scheduledRefresh('00:00'));
cron.schedule('0 12 * * *', () => scheduledRefresh('12:00'));

console.log('[scheduler] Scheduled: 00:00 and 12:00 daily');
