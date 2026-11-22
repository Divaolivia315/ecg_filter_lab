from fastapi.testclient import TestClient
from app.main import app
from app import dataset
dataset.build_dataset_index(force=True)
c=TestClient(app)
for path in ['/api/health','/api/dataset/summary']:
    r=c.get(path); print(path,r.status_code, str(r.json())[:300])
r=c.get('/api/dataset/records'); print('records',r.status_code,len(r.json())); print(r.json()[0]['record'], r.json()[0]['recommended'], r.json()[0]['noise_segments'].get('MLII')[:1])
r=c.get('/api/dataset/noises'); print('noises',r.status_code,[(x['record'],x['summary']) for x in r.json()])
r=c.get('/api/dataset/references'); print('refs',r.status_code,[(x['record'],x['duration_s']) for x in r.json()])
sel={'mode':'existing','record':'118e06','channel':'MLII','start':545,'duration':10}
r=c.post('/api/signal/preview',json=sel); print('preview',r.status_code, list(r.json().keys()) if r.status_code==200 else r.text[:500]); print('preview meta', r.json()['meta']['record'], r.json()['input_stats'], len(r.json()['annotations']))
fir={'family':'fir','filter_type':'bandpass','order':128,'cutoff_low':0.5,'cutoff_high':40,'window':'hamming'}
iir={'family':'iir','filter_type':'bandpass','order':4,'cutoff_low':0.5,'cutoff_high':40,'iir_method':'butterworth'}
r=c.post('/api/filters/response',json={'fir':fir,'iir':iir,'fs':360}); print('response',r.status_code, list(r.json().keys()) if r.status_code==200 else r.text[:500])
req={'selection':sel,'fir':fir,'iir':iir,'name':'API smoke test','save':True}
r=c.post('/api/compare',json=req); print('compare',r.status_code, r.text[:300] if r.status_code!=200 else 'ok'); res=r.json(); print('id',res.get('experiment_id'),'saved',res.get('saved'),'metrics',{k:(round(v['snr_db'],2) if v else None) for k,v in res['metrics'].items()}, 'decomp', res.get('decomposition'))
eid=res.get('experiment_id')
r=c.get('/api/experiments'); print('history',r.status_code,len(r.json()),r.json()[0] if r.json() else None)
r=c.get(f'/api/experiments/{eid}'); print('get exp',r.status_code,len(r.text))
for kind in ['summary','signals','spectrum','response']:
    r=c.get(f'/api/experiments/{eid}/{kind}.csv'); print(kind,r.status_code,len(r.content),r.headers.get('content-disposition'))
r=c.delete(f'/api/experiments/{eid}'); print('delete',r.status_code,r.json())
