export const GLOSSARY_MARKER='<<<GLOSSARY>>>';
export function analysisView(raw) {
  const source=String(raw||''),at=source.indexOf(GLOSSARY_MARKER);
  let text=at<0?source:source.slice(0,at);
  // Hide a marker even when an SSE packet ends partway through it.
  if(at<0)for(let size=Math.min(text.length,GLOSSARY_MARKER.length-1);size>0;size--){if(text.endsWith(GLOSSARY_MARKER.slice(0,size))){text=text.slice(0,-size);break;}}
  text=text.trimEnd();let entries=[];
  if(at>=0){try{const tail=source.slice(at+GLOSSARY_MARKER.length).trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1');if(tail.length<=8000)entries=JSON.parse(tail);}catch{}}
  const terms=[],seen=new Set();
  for(const entry of Array.isArray(entries)?entries.slice(0,20):[]){
    if(typeof entry?.term!=='string' || typeof entry?.meaning!=='string')continue;
    const term=entry.term.trim(),meaning=entry.meaning.trim(),key=term.toLowerCase();
    if(term.length<2 || term.length>32 || meaning.length<4 || meaning.length>240 || /[\r\n]/.test(term) || seen.has(key) || !text.toLowerCase().includes(key))continue;
    seen.add(key);terms.push({term,meaning});if(terms.length===6)break;
  }
  return {text,terms,hasGlossary:at>=0};
}
