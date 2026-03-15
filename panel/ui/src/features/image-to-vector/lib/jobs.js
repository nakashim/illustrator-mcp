export const pollJobUntilDone = ({ getJob, jobId, onTick, onDone, onError, intervalMs = 1000 }) =>
  new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        const payload = await getJob(jobId);
        onTick?.(payload);
        if (payload.status === "done" || payload.status === "error" || payload.status === "cancelled") {
          clearInterval(timer);
          onDone?.(payload);
          resolve(payload);
        }
      } catch (error) {
        clearInterval(timer);
        onError?.(error);
        reject(error);
      }
    }, intervalMs);
  });
