const LOG_MAX = 500;

async function addLog(message){
  const { logs = [] } = await storage.get('logs');
  logs.push({ msg: message, date: new Date().toLocaleString() });
  if (logs.length > LOG_MAX) logs.splice(0, logs.length - LOG_MAX);
  await storage.set({ logs });
}
