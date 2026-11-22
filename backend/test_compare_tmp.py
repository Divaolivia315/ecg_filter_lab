from app.schemas import SignalSelection, FilterConfig, CompareRequest
from app.main import _build_comparison
sel=SignalSelection(mode='mix', clean_record='118', noise_record='em', channel='MLII', noise_channel=0, start=545, duration=10, target_snr_db=6, noise_start=550)
fir=FilterConfig(family='fir',filter_type='bandpass',order=128,cutoff_low=0.5,cutoff_high=40,window='hamming')
iir=FilterConfig(family='iir',filter_type='bandpass',order=4,cutoff_low=0.5,cutoff_high=40,iir_method='butterworth')
r=_build_comparison(CompareRequest(selection=sel,fir=fir,iir=iir,save=False))
print('metrics', {k: round(v['snr_db'],3) for k,v in r['metrics'].items()})
print('decomposition', r['decomposition'])
print('conclusions'); [print('-',c) for c in r['conclusions']]
