async function addLog(message){
  const { logs = [] } = await storage.get('logs');
  logs.push({ msg: message, date: new Date().toLocaleString() });
  await storage.set({ logs });
}
