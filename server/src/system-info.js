import os from 'os';

/**
 * Generic system and server status telemetry
 */
export function getServerStats(wsServer, roomManager) {
  const memUsage = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  const roomStats = roomManager ? roomManager.getStats() : {};

  return {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    memory: {
      heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      rssMb: Math.round(memUsage.rss / 1024 / 1024),
      systemUsagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    connections: {
      activeSockets: wsServer?.clients?.size || 0,
      ...roomStats,
    },
    timestamp: new Date().toISOString(),
  };
}

