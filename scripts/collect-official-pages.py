"""Resumable public-page staging; never imports or marks admissions as reviewed.

Python stdlib + curl. Example:
python scripts/collect-official-pages.py --manifest data/research/<manifest>.json --output tmp/source-batch
Raw bodies remain in the ignored output directory. Summary records contain no page text.
"""
from pathlib import Path
from urllib.parse import urlsplit,urljoin,parse_qsl
from html.parser import HTMLParser
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import datetime,timezone,timedelta
from collections import deque
import argparse,hashlib,json,subprocess,threading,time,re

DOMAINS=('cityu.edu.hk','hkbu.edu.hk','ln.edu.hk','cuhk.edu.hk','eduhk.hk','polyu.edu.hk','hkust.edu.hk','ust.hk','hku.hk','nus.edu.sg','duke-nus.edu.sg','ntu.edu.sg','smu.edu.sg','sutd.edu.sg','singaporetech.edu.sg','suss.edu.sg')
def institution(url):
 try:
  p=urlsplit(url);host=(p.hostname or '').lower()
  if p.scheme!='https' or p.username or p.password or p.port not in (None,443):return None
  if re.search(r'/(?:onlineapp|login|signin|payment|intranet)(?:/|\.|$)',p.path,re.I):return None
  if any(re.search(r'token|password|secret|session|authorization',k,re.I) for k,v in parse_qsl(p.query)):return None
  return next((d for d in DOMAINS if host==d or host.endswith('.'+d)),None)
 except ValueError:return None

class PageText(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.skip=[];self.parts=[];self.title_parts=[];self.in_title=False;self.links=[];self.anchor=None;self.meta_redirect=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag in ('script','style','nav','header','footer','noscript'):self.skip.append(tag)
  if tag=='title':self.in_title=True
  if tag=='meta' and a.get('http-equiv','').lower()=='refresh':self.meta_redirect=a.get('content','')
  if tag=='a' and not self.skip:self.anchor=[a.get('href',''),[]]
 def handle_endtag(self,tag):
  if tag=='title':self.in_title=False
  if tag=='a' and self.anchor:self.links.append({'href':self.anchor[0],'label':' '.join(self.anchor[1])});self.anchor=None
  if tag in self.skip:self.skip=self.skip[:self.skip.index(tag)]
 def handle_data(self,data):
  value=' '.join(data.split())
  if self.in_title:self.title_parts.append(value)
  if self.skip or not value:return
  self.parts.append(value)
  if self.anchor:self.anchor[1].append(value)

def classify(html,content_type='text/html'):
 if content_type and not any(t in content_type.lower() for t in ('html','text/plain')):return {'state':'non_html','title':'','text':'','links':[]}
 parser=PageText();parser.feed(html);text='\n'.join(parser.parts);title=' '.join(parser.title_parts)
 state='captured_unreviewed'
 if any(s in (title+'\n'+text[:2500]).lower() for s in ('access denied','verify you are human','checking your browser','enable javascript and cookies to continue','just a moment','request rejected')) or '_Incapsula_Resource' in html:state='blocked_response'
 elif parser.meta_redirect and len(text)<200:state='redirect_page'
 elif len(text.strip())<100:state='insufficient_content'
 return {'state':state,'title':title,'text':text,'links':parser.links,'metaRedirect':parser.meta_redirect}

def atomic_json(path,value):
 temp=path.with_suffix('.part');temp.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temp.replace(path)

def collect(job,folder,day,timeout,host_limits):
 key=hashlib.sha256(job['url'].encode()).hexdigest()[:24];record_path=folder/(key+'.json');body_path=folder/(key+'.html');header_path=folder/(key+'.headers')
 if record_path.exists():
  old=json.loads(record_path.read_text(encoding='utf-8'))
  if old.get('observedOn')==day and old.get('state')=='captured_unreviewed' and old.get('requestedUrl')==job['url'] and body_path.exists() and hashlib.sha256(body_path.read_bytes()).hexdigest()==old.get('sha256'):return dict(old,reusedCapture=True,programmeIds=job['programmeIds'],schoolIds=job['schoolIds'],reviewed=False,usedInAdmissions=False)
 result={'key':key,'requestedUrl':job['url'],'programmeIds':job['programmeIds'],'schoolIds':job['schoolIds'],'observedOn':day,'fetchedAt':datetime.now(timezone.utc).isoformat(),'reviewed':False,'usedInAdmissions':False,'transport':'curl default TLS verification; every redirect checked before request'}
 original=institution(job['url']);url=job['url'];result['redirects']=[]
 if not original:return dict(result,state='url_not_allowed',error='Requires a public official university HTTPS source')
 with host_limits[original]:
  try:
   for hop in range(6):
    if institution(url)!=original:raise ValueError('Redirect outside original official institution or into a private path')
    process=subprocess.run(['curl','--silent','--show-error','--connect-timeout','8','--max-time',str(timeout),'--max-filesize','5000000','--max-redirs','0','--dump-header',str(header_path),'--output',str(body_path),'--write-out','%{http_code}',url],capture_output=True,text=True,timeout=timeout+5)
    if process.returncode:raise RuntimeError(process.stderr.strip()[:300] or 'curl request failed')
    status=int(process.stdout[-3:]);result['status']=status;result['url']=url
    headers=header_path.read_text(encoding='iso-8859-1');locations=re.findall(r'^location:\s*(.+)$',headers,re.I|re.M)
    if status in (301,302,303,307,308):
     if not locations:raise ValueError('Redirect has no Location')
     target=urljoin(url,locations[-1].strip());result['redirects'].append({'from':url,'to':target})
     if institution(target)!=original:raise ValueError('Redirect target is not allowed')
     url=target;continue
    data=body_path.read_bytes();result['sha256']=hashlib.sha256(data).hexdigest();result['bytes']=len(data)
    if status!=200:result['state']='http_error';break
    types=re.findall(r'^content-type:\s*(.+)$',headers,re.I|re.M);parsed=classify(data.decode('utf-8',errors='replace'),types[-1].strip() if types else '')
    result.update(parsed);result['links']=[dict(x,url=urljoin(url,x['href'])) for x in result['links'] if x['label'] and institution(urljoin(url,x['href']))==original];break
   else:raise ValueError('Redirect limit reached')
  except ValueError as error:result.update(state='redirect_not_allowed',error=str(error))
  except Exception as error:result.update(state='network_error',error=str(error)[:300])
  finally:time.sleep(0.15)
 atomic_json(record_path,result);return result

def run(manifest,output,workers=8,timeout=25):
 if manifest.get('schemaVersion')!=1 or not isinstance(manifest.get('jobs'),list) or len(manifest['jobs'])>1500:raise ValueError('Invalid bounded manifest')
 jobs=manifest['jobs'];urls=[j['url'] for j in jobs]
 if len(set(urls))!=len(urls) or any(not institution(u) for u in urls):raise ValueError('Manifest has duplicate or non-public official URLs')
 output.mkdir(parents=True,exist_ok=True);limits={d:threading.Semaphore(2) for d in DOMAINS};records=[]
 # Interleave schools so a slow host cannot occupy every waiting worker.
 queues={d:deque(j for j in jobs if institution(j['url'])==d) for d in DOMAINS};ordered=[]
 while any(queues.values()):
  for queue in queues.values():
   if queue:ordered.append(queue.popleft())
 observed=datetime.now(timezone(timedelta(hours=8))).date().isoformat()
 with ThreadPoolExecutor(max_workers=workers) as executor:
  futures=[executor.submit(collect,j,output,observed,timeout,limits) for j in ordered]
  for future in as_completed(futures):
   records.append(future.result())
   if len(records)%25==0 or len(records)==len(jobs):print(f'Captured {len(records)}/{len(jobs)} sources',flush=True)
 states={state:sum(r['state']==state for r in records) for state in sorted(set(r['state'] for r in records))};by_school={}
 for r in records:
  for school in r['schoolIds']:
   row=by_school.setdefault(school,{});row[r['state']]=row.get(r['state'],0)+1
 summary={'schemaVersion':1,'manifestAsOfDate':manifest['asOfDate'],'observedOn':observed,'counts':dict(manifest['counts'],**states),'bySchool':by_school,'warning':'Captured text is UNREVIEWED. No checked record, admissions rule, eligibility tier or human review is created.','sources':[{k:v for k,v in r.items() if k not in ('text','links')} for r in sorted(records,key=lambda r:r['requestedUrl'])]}
 atomic_json(output/'summary.json',summary);return summary

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True);parser.add_argument('--output',required=True);parser.add_argument('--workers',type=int,default=8);parser.add_argument('--timeout',type=int,default=25);args=parser.parse_args()
 if not 1<=args.workers<=12 or not 5<=args.timeout<=60:parser.error('workers1–12; timeout5–60')
 dest=Path(args.output).resolve();repo=Path(__file__).resolve().parent.parent
 if not dest.is_relative_to(repo/'tmp'):parser.error('Raw captures must stay inside ignored repository tmp/')
 result=run(json.loads(Path(args.manifest).read_text(encoding='utf-8')),dest,args.workers,args.timeout);print(json.dumps(result['counts']),flush=True)
