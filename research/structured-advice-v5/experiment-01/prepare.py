"""Explicitly authored v5 policy labels. No keyword inference or model predictions."""
import hashlib, json, random, sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/app-mlx'))
from structured_advice_v5 import validate
# category|intent (null if unknown)|reasons (comma separated, - if none)|original fictional note
TRAIN='''SERIES|wishlist|-|I'm finally going to start the TV series Severance.
SERIES|start|-|Started the show Severance tonight.
SERIES|progress|-|Finished episode two of Severance, not the season.
SERIES|progress|-|I watched four episodes of Severance season one.
SERIES|progress|-|Finished season one of Severance.
SERIES|complete|-|I've finished every season of the TV series Severance.
SERIES|reaction|-|Severance is such a good TV show.
SERIES|null|missing_action|I watched the series Severance yesterday.
SERIES|wishlist|missing_identity|I want to start a new TV series this month.
SERIES|progress|missing_identity|Finished season three of that show.
SERIES|reaction|missing_identity|That TV series was disappointing.
SERIES|complete|missing_identity|Finished the entire series, all seasons.
SERIES|wishlist|-|My colleague keeps recommending the TV series Arcane; I want to watch it.
SERIES|progress|-|I'm halfway through the anime series Arcane.
SERIES|reaction|-|The TV show Arcane is brilliant, though I didn't watch any today.
SERIES|wishlist|-|Wanna watch the sitcom Abbott Elementary this weekend.
SERIES|progress|-|I've watched six eps of Abbott Elementary season two.
SERIES|progress|-|Completed the final episode of season two of Abbott Elementary, but other seasons remain.
SERIES|complete|-|Finished the whole miniseries Chernobyl.
SERIES|reaction|-|The miniseries Chernobyl was incredible.
MOVIE|wishlist|-|Want to see the film Moonlight this Friday.
MOVIE|start|-|Started watching the movie Moonlight.
MOVIE|progress|-|Halfway through the film Moonlight.
MOVIE|complete|-|Finished watching the entire movie Moonlight.
MOVIE|reaction|-|Moonlight is my favourite film.
MOVIE|null|missing_action|I watched Moonlight, the film, yesterday.
MOVIE|reaction|missing_identity|That film was beautiful.
MOVIE|wishlist|missing_identity|I'd like a movie to watch tonight.
MOVIE|progress|missing_identity|Watched half of that film.
MOVIE|complete|missing_identity|Finished that movie from start to finish.
MOVIE|null|missing_identity,missing_action|I watched a movie last night.
MOVIE|wishlist|-|I haven't watched the movie Past Lives yet, but I plan to.
BOOK|wishlist|-|I'd like to read the novel The Overstory.
BOOK|start|-|Started reading The Overstory, the novel.
BOOK|progress|-|Read twenty pages of The Overstory.
BOOK|complete|-|Finished reading the whole novel The Overstory.
BOOK|reaction|-|The Overstory is a wonderful novel.
BOOK|null|missing_action|Read the novel The Overstory today.
BOOK|wishlist|missing_identity|I want to read a book over the holidays.
BOOK|reaction|missing_identity|That novel was terrible.
BOOK|progress|missing_identity|Read thirty pages of that book.
BOOK|complete|missing_identity|Finished the whole book.
BOOK|null|missing_identity,missing_action|Read a novel on the train.
BOOK|wishlist|-|I'm not reading the novel Beloved yet; I want to start next week.
MUSIC|listen|-|Listened to the song Blue in Green.
MUSIC|reaction|-|The song Blue in Green sounds beautiful.
MUSIC|wishlist|-|Please play the track Blue in Green.
MUSIC|listen|missing_identity|Listened to a song on the bus.
MUSIC|wishlist|missing_identity|Find me some calm music to listen to.
MUSIC|reaction|missing_identity|That song is awful.
MUSIC|wishlist|missing_identity|Could you play some jazz for me?
MUSIC|listen|-|Played the track Dreams by Fleetwood Mac.
LESSON|wishlist|-|I want to take the course Introduction to Astronomy.
LESSON|start|-|Started the Introduction to Astronomy course.
LESSON|progress|-|Finished lesson three of Introduction to Astronomy.
LESSON|progress|-|Halfway through the Introduction to Astronomy course.
LESSON|complete|-|Finished the entire Introduction to Astronomy course.
LESSON|reaction|-|Introduction to Astronomy is a great course.
LESSON|complete|missing_identity|Finished that entire course.
LESSON|wishlist|missing_identity|I want to sign up for a course.
LESSON|null|missing_identity,missing_action|Did that course yesterday.
LESSON|progress|missing_identity|Completed two lessons of that course.
NOTE|none|-|Read a letter from my sister this morning.
NOTE|none|-|I watched the birds outside my window.
NOTE|none|-|Listened to my neighbour talk about her garden.
NOTE|none|-|I usually watch television after dinner.
NOTE|none|-|I enjoy science fiction and jazz.
NOTE|none|-|Went to the bakery and bought lunch.
NOTE|none|-|It rained during my walk today.
NOTE|none|-|I'm grateful for a quiet evening.
NOTE|null|unresolved_reference|Finished it yesterday.
NOTE|null|unresolved_reference|Want to listen to that later.
NOTE|null|unresolved_reference|Started it this morning.
NOTE|null|unresolved_reference|I'm halfway through it.
PERSON|none|-|Nadia is my best friend.
PERSON|none|-|My brother loves horror films.
PERSON|none|-|Leo works at a hospital.
PERSON|none|-|My friend Priya likes the TV show Arcane.
PERSON|none|-|My daughter is learning Spanish.
PERSON|none|-|Sam's birthday is in June.
GOAL|none|-|I want to run a half marathon this year.
GOAL|none|-|My goal is to exercise three times a week.
GOAL|none|-|I'm trying to improve my spoken French.
GOAL|none|-|I aim to pass my driving test.
GOAL|none|-|I want to build a consistent reading habit.
GOAL|none|-|I need to stop staying up so late.
WISHLIST|wishlist|-|I'd love to visit Lisbon next spring.
WISHLIST|wishlist|-|I want to buy a new bicycle.
WISHLIST|wishlist|-|Help me find a restaurant for dinner tomorrow.
WISHLIST|wishlist|-|My goal is to visit Kyoto this autumn.
WISHLIST|wishlist|-|I want to go to a pottery workshop.
WISHLIST|wishlist|-|I'd like to try that new cafe.
IDEA|none|-|An idea: build an app that shares leftover food.
IDEA|none|-|What if I created a board game about gardens?
IDEA|none|-|I have an idea for a short story about a lost robot.
IDEA|none|-|I could make a website for local walking routes.
MIXED|mixed|-|Finished the movie Moonlight and started reading Beloved.
MIXED|mixed|-|I want to visit Lisbon and buy a new bike.
MIXED|mixed|-|Listened to Dreams and completed lesson two of my astronomy course.
MIXED|mixed|-|Finished season one of Severance and started the film Past Lives.'''
# Qualification titles, expressions and complete notes reserved before training.
# Labels are author-reviewed policy labels, not independent human annotations.
QUALIFICATION='''SERIES|wishlist|-|Friends have suggested the show Somebody Somewhere for ages. I'll give it a go next month.
SERIES|start|-|Just began the TV series Somebody Somewhere.
SERIES|progress|-|Season three of Somebody Somewhere: six episodes done.
SERIES|progress|-|Reached episode five in season two of the show Somebody Somewhere.
SERIES|progress|-|That's season two of Somebody Somewhere finished; still more seasons left.
SERIES|complete|-|All seasons of the show Somebody Somewhere are finished now. I've watched the entire series.
SERIES|reaction|-|The TV series Somebody Somewhere is the best thing I've seen in ages.
SERIES|reaction|-|Didn't watch anything today. Still think the show Somebody Somewhere is fantastic.
SERIES|wishlist|missing_identity|Need a new miniseries to watch on my days off.
SERIES|progress|missing_identity|Three episodes into that TV show now.
SERIES|reaction|missing_identity|That anime series really disappointed me.
SERIES|complete|missing_identity|I've seen every episode of that entire TV series now.
SERIES|null|missing_action|I watched the television series Pachinko on Sunday.
SERIES|progress|-|Finished the finale of season one of the TV show Pachinko, not the whole show.
SERIES|wishlist|-|Havent seen the series Pachinko yet. Wanna start it soon.
SERIES|progress|-|Six eps watched from season four of the show Pachinko.
MOVIE|complete|-|The film Aftersun is finished now; I watched it all.
MOVIE|reaction|-|Aftersun is a deeply moving movie.
MOVIE|null|missing_action|Watched the movie Aftersun on my flight.
MOVIE|wishlist|missing_identity|Could you suggest a film for me to watch tonight?
BOOK|progress|-|Forty pages into the novel Hamnet.
BOOK|complete|-|Read the whole of the novel Hamnet, cover to cover.
BOOK|null|missing_action|I read the book Hamnet over lunch.
BOOK|reaction|missing_identity|The novel I mentioned was wonderful.
MUSIC|listen|-|Put on the song Teardrop by Massive Attack this morning.
MUSIC|wishlist|missing_identity|Can you find something upbeat in electronic music for me to play?
MUSIC|reaction|-|The song Teardrop is gorgeous.
MUSIC|reaction|missing_identity|Really disliked that track.
LESSON|progress|-|Lesson seven of the Marine Biology course is done.
LESSON|complete|-|Completed every lesson in the Marine Biology course.
LESSON|wishlist|missing_identity|I'd like a course to take during the holidays.
LESSON|complete|missing_identity|That whole course is finally finished.
NOTE|none|-|Watched the waves while I ate my sandwich.
NOTE|none|-|Read my old postcards and felt nostalgic.
NOTE|none|-|Crime dramas are usually my thing.
NOTE|null|unresolved_reference|Done with it at last.
NOTE|null|unresolved_reference|Want to try that tomorrow.
PERSON|none|-|Elena is my closest friend.
PERSON|none|-|My flatmate's favourite show is Somebody Somewhere.
PERSON|none|-|Omar works as a civil engineer.
GOAL|none|-|I want to be able to swim a kilometre without stopping.
GOAL|none|-|This year I'm aiming to pass the Japanese N3 exam.
WISHLIST|wishlist|-|I'd like to travel to Tallinn in February.
WISHLIST|wishlist|-|My goal is to eat at that new Korean restaurant.
IDEA|none|-|I have an idea for a tool that helps neighbours lend tools to each other.
IDEA|none|-|What if I made a documentary about night-shift workers?
MIXED|mixed|-|Started Hamnet and watched half of the film Aftersun.
MIXED|mixed|-|I want to see Tallinn and also learn to swim a kilometre.'''
def rows(text, split):
    result=[]
    for index,line in enumerate(text.splitlines()):
        category,intent,reasons,note=line.split('|',3)
        label=validate({'category':category,'intent':None if intent=='null' else intent,'clarificationReasons':[] if reasons=='-' else reasons.split(',')})
        result.append({'id':f'v5-{split}-{index:03}', 'note':note, 'expected':label,
            'slice':'series' if category=='SERIES' else 'retention',
            'provenance':'AI-authored fictional note and policy label; reviewed before training; not human-independent'})
    return result

def main():
    train=rows(TRAIN,'train')
    old=json.loads((HERE.parent/'development.json').read_text())
    for r in old:
        validate(r['expected']);train.append({**r,'slice':'series' if r['expected']['category']=='SERIES' else 'retention'})
    qualification=rows(QUALIFICATION,'qualification')
    norm=lambda x:' '.join(x.casefold().split())
    notes=[norm(x['note']) for x in train+qualification]
    if len(notes)!=len(set(notes)):raise ValueError('Exact overlap')
    # Historical exact overlap is reported, not silently removed or called novel.
    historical=set()
    for p in (ROOT/'research').glob('tv-series-v*/**/*.json'):
        try:
            data=json.loads(p.read_text())
            if isinstance(data,list):
                historical.update(norm(r.get('text',r.get('note',''))) for r in data if isinstance(r,dict))
        except (ValueError,OSError):pass
    overlap=[r['id'] for r in qualification if norm(r['note']) in historical]
    if overlap:raise ValueError('Qualification overlaps known TV files: '+str(overlap))
    random.Random(2026101801).shuffle(train)
    for name,data in [('train.json',train),('qualification.json',qualification)]:
        path=HERE/name
        with path.open('x') as f:json.dump(data,f,indent=2,ensure_ascii=False);f.write('\n')
    print(json.dumps({'train':len(train),'qualification':len(qualification),'qualificationSeries':sum(r['slice']=='series' for r in qualification),'exactHistoricalOverlap':overlap}))
if __name__=='__main__':main()
