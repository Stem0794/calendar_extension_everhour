function parseEventsFromWeekView() {
  const chips = Array.from(document.querySelectorAll('[data-eventchip]'));
  const parsed = [];
  const months = [
    "january","february","march","april","may","june","july",
    "august","september","october","november","december",
    "janvier","février","mars","avril","mai","juin","juillet",
    "août","septembre","octobre","novembre","décembre"
  ];
  const monthOnlyRegex = new RegExp(
    `^(?:${months.join('|')})(?:\\s+\\d{4})?$`,
    'i'
  );

  chips.forEach(chip => {
    const info = chip.querySelector('.XuJrye');
    if (!info) return;
    const text = info.textContent.trim();
    const match = text.match(/(?:from|de)?\s*(\d{1,2}(?:(?::|\s*h\s*)\d{2})?\s*(?:[ap]m)?)\s*(?:à|to|[-–])\s*(\d{1,2}(?:(?::|\s*h\s*)\d{2})?\s*(?:[ap]m)?),?\s*(.+)/i);
    if (!match) return;
    const [, start, end, rawTitle] = match;

    // Extract date (robust for EN/FR)
    let date = '';
    let dayOfWeek = '';
    let dayName = '';
    let dateMatch = text.match(/(\d{1,2})\s+([a-zéû]+)[,\s]*(\d{4})?/i);
    if (!dateMatch) {
      dateMatch = text.match(/([a-zéû]+)\s+(\d{1,2})(?:[,\s]*(\d{4}))?/i);
    }
    if (dateMatch) {
      let day, month, year;
      if (/^\d/.test(dateMatch[1])) {
        day = dateMatch[1].padStart(2, '0');
        month = dateMatch[2].toLowerCase();
        year = dateMatch[3] || new Date().getFullYear();
      } else {
        month = dateMatch[1].toLowerCase();
        day = dateMatch[2].padStart(2, '0');
        year = dateMatch[3] || new Date().getFullYear();
      }
      let idx = months.indexOf(month);
      if (idx === -1) {
        const parsed = Date.parse(dateMatch[0]);
        if (isNaN(parsed)) return; // skip unknown month
        const d = new Date(parsed);
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        date = `${d.getFullYear()}-${m}-${dd}`;
        dayOfWeek = d.getDay();
        dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      } else {
        let monthIdx = (idx % 12) + 1;
        monthIdx = monthIdx < 10 ? '0' + monthIdx : '' + monthIdx;
        date = `${year}-${monthIdx}-${day}`;
        const d = new Date(`${year}-${monthIdx}-${day}`);
        dayOfWeek = d.getDay();
        dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      }
    }
    let cleanTitle = rawTitle.replace(/\s*•.*$/, '').split('\n')[0].trim();
    const commaIdx = cleanTitle.indexOf(',');
    if (commaIdx !== -1) {
      cleanTitle = cleanTitle.slice(0, commaIdx).trim();
    }
    let comment = '';
    const plusIdx = cleanTitle.indexOf('+');
    if (plusIdx !== -1) {
      comment = cleanTitle.slice(plusIdx + 1).trim();
      cleanTitle = cleanTitle.slice(0, plusIdx).trim();
    }
    const lowerTitle = cleanTitle.toLowerCase();
    if (
      monthOnlyRegex.test(lowerTitle) ||
      lowerTitle.includes('planning de rendez-vous') ||
      lowerTitle.includes('lunch') ||
      lowerTitle.includes('déjeuner') ||
      lowerTitle.includes('break') ||
      lowerTitle.includes('pause')
    ) return;
    function toMinutes(str) {
      const m = str.trim().toLowerCase().match(/(\d{1,2})(?:(?:\:|\s*h\s*)(\d{2}))?\s*(am|pm)?/);
      if (!m) return 0;
      let h = +m[1];
      const mins = m[2] ? +m[2] : 0;
      const ap = m[3];
      if (ap) {
        if (ap === 'pm' && h !== 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
      }
      return h * 60 + mins;
    }
    const startMinutes = toMinutes(start);
    let duration = toMinutes(end) - startMinutes;
    if (duration < 0) duration += 24 * 60; // handle overnight meetings
    const startTime =
      String(Math.floor(startMinutes / 60)).padStart(2, '0') + ':' +
      String(startMinutes % 60).padStart(2, '0');
    parsed.push({
      title: cleanTitle,
      comment,
      duration,
      date,
      dayOfWeek,
      dayName,
      startTime
    });
  });
  return parsed;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg === 'get_week_events') {
    sendResponse(parseEventsFromWeekView());
  }
});
