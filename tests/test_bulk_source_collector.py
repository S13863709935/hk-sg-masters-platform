from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from types import SimpleNamespace
import unittest,importlib.util,threading,json,hashlib
spec=importlib.util.spec_from_file_location('collector',Path(__file__).resolve().parents[1]/'scripts/collect-official-pages.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class CollectorTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp_root=Path(__file__).resolve().parents[1]/'tmp';cls.temp_root.mkdir(exist_ok=True)
 def test_public_official_urls_only(self):
  self.assertEqual(module.institution('https://www.nus.edu.sg/programme'),'nus.edu.sg')
  for u in ['http://www.nus.edu.sg/','https://nus.edu.sg.evil.test/','https://user:pass@www.nus.edu.sg/','https://www.nus.edu.sg/OnlineApp/login.aspx','https://www.nus.edu.sg/?token=private','https://127.0.0.1/']:
   self.assertIsNone(module.institution(u),u)
 def test_challenge_and_meta_are_not_programme_text(self):
  self.assertEqual(module.classify('<title>Just a moment</title><p>Verify you are human</p>')['state'],'blocked_response')
  self.assertEqual(module.classify('<html><meta http-equiv="refresh" content="0;url=https://www.nus.edu.sg/new"></html>')['state'],'redirect_page')
  self.assertEqual(module.classify('binary','application/pdf')['state'],'non_html')
  r=module.classify('<title>Programme</title><script>hidden</script><p>'+('Public entry information. '*20)+'</p>');self.assertEqual(r['state'],'captured_unreviewed');self.assertNotIn('hidden',r['text'])
 def test_external_redirect_is_never_requested(self):
  with TemporaryDirectory(dir=self.temp_root) as d:
   folder=Path(d);calls=[];job={'url':'https://www.nus.edu.sg/programme','programmeIds':['SG-NUS-P001'],'schoolIds':['SG-NUS']}
   def fake(args,**kw):
    calls.append(args);Path(args[args.index('--dump-header')+1]).write_text('HTTP/1.1 302 Found\nLocation: https://example.com/private\n');Path(args[args.index('--output')+1]).write_bytes(b'');return SimpleNamespace(returncode=0,stdout='302',stderr='')
   with patch.object(module.subprocess,'run',side_effect=fake),patch.object(module.time,'sleep'):
    result=module.collect(job,folder,'2026-11-04',5,{'nus.edu.sg':threading.Semaphore(1)})
   self.assertEqual(result['state'],'redirect_not_allowed');self.assertEqual(len(calls),1);self.assertNotIn('--insecure',calls[0]);self.assertFalse(result['reviewed']);self.assertFalse(result['usedInAdmissions'])
 def test_same_day_resume_requires_exact_body_hash_and_never_grants_review(self):
  with TemporaryDirectory(dir=self.temp_root) as d:
   folder=Path(d);job={'url':'https://www.nus.edu.sg/programme','programmeIds':['SG-NUS-P001'],'schoolIds':['SG-NUS']};key=hashlib.sha256(job['url'].encode()).hexdigest()[:24];data=b'Public programme body'
   (folder/(key+'.html')).write_bytes(data);(folder/(key+'.json')).write_text(json.dumps({'requestedUrl':job['url'],'observedOn':'2026-11-04','state':'captured_unreviewed','sha256':hashlib.sha256(data).hexdigest(),'reviewed':True,'usedInAdmissions':True}))
   with patch.object(module.subprocess,'run',side_effect=AssertionError('Unexpected network request')):
    result=module.collect(job,folder,'2026-11-04',5,{})
   self.assertTrue(result['reusedCapture']);self.assertFalse(result['reviewed']);self.assertFalse(result['usedInAdmissions']);self.assertEqual(result['programmeIds'],job['programmeIds'])

if __name__=='__main__':unittest.main()
