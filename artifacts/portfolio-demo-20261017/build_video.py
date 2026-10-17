from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import textwrap,json,hashlib
HERE=Path(__file__).resolve().parent
font='/System/Library/Fonts/Supplemental/Arial.ttf'
scenes=[
('00-provider.png','01 / Choose where AI runs','Native MLX classifies on this Mac. A separate local Ollama model extracts details. Cloud processing requires an explicit choice.'),
('01-capture.png','02 / Write naturally','A fictional note: “I want to read Sapiens.” The challenge is to identify both the subject and the action, without recording a completed activity.'),
('02-processing.png','03 / Run the fine-tuned adapter','This run used reviewed730: BOOK / wishlist. The runtime adapter hash matches the public release. Processing waits are omitted; this is not a latency benchmark.'),
('03-review.png','04 / Review the interpretation','The actual app proposes Book, Sapiens, Something I want to do. Classification and extraction remain fallible. The user reviews the details before Save.'),
('04-saved.png','05 / Confirm before writing','Only explicit Save writes the reviewed record to this browser’s vault. The app shows a durable save confirmation. No cloud AI was selected for this typed flow.'),
('05-library.png','06 / Return to your library','Sapiens appears as a Book / Wishlist item and survived reload. Experimental model: 67.0% to 76.5% joint on 200 notes, below the 81.0% majority baseline. Links and evidence accompany this demo.')]
for i,(image,title,caption) in enumerate(scenes):
 canvas=Image.new('RGB',(1600,1080),'#f7f9fc');d=ImageDraw.Draw(canvas)
 d.text((80,30),'OPENMEMORY  /  LOCAL FINE-TUNING IN A REAL APP',font=ImageFont.truetype(font,24),fill='#2858c8')
 d.text((80,70),title,font=ImageFont.truetype(font,38),fill='#202b3b')
 shot=Image.open(HERE/image).convert('RGB');shot.thumbnail((1440,810));canvas.paste(shot,((1600-shot.width)//2,130))
 for j,line in enumerate(textwrap.wrap(caption,width=106)):
  d.text((80,960+j*30),line,font=ImageFont.truetype(font,25),fill='#202b3b')
 d.text((80,1048),'Actual UI captures • edited, captioned walkthrough • fictional data • no audio',font=ImageFont.truetype(font,18),fill='#5a687c')
 canvas.save(HERE/f'scene-{i}.png')
(HERE/'frames.txt').write_text(''.join(f"file 'scene-{i}.png'\nduration 20\n" for i in range(6))+"file 'scene-5.png'\n")
def stamp(t):return f'{t//3600:02}:{t//60%60:02}:{t%60:02},000'
(HERE/'captions.srt').write_text('\n\n'.join(f'{i+1}\n{stamp(i*20)} --> {stamp((i+1)*20)}\n{title}\n{caption}' for i,(_,title,caption) in enumerate(scenes))+'\n')
