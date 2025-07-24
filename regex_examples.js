const regex = /(?:from|de)?\s*(\d{1,2}(?:(?::|\s*h\s*)\d{2})?\s*(?:[ap]m)?)\s*(?:à|to|[-–])\s*(\d{1,2}(?:(?::|\s*h\s*)\d{2})?\s*(?:[ap]m)?),?\s*(.+)/i;
function toMinutes(str){
  const m = str.trim().toLowerCase().match(/(\d{1,2})(?:(?:\:|\s*h\s*)(\d{2}))?\s*(am|pm)?/);
  if(!m) return 0;
  let h=+m[1];
  const mins=m[2]?+m[2]:0;
  const ap=m[3];
  if(ap){
    if(ap==='pm' && h!==12) h+=12;
    if(ap==='am' && h===12) h=0;
  }
  return h*60+mins;
}

const samples = [
  'from 9:00 to 10:00 Meeting',
  'de 9h00 à 10h00 Réunion'
];

samples.forEach(text => {
  const m = text.match(regex);
  if (m) {
    let [, start, end, title] = m;
    let comment = '';
    const plusIdx = title.indexOf('+');
    if (plusIdx !== -1) {
      comment = title.slice(plusIdx + 1).trim();
      title = title.slice(0, plusIdx).trim();
    }
    const duration = toMinutes(end) - toMinutes(start);
    console.log(`Parsed "${text}" ->`, { start, end, title, duration, comment });
  } else {
    console.log(`No match for "${text}"`);
  }
});
