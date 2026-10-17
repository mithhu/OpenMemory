"""Generate synthetic portfolio narration. Reads the local key without logging it.
Only the fictional public script goes to ElevenLabs. No app notes or vault are read.
Existing output is reused to avoid accidental repeat charges.
"""
from pathlib import Path
import os,json,urllib.request,urllib.error,base64,re
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
if (HERE/'narration.mp3').exists():raise SystemExit('Narration already exists; no request made.')
key=os.environ.get('ELEVENLABS_API_KEY')
if not key:
 for line in (ROOT/'.env').read_text().splitlines():
  if line.strip().startswith('ELEVENLABS_API_KEY='):key=line.split('=',1)[1].strip().strip('\"\'')
if not key:raise SystemExit('ElevenLabs key is not configured.')
story=json.loads((HERE/'story.json').read_text());text='\n\n'.join(s['text'] for s in story)
(HERE/'narration.txt').write_text(text+'\n')
voice='cgSgspJ2msm6clMCkdW9'
tagged='\n\n'.join(s['delivery']+' '+s['text'] for s in story)
(HERE/'delivery-script.txt').write_text(tagged+'\n')
payload={'text':tagged,'model_id':'eleven_v3','voice_settings':{'stability':0.5,'similarity_boost':0.75},'seed':20261017}
req=urllib.request.Request('https://api.elevenlabs.io/v1/text-to-speech/'+voice+'/with-timestamps?output_format=mp3_44100_128',data=json.dumps(payload).encode(),headers={'xi-api-key':key,'Content-Type':'application/json'})
try:
 with urllib.request.urlopen(req,timeout=120) as response:data=json.load(response)
except urllib.error.HTTPError as e:
 raise SystemExit('ElevenLabs request failed with HTTP '+str(e.code))
(HERE/'narration.mp3').write_bytes(base64.b64decode(data.pop('audio_base64')))
(HERE/'raw-alignment.json').write_text(json.dumps(data,indent=2)+'\n')
a=data['alignment'];raw=''.join(a['characters']);skip=set()
for m in re.finditer(r'\[[^\]]+\] *',raw):skip.update(range(m.start(),m.end()))
keep=[i for i in range(len(raw)) if i not in skip]
clean={key:[values[i] for i in keep] for key,values in a.items()}
assert ''.join(clean['characters'])==text,'Alignment needs review before rendering.'
(HERE/'alignment.json').write_text(json.dumps({'alignment':clean},indent=2)+'\n')
(HERE/'voice-provenance.json').write_text(json.dumps({'provider':'ElevenLabs','voice_id':voice,'model_id':payload['model_id'],'voice_name':'Jessica','delivery':'soft, playful and confident female marketing narration, directed using v3 audio tags','synthetic_narration':True,'voice_cloning':False,'script_characters':len(text),'sent_data':'public fictional portfolio narration only','api_documentation':'https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps'},indent=2)+'\n')
print('Generated synthetic narration with character timing; no credentials logged.')
