import { useEffect } from 'react';
import { Loader2, TriangleAlert } from 'lucide-react';
import { useStore } from '@/store/store';
import { useRoute } from '@/lib/hooks';
import { Shell } from '@/components/Shell';
import { Toaster } from '@/components/ui';
import { AiAssistant } from '@/components/AiAssistant';
import { PackageDrawer } from '@/components/PackageDrawer';
import Dashboard from '@/pages/Dashboard';
import Schedule from '@/pages/Schedule';
import Exceptions from '@/pages/Exceptions';
import Alerts from '@/pages/Alerts';
import Evidence from '@/pages/Evidence';
import DataQuality from '@/pages/DataQuality';
import Accuracy from '@/pages/Accuracy';
import Audit from '@/pages/Audit';
import Settings from '@/pages/Settings';
import Ingest from '@/pages/Ingest';

const PAGES = { dashboard: Dashboard, schedule: Schedule, exceptions: Exceptions, alerts: Alerts, evidence: Evidence, quality: DataQuality, accuracy: Accuracy, audit: Audit, settings: Settings, ingest: Ingest };

export default function App() {
  const { booted, bootError, boot } = useStore();
  const [route] = useRoute();
  useEffect(() => { boot(); }, [boot]);
  const Page = PAGES[route];
  return (
    <>
      <Shell>
        {!booted ? (
          <div className="grid gap-4" aria-busy="true">
            <div className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--muted)' }}><Loader2 size={16} className="animate-spin" />Importing Sample_Project_Doc.xlsm…</div>
            <div className="skeleton h-28" /><div className="grid grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div><div className="skeleton h-72" />
          </div>
        ) : bootError ? (
          <div className="card p-6 flex gap-3"><TriangleAlert style={{ color: 'var(--over)' }} /><div><b>The sample workbook could not be imported.</b><p className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>{bootError}</p><button className="btn mt-3" onClick={() => boot()}>Retry</button></div></div>
        ) : <div key={route} className="page"><Page /></div>}
      </Shell>
      <PackageDrawer />
      <Toaster />
      <AiAssistant />
    </>
  );
}
