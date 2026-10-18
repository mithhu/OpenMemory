"""Versioned repair labels and prospective qualification; no predictions consulted here."""
import json,random,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/app-mlx'))
from structured_advice_v5 import validate
REPAIR='''BOOK|null|missing_action|I read the novel Cloud Atlas on Tuesday.
BOOK|null|missing_action|Read Cloud Atlas, the book, yesterday afternoon.
BOOK|null|missing_identity,missing_action|I read a book during my break.
BOOK|null|missing_identity,missing_action|Read that novel last evening.
MOVIE|null|missing_action|I watched the film Portrait of a Lady on Fire yesterday.
MOVIE|null|missing_action|Watched the movie Minari on the journey.
MOVIE|null|missing_identity,missing_action|I watched a film after lunch.
MOVIE|null|missing_identity,missing_action|Watched that movie the other night.
SERIES|null|missing_action|Watched the television show Atlanta yesterday.
SERIES|null|missing_action|I watched the series Fleabag on the train.
SERIES|null|missing_identity,missing_action|Watched a TV show yesterday evening.
SERIES|null|missing_identity,missing_action|I watched that miniseries on Monday.
BOOK|progress|-|Read some of the novel Cloud Atlas, but not all of it.
BOOK|complete|-|Finished every page of the book Cloud Atlas.
MOVIE|progress|-|Only watched part of the movie Minari.
MOVIE|complete|-|Watched the entire film Minari to its end.
SERIES|progress|-|Finished the opening episode of the TV series Atlanta.
SERIES|progress|-|Completed season one of the show Fleabag, not the series.
LESSON|progress|-|Completed lesson two of the Geology Fundamentals course.
LESSON|progress|-|Finished the fifth lecture in Geology Fundamentals.
LESSON|progress|-|Lesson eight done in my Geology Fundamentals course.
LESSON|progress|-|I've completed module one of Geology Fundamentals; several modules remain.
LESSON|progress|-|Finished two lectures of the Geology Fundamentals course.
LESSON|progress|-|Done with lecture four in that course.
LESSON|progress|missing_identity|Finished one lesson of that course.
LESSON|progress|missing_identity|I've done three modules in a course.
LESSON|complete|-|Completed all the lessons in the Geology Fundamentals course.
LESSON|complete|-|Finished the entire Geology Fundamentals course, every module.
LESSON|complete|missing_identity|Finished every lecture of that course.
LESSON|complete|missing_identity|The entire course is complete now.
LESSON|wishlist|missing_identity|Could you recommend a course for me to take?
LESSON|wishlist|missing_identity|I'd like to enroll in an online course.
LESSON|wishlist|missing_identity|Find me a class I can study next month.
LESSON|wishlist|missing_identity|I want a course to work through on holiday.
LESSON|reaction|missing_identity|That course was extremely helpful.
LESSON|null|missing_identity,missing_action|I did a course yesterday.
NOTE|null|unresolved_reference|Want to give that a go next week.
NOTE|null|unresolved_reference|Thinking of starting it soon.
NOTE|null|unresolved_reference|I'll try that when I have time.
NOTE|null|unresolved_reference|Done with that now.
NOTE|null|unresolved_reference|Got halfway through it yesterday.
NOTE|null|unresolved_reference|I want to finish it.
NOTE|null|unresolved_reference|Planning to try it on Saturday.
NOTE|null|unresolved_reference|I started that yesterday.
MIXED|mixed|-|I want to visit Bergen and begin learning Italian.
MIXED|mixed|-|I'd like to buy a camera and start training for a marathon.
MIXED|mixed|-|Want to watch Minari and also take a geology course.
MIXED|mixed|-|Planning to go to Porto and read the novel Cloud Atlas.
MIXED|mixed|-|Finished episode two of Atlanta and read ten pages of Cloud Atlas.
MIXED|mixed|-|Completed lesson five of Geology Fundamentals and listened to the song Creep.
MIXED|mixed|-|My sister moved to Cardiff and I started the series Fleabag.
MIXED|mixed|-|Want to travel to Helsinki and get better at swimming.
MIXED|mixed|-|I want to buy a desk and visit a museum this weekend.
MIXED|mixed|-|Started a book called Cloud Atlas and began the course Geology Fundamentals.
NOTE|none|-|I enjoy quiet walks and old buildings.
NOTE|none|-|Read my shopping list and went to the supermarket.
NOTE|none|-|Watched the ducks with my nephew.
NOTE|none|-|I like jazz and novels about travel.
PERSON|none|-|My cousin's favourite film is Minari.
GOAL|none|-|I want to improve my stamina through regular swimming.
WISHLIST|wishlist|-|I'd like to visit Helsinki next winter.
IDEA|none|-|I have an idea for an app that tracks shared garden tools.
MUSIC|wishlist|missing_identity|Please find me a song to play while I cook.
MUSIC|reaction|missing_identity|That song sounded lovely.'''
FRESH='''SERIES|wishlist|-|I'm planning to watch the TV show The Glass Orchard next weekend.
SERIES|start|-|Began the TV series The Glass Orchard last night.
SERIES|progress|-|I've seen five episodes of The Glass Orchard season three.
SERIES|progress|-|Finished episode seven of season two of the show The Glass Orchard.
SERIES|progress|-|Season three of the show The Glass Orchard is finished, not the entire series.
SERIES|complete|-|Every season of the TV show The Glass Orchard is finished now.
SERIES|reaction|-|The Glass Orchard is a wonderful series, even though I didn't watch any today.
SERIES|null|missing_action|I watched the show The Glass Orchard on Friday.
SERIES|wishlist|missing_identity|I'd like a TV series to watch after work.
SERIES|progress|missing_identity|Finished season five of that TV show.
SERIES|reaction|missing_identity|That miniseries was amazing.
SERIES|progress|-|Caught up with three episodes of the anime The Silver Ferry.
LESSON|progress|-|I've completed lecture nine in Soil Ecology.
LESSON|progress|-|Finished the first module of the Soil Ecology course; the rest is still ahead.
LESSON|progress|-|Lesson twelve is done in my Soil Ecology course.
LESSON|progress|missing_identity|Completed the sixth lecture in that course.
LESSON|complete|-|I've completed every module of the Soil Ecology course.
LESSON|complete|missing_identity|That entire course is now finished, all lessons.
LESSON|wishlist|missing_identity|I'm looking for an online course to enroll in over the summer.
LESSON|null|missing_identity,missing_action|I did a course on Sunday.
BOOK|null|missing_action|I read the novel The Amber Atlas over breakfast.
BOOK|progress|-|Read fifteen pages from the novel The Amber Atlas.
BOOK|complete|-|Finished the book The Amber Atlas, every page.
BOOK|reaction|missing_identity|That book was a disappointment.
MOVIE|null|missing_action|I watched the film Paper Satellites on Saturday.
MOVIE|progress|-|Twenty minutes into the movie Paper Satellites.
MOVIE|complete|-|Watched Paper Satellites, the movie, all the way through to the end.
MOVIE|wishlist|missing_identity|I'd like to watch a film on my day off.
MIXED|mixed|-|I want to visit Ljubljana and take up daily jogging.
MIXED|mixed|-|Finished lesson nine of Soil Ecology and started the film Paper Satellites.
MIXED|mixed|-|I'd like to buy a lamp and read the novel The Amber Atlas.
MIXED|mixed|-|I'm planning a trip to Riga and want to learn to swim.
NOTE|null|unresolved_reference|I'll give it a try when the weekend comes.
NOTE|null|unresolved_reference|Finally got that finished.
NOTE|none|-|Read a message from my uncle while waiting for the bus.
NOTE|none|-|I love old sitcoms and instrumental music.
MUSIC|listen|-|Listened to the song Lanterns at Noon.
MUSIC|reaction|-|The track Lanterns at Noon is beautiful.
MUSIC|wishlist|missing_identity|Can you play some peaceful piano music for me?
MUSIC|reaction|missing_identity|That song has a wonderful melody.
PERSON|none|-|My neighbour's favourite novel is The Amber Atlas.
PERSON|none|-|Alina is my closest friend.
GOAL|none|-|I want to become confident speaking Portuguese.
GOAL|none|-|My aim is to walk for half an hour every day.
WISHLIST|wishlist|-|I'd like to take a holiday in Ljubljana.
WISHLIST|wishlist|-|I want to buy a new kitchen table.
IDEA|none|-|An idea: make a website where neighbours can share seeds.
IDEA|none|-|I could create a podcast about the history of local bridges.'''
def rows(text,split):
 out=[]
 for i,line in enumerate(text.splitlines()):
  c,a,rs,n=line.split('|',3)
  gold=validate({'category':c,'intent':None if a=='null' else a,'clarificationReasons':[] if rs=='-' else rs.split(',')})
  out.append({'id':f'v5-r2-{split}-{i:03}','note':n,'expected':gold,'slice':'series' if c=='SERIES' else 'retention','provenance':'AI-authored fictional policy label, same-author review; not human-independent'})
 return out

def main():
 previous=json.loads((HERE.parent/'experiment-01/train.json').read_text())
 train=previous+rows(REPAIR,'repair')
 qualification=rows(FRESH,'qualification')
 norm=lambda n:' '.join(n.casefold().split())
 notes=[norm(r['note']) for r in train+qualification]
 if len(notes)!=len(set(notes)):raise ValueError('Duplicate note')
 old_test=json.loads((HERE.parent/'experiment-01/qualification.json').read_text())
 if {norm(r['note']) for r in qualification}&{norm(r['note']) for r in old_test}:raise ValueError('Old test reuse')
 random.Random(2026101802).shuffle(train)
 for name,data in [('train.json',train),('qualification.json',qualification)]:
  with (HERE/name).open('x') as f:json.dump(data,f,indent=2);f.write('\n')
 print(json.dumps({'train':len(train),'repair':len(rows(REPAIR,'repair')),'qualification':len(qualification)}))
if __name__=='__main__':main()
