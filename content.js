function parseEventsFromWeekView() {
  const chips = Array.from(document.querySelectorAll('[data-eventchip]'));
  const parsed = [];
  const months = [
    "january","february","march","april","may","june","july",
    "august","september","october","november","december",
    "janvier","février","mars","avril","mai","juin","juillet",
    "août","septembre","octobre","novembre","décembre"
  ];

  chips.forEach(chip => {
    const info = chip.querySelector('.XuJrye');
    if (!info) return;
    const text = info.textContent.trim();
    const match = text.match(/(?:[Dd]e)?\s*(\d{1,2}:\d{2})\s*à\s*(\d{1,2}:\d{2}),\s*([^,]+)/);
    if (!match) return;
    const [, start, end, title] = match;

    // Extract date (robust for EN/FR)
    let date = '';
    let dayOfWeek = '';
    let dayName = '';
    const dateMatch = text.match(/(\d{1,2})\s+([a-zéû]+)[,\s]*(\d{4})?/i);
    if (dateMatch) {
      let day = dateMatch[1].padStart(2, '0');
      let month = dateMatch[2].toLowerCase();
      let year = dateMatch[3] || new Date().getFullYear();
      let monthIdx = months.indexOf(month) % 12 + 1;
      monthIdx = monthIdx < 10 ? '0' + monthIdx : '' + monthIdx;
      date = `${year}-${monthIdx}-${day}`;
      const d = new Date(`${year}-${monthIdx}-${day}`);
      dayOfWeek = d.getDay();
      dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    }
    const lowerTitle = title.trim().toLowerCase();
    if (
      lowerTitle.includes('planning de rendez-vous') ||
      lowerTitle.includes('lunch') ||
      lowerTitle.includes('déjeuner') ||
      lowerTitle.includes('break') ||
      lowerTitle.includes('pause')
    ) return;
    function toMinutes(hm) {
      const [h, m] = hm.split(':').map(Number);
      return h * 60 + m;
    }
    const duration = toMinutes(end) - toMinutes(start);
    parsed.push({ title: title.trim(), duration, date, dayOfWeek, dayName });
  });
  return parsed;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === 'get_week_events') {
    sendResponse(parseEventsFromWeekView());
  }
});