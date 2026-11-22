import wfdb, numpy as np, os
ds = r'C:\Users\EKG\website\mit-bih-noise-stress-test-database-1.0.0'
clean = r'C:\Users\USER\ecg-filter-lab\data\clean-reference'
c = wfdb.rdrecord(os.path.join(clean,'118')).p_signal[:,0]
n = wfdb.rdrecord(os.path.join(ds,'118e24')).p_signal[:,0]
d = n - c + 5.12
for sec in range(240,960,10):
    x=d[sec*360:(sec+10)*360]
    print(sec, round(float(np.sqrt(np.mean(x*x))),4), end=' | ')
print()
for sec in [300, 400, 500, 600, 700, 800]:
    print(sec, d[sec*360:sec*360+10])
