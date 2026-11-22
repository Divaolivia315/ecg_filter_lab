import time, json
t0=time.time()
from app import dataset
print('dataset dir', dataset.config.DATASET_DIR)
print('clean', dataset.clean_reference_available())
print('records', dataset.list_records())
print('noises', dataset.list_noise_records())
idx = dataset.build_dataset_index(force=True)
print('index built in', round(time.time()-t0,2), 's')
for r in ['118e06','118e24','119e00']:
    m=dataset.record_metadata(r, idx)
    print(r, m['nominal_snr_db'], m['channels'], 'ref', m['has_reference'], 'segments MLII', m['noise_segments'].get('MLII')[:3], 'rec', m['recommended'])
print('noise', dataset.noise_metadata('em', idx)['summary'])
