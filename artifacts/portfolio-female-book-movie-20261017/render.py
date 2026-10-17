"""Render a narrated motion walkthrough from genuine app screenshots and measured results.
No extra API calls. Requires Pillow, numpy, ffmpeg and the generated narration/alignment.
"""
from pathlib import Path
import json,math,subprocess,re,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont
H=Path(__file__).resolve().parent
SOURCE=H.parent/'portfolio-demo-20261017'
W,HEIGHT,FPS=1600,900,24
FONT='/System/Library/Fonts/Supplemental/Arial.ttf'
BOLD='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
F={n:ImageFont.truetype(FONT,n) for n in [20,22,24,26,28,30,34,36,42,48,52,60,72]}
FB={n:ImageFont.truetype(BOLD,n) for n in [24,28,34,42,52,60,72]}
BG='#f5f8fe';INK='#18283f';BLUE='#245ce0';GRAY='#60728d';DARK='#101c31'
story=json.loads((H/'story.json').read_text());a=json.loads((H/'alignment.json').read_text())['alignment'];text=''.join(a['characters'])
starts=a['character_start_times_seconds'];ends=a['character_end_times_seconds'];cursor=0
AUDIO_DURATION=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(H/'narration.mp3')]))
DURATION=AUDIO_DURATION+1.4
for s in story:
 pos=text.index(s['text'],cursor);s['start']=starts[pos];s['end']=ends[pos+len(s['text'])-1];cursor=pos+len(s['text'])
for i,s in enumerate(story):s['stop']=story[i+1]['start'] if i+1<len(story) else DURATION
(H/'timeline.json').write_text(json.dumps(story,indent=2)+'\n')
# Captions follow the actual alignment, grouped into short phrases.
words=list(re.finditer(r'\S+',text));caps=[];group=[]
for word in words:
 group.append(word)
 if len(group)>=9 or (word.group()[-1] in '.?!' and len(group)>=3):
  caps.append((starts[group[0].start()],ends[group[-1].end()-1],text[group[0].start():group[-1].end()].replace('\n',' ')));group=[]
if group:caps.append((starts[group[0].start()],ends[group[-1].end()-1],text[group[0].start():group[-1].end()].replace('\n',' ')))
def stamp(t):
 ms=round(t*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
(H/'captions.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(b)} --> {stamp(e)}\n{v}' for i,(b,e,v) in enumerate(caps))+'\n')
images={p.stem:Image.open(p).convert('RGB') for p in SOURCE.glob('0*.png')}
images.update({p.stem:Image.open(p).convert('RGB') for p in H.glob('*.png') if not p.name.startswith('preview-')})
def wrap(d,text,font,width):
 lines=[];line=''
 for word in text.split():
  candidate=(line+' '+word).strip()
  if d.textlength(candidate,font=font)>width and line:lines.append(line);line=word
  else:line=candidate
 if line:lines.append(line)
 return lines
def paragraph(d,xy,text,size,width,fill=INK,bold=False,lineheight=None):
 x,y=xy;font=FB[size] if bold else F[size]
 for line in wrap(d,text,font,width):d.text((x,y),line,font=font,fill=fill);y+=lineheight or size*1.24
 return y
def rounded(im,box,fill,r=20,outline=None):ImageDraw.Draw(im).rounded_rectangle(box,r,fill=fill,outline=outline,width=2)
def screen(im,key,sourcebox,box,p):
 # Genuine screenshot cropped and gently pushed in; annotations stay separate.
 shot=images[key].crop(sourcebox);x,y,w,h=box
 ratio=max(w/shot.width,h/shot.height)*(1+0.025*p)
 shot=shot.resize((round(shot.width*ratio),round(shot.height*ratio)),Image.Resampling.LANCZOS)
 sx=(shot.width-w)//2;sy=(shot.height-h)//2;shot=shot.crop((sx,sy,sx+w,sy+h));mask=Image.new('L',(w,h));ImageDraw.Draw(mask).rounded_rectangle((0,0,w,h),20,fill=255);im.paste(shot,(x,y),mask)
 ImageDraw.Draw(im).rounded_rectangle((x,y,x+w,y+h),20,outline='#d4dfef',width=2)
def chrome(im,i):
 d=ImageDraw.Draw(im);d.text((65,30),'OpenMemory',font=FB[28],fill=INK);d.text((1190,38),'ElevenLabs · synthetic narrator',font=F[20],fill=GRAY)
 d.line((65,86,1535,86),fill='#dce4f1',width=2)
 d.text((65,110),f'0{i+1} / '+['THE IDEA','A BOOK','LOCAL CLASSIFICATION','REVIEW THE BOOK','A MOVIE','SAVE & RETURN','THE EVIDENCE','EXPLORE'][i],font=F[20],fill=BLUE)
 d.text((65,810),'Actual app captures • Edited timing • Fictional note',font=F[20],fill=GRAY)
 d.text((1045,810),'Synthetic narration by ElevenLabs',font=F[20],fill=GRAY)
def build(i,p,t):
 im=Image.new('RGB',(W,HEIGHT),BG);d=ImageDraw.Draw(im);chrome(im,i)
 if i==0:
  d.rounded_rectangle((1060,170,1510,700),40,fill='#e6eeff')
  for j,r in enumerate([70,130,190]):d.ellipse((1285-r,435-r,1285+r,435+r),outline='#b5c9fa',width=2)
  d.ellipse((1266,416,1304,454),fill=BLUE)
  paragraph(d,(75,210),'Your memories shouldn’t need a form.',72,900,bold=True)
  paragraph(d,(80,520),'A thought → a review → something worth keeping.',34,820,GRAY)
  d.rounded_rectangle((80,660,670,725),20,fill=BLUE);d.text((110,674),'LOCAL-FIRST. HUMAN-REVIEWED.',font=FB[24],fill='white')
 elif i==1:
  paragraph(d,(65,165),'One thought. A useful memory.',52,1450,bold=True)
  screen(im,'01-capture',(285,200,1245,540),(65,270,1470,490),p)
 elif i==2:
  paragraph(d,(65,165),'Fine-tuned locally.',52,900,bold=True)
  screen(im,'00-provider',(365,60,900,575),(65,250,670,510),p)
  for j,(title,sub) in enumerate([('01  MLX adapter','Category + intent'),('02  Local extractor','Title + review details'),('03  You','Review before saving')]):
   y=265+j*165;rounded(im,(800,y,1535,y+130),'white',20,'#d6e2f8');d.text((835,y+20),title,font=FB[34],fill=BLUE);d.text((835,y+73),sub,font=F[28],fill=GRAY)
 elif i==3:
  paragraph(d,(65,165),'Check it before you keep it.',52,1450,bold=True)
  screen(im,'03-review',(310,300,1240,690),(65,260,1470,490),p)
 elif i==4:
  paragraph(d,(65,165),'And a movie you loved.',52,1450,bold=True)
  if p<.26:screen(im,'movie-capture',(285,200,1245,540),(65,270,1470,490),p)
  elif p<.70:screen(im,'movie-review',(310,190,1240,595),(65,260,1470,490),p)
  else:screen(im,'movie-confirm',(320,240,1210,700),(65,260,1470,490),p)
 elif i==5:
  paragraph(d,(65,165),'Your story, together.',52,1450,bold=True)
  screen(im,'book-movie-library',(290,215,1240,615),(65,245,1470,545),p)
 elif i==6:
  paragraph(d,(65,160),'A real experiment. Honest results.',52,1450,bold=True)
  d.text((70,240),'Joint category + intent accuracy • frozen 200-note comparison',font=F[28],fill=GRAY)
  for j,(name,val,color) in enumerate([('Same base',67.0,'#a5b5ce'),('Fine-tuned adapter',76.5,BLUE),('Majority baseline',81.0,'#4e617d')]):
   y=320+j*130;d.text((75,y),name,font=FB[28],fill=INK);d.rounded_rectangle((460,y,460+val*10*(0.8+0.2*min(p*3,1)),y+62),12,fill=color);d.text((1330,y+7),str(val)+'%',font=FB[34],fill=color)
  paragraph(d,(75,730),'730 training examples • AI-assisted labels • experimental • no TV-series label',24,1460,GRAY)
 else:
  im=Image.new('RGB',(W,HEIGHT),DARK);d=ImageDraw.Draw(im)
  d.text((75,60),'OPENMEMORY / LOCAL MODEL RESEARCH',font=FB[24],fill='#8eb3ff')
  paragraph(d,(75,180),'AI suggests.\nYou decide.',72,1400,'white',True)
  paragraph(d,(80,400),'Build locally. Measure honestly. Keep the user in control.',34,1380,'#b9c9e1')
  for j,(label,link) in enumerate([('TRY THE APP','open-memory-ai.vercel.app'),('RESEARCH','github.com/mithhu/openmemory-local-classifier-research'),('MODEL','huggingface.co/mithhu333/openmemory-qwen3.5-9b-mlx-classifier-v1')]):
   y=520+j*80;d.text((80,y),label,font=FB[24],fill='#8eb3ff');d.text((330,y),link,font=F[24] if label=='MODEL' else F[28],fill='white')
  d.text((80,805),'Experimental adapter • substantial AI assistance • synthetic ElevenLabs narrator',font=F[22],fill='#b9c9e1')
 # Short synchronized captions remain legible regardless of crop.
 cap=next((v for b,e,v in caps if b<=t<=e+0.10),'')
 if cap:
  lines=wrap(d,cap,FB[28],1420);y=HEIGHT-45-len(lines)*36
  d.rounded_rectangle((55,y-12,1545,HEIGHT-22),12,fill='#101c31')
  for line in lines:
   width=d.textlength(line,font=FB[28]);d.text(((W-width)/2,y),line,font=FB[28],fill='white');y+=36
 d.rectangle((0,HEIGHT-5,int(W*t/DURATION),HEIGHT),fill=BLUE)
 return im
# Render previews before encoding so every layout can be inspected.
for i,s in enumerate(story):build(i,.5,(s['start']+s['stop'])/2).save(H/f'preview-{i}.png')
output=H/'openmemory-female-book-movie-demo.mp4'
cmd=['ffmpeg','-y','-v','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{HEIGHT}','-r',str(FPS),'-i','-','-i',str(H/'narration.mp3'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-af','loudnorm=I=-16:TP=-1.5:LRA=11,apad','-c:a','aac','-b:a','192k','-ar','48000','-t',str(DURATION),'-movflags','+faststart',str(output)]
with subprocess.Popen(cmd,stdin=subprocess.PIPE) as proc:
 for frame in range(math.ceil(DURATION*FPS)):
  t=frame/FPS;i=max(j for j,s in enumerate(story) if s['start']<=t) if t>=story[0]['start'] else 0;s=story[i];p=min(1,max(0,(t-s['start'])/(s['stop']-s['start'])))
  im=build(i,p,t)
  # Brief dissolve at each edit softens the cut without inventing product motion.
  since=t-s['start']
  if i and 0<=since<.25:im=Image.blend(build(i-1,1,t),im,since/.25)
  proc.stdin.write(im.tobytes())
 proc.stdin.close();assert proc.wait()==0
print('Rendered:',output.name)
