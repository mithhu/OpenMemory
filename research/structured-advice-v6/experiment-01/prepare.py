"""Reserve inputs before any v6 inference; no source metadata becomes gold."""
import hashlib,json,sys,random
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/app-mlx'))
from structured_advice_v6 import validate
sys.path.insert(0,str(ROOT/'scripts/fine-tuning'))
from prepare_fresh_public_holdout_v1 import prior_inputs

AUTHORED='''SERIES|wishlist||My friends say the TV series Lantern Street is worth it; I'd like to give it a go.
SERIES|start||I've just begun the television drama Lantern Street tonight.
SERIES|progress||Six eps into season four of the sitcom Lantern Street now.
SERIES|progress||Season three of the TV show Copper Valley is done; I haven't finished the show.
SERIES|progress||Just wrapped episode eight of the television series Copper Valley.
SERIES|progress||The season finale of Copper Valley is over, but I have more seasons left.
SERIES|complete||I've completed the whole miniseries Winter Harbour, every episode.
SERIES|complete||All seasons of the TV drama Winter Harbour are finished now.
SERIES|reaction||The TV show Lantern Street is easily my favourite this year.
SERIES|null|missing_action|Watched the television drama Copper Valley during the flight.
SERIES|progress|missing_identity|Three episodes into that sitcom and enjoying it.
SERIES|wishlist||Find me a television series for my next holiday.
SERIES|wishlist|missing_identity|I want to catch up with that TV show you mentioned.
SERIES|null|missing_identity,missing_action|We watched a miniseries after tea yesterday.
SERIES|progress||I finished the fourth season of the anime series Blue Orchard.
SERIES|progress||Saw episode one of the show Blue Orchard; the rest is still unwatched.
MOVIE|wishlist||I'd like to watch the film Velvet Bridge next Sunday.
MOVIE|progress||Twenty minutes into the film Velvet Bridge; I'll finish it tomorrow.
MOVIE|complete||I watched the entire film Paper Lighthouse right through the credits.
MOVIE|null|missing_action|I watched the film Paper Lighthouse earlier this week.
MOVIE|reaction|missing_identity|That movie gets a one-star rating from me.
BOOK|wishlist||Find me a novel to read on my commute next week.
BOOK|start||I've begun reading the novel The Glass Orchard today.
BOOK|progress||I finished chapter nine of the novel The Glass Orchard; several chapters remain.
BOOK|complete||Read every last page of the novel The Salt Atlas, and finished the book.
BOOK|reaction|missing_identity|This book series deserves zero stars out of five.
LESSON|progress||Completed lecture seven in the course Ceramic Chemistry; the course continues.
LESSON|progress||Module three of Ceramic Chemistry is complete, not the whole course.
LESSON|progress|missing_identity|Finished two lectures in that online course this afternoon.
LESSON|progress||Lesson one of the Harbour Navigation course is done.
LESSON|complete||Finished the entire Harbour Navigation course, including all its modules.
LESSON|null|missing_action|I did the course Orchard Design on Monday.
LESSON|wishlist||Could you find an online class for me to study during the break?
LESSON|reaction|missing_identity|That training course was genuinely useful.
MUSIC|wishlist||Play some gentle music for my evening walk.
MUSIC|listen||I played the song Silver Windows on the bus home.
MUSIC|reaction||The song Silver Windows deserves five stars.
MUSIC|wishlist|unresolved_reference|Find a song from that musician we talked about.
NOTE|none||Read my gas meter and wrote the number down.
NOTE|null|unresolved_reference|Got it finished this afternoon.
NOTE|wishlist|unresolved_reference|I'd like to give it another try next month.
PERSON|none||My cousin Noor has started learning Portuguese.
GOAL|none||I want to make stretching a daily habit.
WISHLIST|wishlist||Please find a cafe for brunch near the station on Friday.
IDEA|none||An idea for a browser app that shares surplus vegetables.
MIXED|mixed||Started the novel The Salt Atlas and completed lesson two of Ceramic Chemistry.
MIXED|mixed|missing_action|Read the novel The Salt Atlas yesterday and booked a trip to Bergen.
MIXED|mixed|missing_identity|Finished an episode of that TV show and want to buy a tent.'''

def dump(name,value):
 with (HERE/name).open('x') as f:json.dump(value,f,indent=2,ensure_ascii=False);f.write('\n')
def main():
 paths=set((ROOT/'research').glob('**/*.json'))
 inventory=json.loads((ROOT/'docs/fine-tuning/classification-fresh-public-holdout-v1/prior-input-inventory.json').read_text())
 paths.update(ROOT/p for p in inventory if (ROOT/p).exists())
 for pattern in ['**/train*.json','**/*holdout*.json','**/*review*.json','**/*labels*.json','**/*candidates*.json']:
  paths.update((ROOT/'docs/fine-tuning').glob(pattern))
 texts,ids,_=prior_inputs(sorted(paths));norm=lambda s:' '.join(s.casefold().split());texts={norm(t) for t in texts}
 qualification=[]
 for index,line in enumerate(AUTHORED.splitlines()):
  category,intent,reasons,note=line.split('|',3)
  if norm(note) in texts:raise ValueError('Authored evaluation overlaps prior wording: '+note)
  label=validate({'category':category,'intent':None if intent=='null' else intent,'clarificationReasons':reasons.split(',') if reasons else []})
  qualification.append({'id':f'v6-e1-qualification-{index:03}','note':note,'expected':label,'slice':'series' if category=='SERIES' else 'retention','labelProvenance':'AI-authored fictional note and AI task judgment; not independent human gold.'})
  texts.add(norm(note))
 assert len(qualification)==48
 train=json.loads((HERE.parent/'train-provisional-mixture-v6.json').read_text())
 for row in train:validate(row['expected'])
 random.Random(2026101901).shuffle(train)
 dump('train.json',train);dump('qualification.json',qualification)
 seed='v6-e1-fresh-public-20261019';nominees=[];excluded=[]
 cache=Path('/tmp/openmemory-v5-public-source')
 for intent,codec in [('RateBook','utf-8'),('BookRestaurant','utf-8'),('PlayMusic','latin-1')]:
  raw=(cache/f'train_{intent}_full.json').read_bytes();data=json.loads(raw.decode(codec))[intent];count=0
  for index,row in sorted(enumerate(data),key=lambda pair:hashlib.sha256(f'{seed}:{intent}:{pair[0]}'.encode()).hexdigest()):
   note=''.join(v['text'] for v in row['data']);id=f'snips:{intent}:train-full:{index}'
   if norm(note) in texts or id in ids:
    excluded.append(id);continue
   nominees.append({'id':id,'note':note,'sourceIntent':intent,'recordIndex':index,'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceEncoding':codec,'sourceSlots':row['data']});texts.add(norm(note));count+=1
   if count==8:break
  assert count==8
 dump('public-nominations.json',nominees)
 dump('public-screening.json',{'seed':seed,'priorArtifacts':len(paths),'priorExpressions':len(texts)-72,'excludedIds':excluded,'nominated':len(nominees),'limits':'Exact wording/ID exclusion only. SNIPS source family used before, not globally source-heldout; task labels remain AI judgments. No pretraining exclusion claim.'})
 print(json.dumps([{'id':r['id'],'note':r['note']} for r in nominees],ensure_ascii=False,indent=2))
if __name__=='__main__':main()
