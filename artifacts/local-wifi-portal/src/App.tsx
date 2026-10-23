import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Inbox,
  ListChecks,
  Loader2,
  LockKeyhole,
  Menu,
  Network,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Wifi,
  X,
  XCircle,
} from 'lucide-react';
import {
  getGetAdminSettingsQueryKey,
  getGetAdminSummaryQueryKey,
  getGetHotspotStatusQueryKey,
  getGetPortalConfigQueryKey,
  getListAccessRequestsQueryKey,
  useCreateAccessRequest,
  useDecideAccessRequest,
  useEraseAccessRequest,
  useGetAdminSettings,
  useGetAdminSummary,
  useGetHotspotStatus,
  useGetPortalConfig,
  useListAccessRequests,
  useUpdateAdminSettings,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();

type Notice = { tone: 'success' | 'error' | 'info'; text: string };
type RequestFilter = 'all' | 'pending' | 'approved' | 'denied' | 'expired';

function cn(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function LocalOnlyNotice() {
  return (
    <main className="cyber min-h-screen grid place-items-center bg-[#070a10] px-6 text-[#dbe9f5]">
      <section className="max-w-md rounded-3xl border border-[#d8e0e5] bg-white p-8 text-center shadow-[0_20px_60px_rgba(21,42,53,0.12)]">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[#fff0b8] text-[#152a35]">
          <LockKeyhole size={20} />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#73828c]">Local operator console</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">This page is for the host laptop.</h1>
        <p className="mt-3 text-sm leading-6 text-[#687781]">
          Connect to localhost on the hotspot host to review requests and configure the portal.
        </p>
      </section>
    </main>
  );
}

function isLocalHost() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

function formatDate(value?: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function shortDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
    approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    denied: 'bg-red-50 text-red-700 border-red-200',
    expired: 'bg-slate-100 text-slate-600 border-slate-200',
    ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    needs_setup: 'bg-amber-100 text-amber-800 border-amber-200',
    offline: 'bg-red-50 text-red-700 border-red-200',
    unknown: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span data-testid={`status-${status}`} className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[.08em]', styles[status] ?? styles.unknown)}>
      <span className={cn('h-1.5 w-1.5 rounded-full bg-current', status === 'pending' && 'animate-[pulse-dot_1.8s_ease-in-out_infinite]')} />
      {status.replace('_', ' ')}
    </span>
  );
}

function NoticeBanner({ notice, onDismiss }: { notice: Notice; onDismiss?: () => void }) {
  const icon = notice.tone === 'success' ? <CheckCircle2 size={17} /> : notice.tone === 'error' ? <CircleAlert size={17} /> : <Activity size={17} />;
  return (
    <div data-testid="status-notice" className={cn(
      'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm',
      notice.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
      notice.tone === 'error' && 'border-red-200 bg-red-50 text-red-800',
      notice.tone === 'info' && 'border-cyan-200 bg-cyan-50 text-cyan-900',
    )}>
      <span className="mt-0.5">{icon}</span>
      <p className="flex-1 leading-6">{notice.text}</p>
      {onDismiss && <button data-testid="button-dismiss-notice" onClick={onDismiss} className="focus-ring rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Dismiss notification"><X size={16} /></button>}
    </div>
  );
}

function QueryError({ onRetry, label = 'This local service did not respond.' }: { onRetry: () => void; label?: string }) {
  return (
    <div data-testid="state-error" className="rounded-2xl border border-red-200 bg-red-50/70 p-8 text-center">
      <CircleAlert className="mx-auto mb-3 text-red-600" size={26} />
      <h3 className="font-bold text-slate-900">Could not load this view</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-600">{label}</p>
      <button data-testid="button-retry" onClick={onRetry} className="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700"><RefreshCw size={15} /> Try again</button>
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200/80', className)} />;
}

function AdminNav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const nav = [
    { href: '/admin', label: 'Overview', icon: Activity },
    { href: '/admin/requests', label: 'Access requests', icon: Inbox },
    { href: '/admin/devices', label: 'Connected devices', icon: Network },
    { href: '/admin/settings', label: 'Portal settings', icon: Settings2 },
  ];
  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-[#f3f6f8]/90 px-4 backdrop-blur md:hidden">
        <Link href="/admin" className="focus-ring flex items-center gap-2" data-testid="link-admin-mobile-logo">
          <Mark />
          <span className="text-sm font-extrabold tracking-tight text-slate-800">Windows Captive Portal</span>
        </Link>
        <button data-testid="button-open-mobile-nav" onClick={() => setOpen((value) => !value)} className="focus-ring rounded-lg p-2 text-slate-700 hover:bg-slate-200" aria-label="Open navigation"><Menu size={21} /></button>
      </header>
      {open && <button data-testid="button-close-mobile-nav-overlay" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-slate-950/20 md:hidden" aria-label="Close navigation" />}
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col border-r border-slate-700 bg-[#142832] px-4 py-5 text-slate-200 transition-transform duration-200 md:translate-x-0', open && 'translate-x-0')}>
        <div className="mb-10 flex items-center gap-3 px-3">
          <Mark />
          <div>
            <div className="text-sm font-extrabold tracking-tight text-white">Captive Portal</div>
            <div className="mono-label mt-0.5 text-slate-400">Operator console</div>
          </div>
        </div>
        <nav className="space-y-1" aria-label="Admin navigation">
          <div className="mono-label mb-3 px-3 text-slate-500">Workspace</div>
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === '/admin' ? location === '/admin' : location.startsWith(href);
            return (
              <Link key={href} href={href} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setOpen(false)} className={cn('focus-ring group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition', active ? 'bg-[#24414b] text-white' : 'text-slate-400 hover:bg-[#1c3741] hover:text-white')}>
                <Icon size={18} className={cn(active ? 'text-[#f5d36a]' : 'text-slate-500 group-hover:text-slate-300')} />
                {label}
                {label === 'Access requests' && <ChevronRight size={15} className="ml-auto opacity-40" />}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-2xl border border-slate-700 bg-[#1b3640] p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300"><LockKeyhole size={14} className="text-[#f5d36a]" /> Local only</div>
          <p className="mt-2 text-xs leading-5 text-slate-400">This console is available from the hotspot operator laptop.</p>
        </div>
      </aside>
    </>
  );
}

function Mark() {
  return <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#f5d36a] text-[#142832] shadow-[0_4px_0_hsl(43_60%_50%)]"><Wifi size={18} strokeWidth={2.8} /></div>;
}

function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="cyber app-shell noise-layer min-h-[100dvh] md:pl-64">
      <AdminNav />
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <div className="mono-label mb-3 text-[#14707a]">{eyebrow}</div>
        <h1 data-testid="heading-page" className="text-3xl font-extrabold tracking-[-.04em] text-slate-900 sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, detail, icon: Icon, tone = 'teal' }: { label: string; value: string | number; detail: string; icon: typeof Activity; tone?: 'teal' | 'yellow' | 'red' | 'slate' }) {
  return (
    <div data-testid={`stat-${label.toLowerCase().replaceAll(' ', '-')}`} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_hsl(211_30%_20%/.05)]">
      <div className={cn('mb-7 grid h-9 w-9 place-items-center rounded-xl', tone === 'teal' && 'bg-cyan-50 text-[#14707a]', tone === 'yellow' && 'bg-amber-50 text-amber-700', tone === 'red' && 'bg-red-50 text-red-600', tone === 'slate' && 'bg-slate-100 text-slate-600')}><Icon size={17} /></div>
      <div className="text-3xl font-extrabold tracking-[-.05em] text-slate-900">{value}</div>
      <div className="mt-1 text-sm font-bold text-slate-700">{label}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
      <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-[#f5d36a]/10" />
    </div>
  );
}

function HotspotPanel({ compact = false }: { compact?: boolean }) {
  const status = useGetHotspotStatus({ query: { queryKey: getGetHotspotStatusQueryKey(), staleTime: 15_000 } });
  if (status.isLoading) return <div className="rounded-2xl border border-slate-200 bg-white p-5"><Skeleton className="h-5 w-44" /><Skeleton className="mt-4 h-16 w-full" /></div>;
  if (status.isError || !status.data) return <QueryError onRetry={() => status.refetch()} label="Hotspot readiness is temporarily unavailable." />;
  const hotspot = status.data;
  return (
    <section data-testid="panel-hotspot-status" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_hsl(211_30%_20%/.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mono-label text-slate-400">Windows hotspot</div>
          <h2 className="mt-2 text-lg font-extrabold tracking-tight text-slate-900">{hotspot.networkName || 'Unnamed network'}</h2>
        </div>
        <StatusBadge status={hotspot.state} />
      </div>
      {!compact && (
        <div className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-100 py-4 text-xs">
          <div><div className="text-slate-400">Provider</div><div className="mt-1 font-bold text-slate-700">{hotspot.provider || '—'}</div></div>
          <div><div className="text-slate-400">Hotspot address</div><div className="mt-1 font-mono font-bold text-slate-700">{hotspot.hotspotAddress || '—'}</div></div>
        </div>
      )}
      <div className={cn('mt-4 space-y-2', compact && 'mt-5')}>
        {(hotspot.checklist ?? []).map((item, index) => (
          <div data-testid={`checklist-item-${index}`} key={`${item.label}-${index}`} className="flex items-start gap-2.5 text-sm">
            {item.state === 'ready' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : item.state === 'action_required' ? <CircleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" /> : <Activity size={16} className="mt-0.5 shrink-0 text-slate-400" />}
            <div><div className="font-semibold text-slate-700">{item.label}</div><div className="mt-0.5 text-xs leading-5 text-slate-500">{item.detail}</div></div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><span className={cn('h-2 w-2 rounded-full', hotspot.state === 'ready' ? 'bg-emerald-500' : 'bg-amber-500')} /> Internet forwarding {hotspot.internetForwarding ? 'enabled' : 'disabled'}</div>
    </section>
  );
}

function AdminOverview() {
  const summary = useGetAdminSummary({ query: { queryKey: getGetAdminSummaryQueryKey(), staleTime: 15_000 } });
  if (summary.isLoading) return <AdminShell><div className="reveal"><Skeleton className="h-4 w-28" /><Skeleton className="mt-4 h-12 w-80" /><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-40" />)}</div></div></AdminShell>;
  if (summary.isError || !summary.data) return <AdminShell><QueryError onRetry={() => summary.refetch()} /></AdminShell>;
  const data = summary.data;
  return (
    <AdminShell>
      <div className="reveal">
        <PageHeading eyebrow="Operator console / overview" title="The network, at a glance." description="A quiet read on hotspot readiness and the access requests waiting for your decision." action={<button data-testid="button-refresh-overview" onClick={() => summary.refetch()} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"><RefreshCw size={15} /> Refresh</button>} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Pending requests" value={data.pendingCount} detail="Need an operator decision" icon={Inbox} tone="yellow" />
          <StatCard label="Approved today" value={data.approvedToday} detail="Access granted since midnight" icon={CheckCircle2} tone="teal" />
          <StatCard label="Stored requests" value={data.totalStored} detail={`${data.expiredCount} expired in retention`} icon={Database} tone="slate" />
          <StatCard label="Retention window" value={`${data.retentionDays}d`} detail="Until records are removed" icon={Clock3} tone="red" />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_hsl(211_30%_20%/.05)]">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5">
              <div><div className="mono-label text-slate-400">Queue</div><h2 className="mt-1 text-lg font-extrabold text-slate-900">Requests need your attention</h2></div>
              <Link href="/admin/requests" data-testid="link-view-all-requests" className="focus-ring inline-flex items-center gap-1 text-sm font-bold text-[#14707a] hover:text-[#0e535b]">View all <ArrowRight size={15} /></Link>
            </div>
            {data.pendingCount === 0 ? (
              <div data-testid="state-empty-pending" className="px-5 py-12 text-center"><CheckCircle2 className="mx-auto text-emerald-500" size={30} /><p className="mt-3 font-bold text-slate-800">Queue is clear</p><p className="mt-1 text-sm text-slate-500">New access requests will appear here.</p></div>
            ) : (
              <div className="flex items-center gap-4 px-5 py-6"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Inbox size={21} /></div><div><div className="font-bold text-slate-800">{data.pendingCount} request{data.pendingCount === 1 ? '' : 's'} waiting</div><div className="mt-1 text-sm text-slate-500">Review the queue before granting network access.</div></div><Link href="/admin/requests?status=pending" data-testid="link-review-pending" className="focus-ring ml-auto hidden rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-700 sm:block">Review</Link></div>
            )}
            <div className="grid border-t border-slate-100 sm:grid-cols-2">
              <div className="p-5"><div className="text-xs text-slate-400">Network name</div><div data-testid="text-overview-network-name" className="mt-1 font-bold text-slate-800">{data.networkName}</div></div>
              <div className="border-t border-slate-100 p-5 sm:border-l sm:border-t-0"><div className="text-xs text-slate-400">Last request</div><div data-testid="text-overview-last-request" className="mt-1 font-bold text-slate-800">{shortDate(data.lastRequestAt)}</div></div>
            </div>
          </section>
          <HotspotPanel />
        </div>
      </div>
    </AdminShell>
  );
}

function RequestTable() {
  const [filter, setFilter] = useState<RequestFilter>('all');
  const [search, setSearch] = useState('');
  const params = filter === 'all' ? undefined : { status: filter };
  const requests = useListAccessRequests(params, { query: { queryKey: getListAccessRequestsQueryKey(params), staleTime: 10_000 } });
  const decide = useDecideAccessRequest();
  const erase = useEraseAccessRequest();
  const client = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (requests.data ?? []).filter((request) => !term || [request.displayName, request.contact, request.requestId, request.ipAddress].some((value) => value?.toLowerCase().includes(term)));
  }, [requests.data, search]);

  const refresh = () => requests.refetch();
  const decision = (requestId: string, value: 'approved' | 'denied') => {
    if (!window.confirm(`${value === 'approved' ? 'Approve' : 'Deny'} this access request?`)) return;
    decide.mutate({ requestId, data: { decision: value } }, {
      onSuccess: () => {
        setNotice({ tone: 'success', text: `Request ${value === 'approved' ? 'approved' : 'denied'} successfully.` });
        client.invalidateQueries({ queryKey: getListAccessRequestsQueryKey(params) });
        client.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
      },
      onError: () => setNotice({ tone: 'error', text: 'The request could not be updated. Try again.' }),
    });
  };
  const eraseRow = (requestId: string) => {
    if (!window.confirm('Erase this request permanently? This cannot be undone.')) return;
    erase.mutate({ requestId }, {
      onSuccess: () => {
        setNotice({ tone: 'success', text: 'Request erased from local storage.' });
        client.invalidateQueries({ queryKey: getListAccessRequestsQueryKey(params) });
        client.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
      },
      onError: () => setNotice({ tone: 'error', text: 'The request could not be erased. Try again.' }),
    });
  };
  return (
    <AdminShell>
      <PageHeading eyebrow="Operator console / requests" title="Access requests" description="Review the local request log. Approval is explicit; erasure is permanent." action={<button data-testid="button-refresh-requests" onClick={refresh} className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"><RefreshCw size={15} /> Refresh</button>} />
      {notice && <div className="mb-5"><NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /></div>}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_hsl(211_30%_20%/.05)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input data-testid="input-search-requests" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, contact, request ID, or IP" className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#14707a] focus:bg-white" /></div>
          <div className="flex items-center gap-2 overflow-x-auto"><Filter size={16} className="shrink-0 text-slate-400" />{(['all', 'pending', 'approved', 'denied', 'expired'] as RequestFilter[]).map((value) => <button key={value} data-testid={`button-filter-${value}`} onClick={() => setFilter(value)} className={cn('focus-ring whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold capitalize transition', filter === value ? 'bg-[#142832] text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800')}>{value}</button>)}</div>
        </div>
        {requests.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div> : requests.isError ? <div className="p-5"><QueryError onRetry={refresh} /></div> : filtered.length === 0 ? <div data-testid="state-empty-requests" className="px-5 py-16 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Inbox size={22} /></div><h3 className="mt-4 font-extrabold text-slate-800">{search ? 'No matching requests' : 'No stored requests'}</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">{search ? 'Try a different name, contact, or request ID.' : 'Requests submitted through the portal will appear in this log.'}</p></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[.08em] text-slate-400"><tr><th className="px-5 py-3 font-bold">Guest</th><th className="px-4 py-3 font-bold">Status</th><th className="px-4 py-3 font-bold">Submitted</th><th className="px-4 py-3 font-bold">Expires</th><th className="px-4 py-3 font-bold">Source</th><th className="px-5 py-3 text-right font-bold">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((request) => (
                  <tr data-testid={`row-request-${request.requestId}`} key={request.requestId} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-4"><div className="font-bold text-slate-800">{request.displayName}</div><div className="mt-1 font-mono text-[11px] text-slate-400">{request.requestId}</div><div className="mt-1 text-xs text-slate-500">{request.contact || 'No contact supplied'}</div></td>
                    <td className="px-4 py-4"><StatusBadge status={request.status} /></td>
                    <td className="px-4 py-4 text-slate-600">{shortDate(request.submittedAt)}</td>
                    <td className="px-4 py-4 text-slate-600">{shortDate(request.expiresAt)}</td>
                    <td className="px-4 py-4"><div className="font-mono text-xs text-slate-600">{request.ipAddress}</div><div className="mt-1 max-w-[170px] truncate text-[11px] text-slate-400" title={request.userAgent}>{request.userAgent}</div></td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-2">{request.status === 'pending' && <><button data-testid={`button-approve-${request.requestId}`} disabled={decide.isPending} onClick={() => decision(request.requestId, 'approved')} className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-[#14707a] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#0e535b] disabled:opacity-50"><Check size={14} /> Approve</button><button data-testid={`button-deny-${request.requestId}`} disabled={decide.isPending} onClick={() => decision(request.requestId, 'denied')} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><X size={14} /> Deny</button></>}<button data-testid={`button-erase-${request.requestId}`} disabled={erase.isPending} onClick={() => eraseRow(request.requestId)} className="focus-ring rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50" aria-label={`Erase request ${request.requestId}`}><Trash2 size={15} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function SettingsPage() {
  const settings = useGetAdminSettings({ query: { queryKey: getGetAdminSettingsQueryKey(), staleTime: 30_000 } });
  const update = useUpdateAdminSettings();
  const client = useQueryClient();
  const [form, setForm] = useState({ networkName: '', portalTitle: '', portalMessage: '', privacyNotice: '', policyVersion: '', retentionDays: 30, hotspotAddress: '', internetForwarding: false });
  const initialized = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (settings.data && !initialized.current) {
      initialized.current = true;
      setForm({ ...settings.data });
    }
  }, [settings.data]);
  if (settings.isLoading) return <AdminShell><Skeleton className="h-5 w-40" /><Skeleton className="mt-4 h-12 w-96" /><Skeleton className="mt-8 h-[520px] w-full" /></AdminShell>;
  if (settings.isError || !settings.data) return <AdminShell><QueryError onRetry={() => settings.refetch()} /></AdminShell>;
  const setField = (field: keyof typeof form, value: string | number | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ data: { ...form, retentionDays: Number(form.retentionDays) } }, {
      onSuccess: (next) => {
        setForm({ ...next });
        setNotice({ tone: 'success', text: 'Settings saved. New portal visits will use this copy.' });
        client.setQueryData(getGetAdminSettingsQueryKey(), next);
        client.invalidateQueries({ queryKey: getGetPortalConfigQueryKey() });
      },
      onError: () => setNotice({ tone: 'error', text: 'Settings could not be saved. Check the fields and try again.' }),
    });
  };
  const field = (label: string, key: keyof typeof form, help: string, type: 'text' | 'number' = 'text') => <label className="block"><span className="text-sm font-bold text-slate-700">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{help}</span><input data-testid={`input-settings-${String(key)}`} type={type} value={String(form[key])} onChange={(event) => setField(key, type === 'number' ? Number(event.target.value) : event.target.value)} className="focus-ring mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-[#14707a] focus:bg-white" /></label>;
  return (
    <AdminShell>
      <PageHeading eyebrow="Operator console / settings" title="Portal settings" description="Shape what guests see, then keep the local network boundaries explicit." />
      {notice && <div className="mb-5"><NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /></div>}
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_hsl(211_30%_20%/.05)] sm:p-7">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-50 text-[#14707a]"><FileText size={17} /></div><div><h2 className="font-extrabold text-slate-900">Guest-facing copy</h2><p className="mt-1 text-sm text-slate-500">Keep the request flow recognizable and honest.</p></div></div>
            <div className="mt-6 grid gap-5">{field('Network name', 'networkName', 'The name guests should see when they join the hotspot.')}{field('Portal title', 'portalTitle', 'A short heading for the captive portal.')}{<label className="block"><span className="text-sm font-bold text-slate-700">Portal message</span><span className="mt-1 block text-xs leading-5 text-slate-500">Explain what access is for and what happens after submission.</span><textarea data-testid="input-settings-portalMessage" value={form.portalMessage} onChange={(event) => setField('portalMessage', event.target.value)} rows={4} className="focus-ring mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-[#14707a] focus:bg-white" /> </label>}{<label className="block"><span className="text-sm font-bold text-slate-700">Privacy notice</span><span className="mt-1 block text-xs leading-5 text-slate-500">Tell guests what request data is retained and why.</span><textarea data-testid="input-settings-privacyNotice" value={form.privacyNotice} onChange={(event) => setField('privacyNotice', event.target.value)} rows={5} className="focus-ring mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-[#14707a] focus:bg-white" /> </label>}</div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_hsl(211_30%_20%/.05)] sm:p-7">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-5"><div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700"><SlidersHorizontal size={17} /></div><div><h2 className="font-extrabold text-slate-900">Storage & network</h2><p className="mt-1 text-sm text-slate-500">Controls for this laptop’s local service.</p></div></div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">{field('Policy version', 'policyVersion', 'Shown in the guest consent and stored with each request.')}{field('Retention days', 'retentionDays', 'Requests older than this are eligible for cleanup.', 'number')}{field('Hotspot address', 'hotspotAddress', 'Local address guests use to reach the portal.')}{<div data-testid="settings-internet-forwarding-disabled" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:col-span-2"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-700" /><span><span className="block text-sm font-bold text-emerald-900">Internet forwarding is permanently disabled</span><span className="mt-1 block text-xs leading-5 text-emerald-800">This application cannot enable internet forwarding. Configure MyPublicWiFi without an internet-sharing source.</span></span></div>}</div>
          </section>
          <div className="flex justify-end"><button data-testid="button-save-settings" type="submit" disabled={update.isPending} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-[#14707a] px-5 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_#0e535b] transition hover:bg-[#0e535b] disabled:cursor-wait disabled:opacity-60">{update.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save settings</button></div>
        </div>
        <div className="space-y-6"><HotspotPanel compact /><div className="rounded-2xl border border-slate-200 bg-[#142832] p-5 text-slate-200"><div className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17} className="text-[#f5d36a]" /> Safety by default</div><p className="mt-3 text-sm leading-6 text-slate-400">The portal only records what the access workflow needs. Keep policy versions specific so consent remains auditable.</p></div></div>
      </form>
    </AdminShell>
  );
}

type DeviceProfile = {
  screenWidth: number | null;
  screenHeight: number | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  pixelRatio: number | null;
  colorDepth: number | null;
  language: string | null;
  languages: string | null;
  platform: string | null;
  timezone: string | null;
  timezoneOffsetMinutes: number | null;
  hardwareConcurrency: number | null;
  deviceMemoryGb: number | null;
  maxTouchPoints: number | null;
  cookieEnabled: boolean | null;
  connectionType: string | null;
  openedAt: string | null;
};

// Device details the browser reports about itself. No active fingerprinting
// (no canvas/WebGL/font probing) — only the standard, disclosed profile.
function collectDeviceProfile(openedAt: string | null): DeviceProfile {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string };
  };
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timezone = null;
  }
  return {
    screenWidth: window.screen?.width ?? null,
    screenHeight: window.screen?.height ?? null,
    viewportWidth: window.innerWidth ?? null,
    viewportHeight: window.innerHeight ?? null,
    pixelRatio: window.devicePixelRatio ?? null,
    colorDepth: window.screen?.colorDepth ?? null,
    language: nav.language ?? null,
    languages: (nav.languages ?? []).join(', ') || null,
    platform: nav.platform ?? null,
    timezone,
    timezoneOffsetMinutes: new Date().getTimezoneOffset(),
    hardwareConcurrency: nav.hardwareConcurrency ?? null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    maxTouchPoints: nav.maxTouchPoints ?? null,
    cookieEnabled: nav.cookieEnabled ?? null,
    connectionType: nav.connection?.effectiveType ?? null,
    openedAt,
  };
}

function GuestPortal() {
  const config = useGetPortalConfig({ query: { queryKey: getGetPortalConfigQueryKey(), staleTime: 30_000 } });
  const create = useCreateAccessRequest();
  const [openedAt] = useState(() => new Date().toISOString());
  const [form, setForm] = useState({ displayName: '', contact: '', purposeAccepted: false, privacyAccepted: false });
  const [result, setResult] = useState<Awaited<ReturnType<typeof import('@workspace/api-client-react').createAccessRequest>> | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  if (config.isLoading) return <div className="cyber grid min-h-[100dvh] place-items-center bg-[#070a10] p-6"><div className="w-full max-w-md space-y-3"><Skeleton className="h-12 w-12 bg-slate-700" /><Skeleton className="h-10 w-3/4 bg-slate-700" /><Skeleton className="h-24 w-full bg-slate-700" /><Skeleton className="h-64 w-full bg-slate-700" /></div></div>;
  if (config.isError || !config.data) return <div className="cyber grid min-h-[100dvh] place-items-center bg-[#070a10] p-6"><div className="w-full max-w-md"><QueryError onRetry={() => config.refetch()} label="The guest portal configuration is unavailable on this hotspot." /></div></div>;
  const portal = config.data;
  const contactRequired = portal.requiredFields.includes('contact');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.purposeAccepted || !form.privacyAccepted) {
      setNotice({ tone: 'error', text: 'Please accept both statements before sending your request.' });
      return;
    }
    const payload = { displayName: form.displayName.trim(), contact: form.contact.trim() || null, purposeAccepted: form.purposeAccepted, privacyAccepted: form.privacyAccepted, policyVersion: portal.policyVersion, device: collectDeviceProfile(openedAt) };
    create.mutate({ data: payload }, {
      onSuccess: (response) => setResult(response),
      onError: () => setNotice({ tone: 'error', text: 'Your request could not be sent. Stay connected and try again.' }),
    });
  };
  if (result) return <div className="cyber min-h-[100dvh] bg-[#070a10] px-4 py-8 text-slate-100 sm:grid sm:place-items-center"><div className="w-full max-w-xl reveal"><div className="mb-8 flex items-center gap-3"><Mark /><span className="mono-label text-slate-400">Local access portal</span></div><div className="rounded-[28px] border border-slate-700 bg-[#1b3640] p-6 shadow-2xl sm:p-10"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400 text-[#142832]"><CheckCircle2 size={28} /></div><div className="mono-label mt-8 text-[#f5d36a]">Request received</div><h1 data-testid="heading-request-received" className="mt-2 text-3xl font-extrabold tracking-[-.04em] text-white">You’re in the queue.</h1><p className="mt-4 text-sm leading-7 text-slate-300">{result.message}</p><div className="mt-8 grid gap-4 border-y border-slate-700 py-5 sm:grid-cols-3"><div><div className="text-xs text-slate-500">Request ID</div><div data-testid="text-request-id" className="mt-1 break-all font-mono text-sm font-bold text-[#f5d36a]">{result.requestId}</div></div><div><div className="text-xs text-slate-500">Submitted</div><div data-testid="text-request-submitted" className="mt-1 text-sm font-bold text-slate-200">{formatDate(result.submittedAt)}</div></div><div><div className="text-xs text-slate-500">Current status</div><div className="mt-2"><StatusBadge status={result.status} /></div></div></div><p className="mt-6 text-xs leading-5 text-slate-400">Keep this page open. The hotspot operator will decide whether to grant access.</p></div><div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><LockKeyhole size={14} /> Your request stays on this local network.</div></div></div>;
  return (
    <div className="cyber min-h-[100dvh] bg-[#070a10] text-slate-100 lg:grid lg:grid-cols-[minmax(300px,38%)_1fr]">
      <aside className="relative overflow-hidden px-6 py-8 sm:px-10 lg:flex lg:min-h-[100dvh] lg:flex-col lg:justify-between lg:px-14 lg:py-12"><div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full border-[32px] border-[#f5d36a]/10" /><div className="relative"><div className="flex items-center gap-3"><Mark /><span className="mono-label text-slate-400">Local access portal</span></div><div className="mt-14 max-w-md lg:mt-24"><div className="mono-label text-[#f5d36a]">{portal.networkName}</div><h1 data-testid="heading-portal-title" className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-[-.06em] text-white sm:text-5xl">{portal.portalTitle}</h1><p data-testid="text-portal-message" className="mt-6 text-base leading-7 text-slate-300">{portal.portalMessage}</p></div></div><div className="relative mt-10 hidden max-w-sm items-center gap-3 border-t border-slate-700 pt-5 text-xs leading-5 text-slate-500 lg:flex"><ShieldCheck size={17} className="shrink-0 text-[#f5d36a]" /> This is a private network request. Your information is handled according to the notice shown on this page.</div></aside>
      <main className="bg-[#f3f6f8] px-4 py-8 text-slate-900 sm:px-8 lg:px-16 lg:py-14"><div className="mx-auto max-w-xl reveal"><div className="mb-8 flex items-center justify-between"><div><div className="mono-label text-[#14707a]">Request access</div><p className="mt-1 text-sm text-slate-500">A short form, reviewed by the host.</p></div><div className="flex items-center gap-2 text-xs font-bold text-slate-500"><span className="h-2 w-2 animate-[pulse-dot_1.8s_ease-in-out_infinite] rounded-full bg-emerald-500" /> Hotspot connected</div></div>{notice && <div className="mb-5"><NoticeBanner notice={notice} onDismiss={() => setNotice(null)} /></div>}<form onSubmit={submit} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_16px_50px_hsl(211_30%_20%/.08)] sm:p-8"><div className="flex items-start gap-3 border-b border-slate-100 pb-6"><div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-50 text-[#14707a]"><Network size={19} /></div><div><h2 className="font-extrabold text-slate-900">Tell the host who you are</h2><p className="mt-1 text-sm leading-5 text-slate-500">Only the details below are shared with the operator.</p></div></div><div className="mt-7 space-y-5"><label className="block"><span className="text-sm font-bold text-slate-700">Name <span className="text-[#14707a]">*</span></span><input data-testid="input-display-name" required maxLength={80} value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="How should the host recognize you?" className="focus-ring mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#14707a] focus:bg-white" /></label><label className="block"><span className="text-sm font-bold text-slate-700">Contact <span className="font-normal text-slate-400">{contactRequired ? 'required' : 'optional'}</span></span><input data-testid="input-contact" required={contactRequired} maxLength={160} value={form.contact} onChange={(event) => setForm((current) => ({ ...current, contact: event.target.value }))} placeholder={contactRequired ? 'Required by the host policy' : 'Email or phone, if you want a response'} className="focus-ring mt-2 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#14707a] focus:bg-white" /></label><div className="space-y-3 rounded-xl bg-slate-50 p-4"><label className="flex items-start gap-3"><input data-testid="input-purpose-accepted" required type="checkbox" checked={form.purposeAccepted} onChange={(event) => setForm((current) => ({ ...current, purposeAccepted: event.target.checked }))} className="mt-1 h-4 w-4 accent-[#14707a]" /><span className="text-sm leading-6 text-slate-600">I’m requesting access for the purpose described by the host.</span></label><label className="flex items-start gap-3"><input data-testid="input-privacy-accepted" required type="checkbox" checked={form.privacyAccepted} onChange={(event) => setForm((current) => ({ ...current, privacyAccepted: event.target.checked }))} className="mt-1 h-4 w-4 accent-[#14707a]" /><span className="text-sm leading-6 text-slate-600">I understand how this request is handled and agree to the privacy notice.</span></label></div><div data-testid="text-privacy-notice" className="rounded-xl border border-slate-200 px-4 py-3 text-xs leading-5 text-slate-500">{portal.privacyNotice}</div></div><button data-testid="button-submit-access-request" type="submit" disabled={create.isPending} className="focus-ring mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#14707a] text-sm font-extrabold text-white shadow-[0_4px_0_#0e535b] transition hover:bg-[#0e535b] disabled:cursor-wait disabled:opacity-60">{create.isPending ? <><Loader2 size={17} className="animate-spin" /> Sending request</> : <>Send request <ArrowRight size={17} /></>}</button><p className="mt-4 text-center text-xs text-slate-400">Policy version {portal.policyVersion}</p></form><div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-400"><LockKeyhole size={13} /> Local network only <span className="text-slate-300">·</span> No account needed</div></div></main>
    </div>
  );
}

type DeviceSession = {
  connectedAt: string | null;
  disconnectedAt: string | null;
  minutes: number;
  bytesDownload: number;
  bytesUpload: number;
};

type DeviceSubmission = {
  requestId: string;
  displayName: string;
  contact: string | null;
  status: string;
  submittedAt: string;
  ipAddress: string;
  userAgent: string;
  macAddress: string | null;
  deviceHostname: string | null;
  deviceVendor: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  screen: string | null;
  viewport: string | null;
  language: string | null;
  timezone: string | null;
  platform: string | null;
  hardware: string | null;
  touchPoints: number | null;
  connectionType: string | null;
  acceptLanguage: string | null;
  referer: string | null;
  timeOnFormMs: number | null;
};

type DeviceRecord = {
  mac: string;
  hostNames: string[];
  ipAddresses: string[];
  firstSeen: string | null;
  lastSeen: string | null;
  sessionCount: number;
  totalMinutes: number;
  totalBytesDownload: number;
  totalBytesUpload: number;
  sessions: DeviceSession[];
  submissions: DeviceSubmission[];
  hidden: boolean;
};

type DevicesResponse = {
  available: boolean;
  root: string;
  connectedDeviceCount: number;
  identifiedDeviceCount: number;
  hiddenCount: number;
  devices: DeviceRecord[];
};

type UrlEntry = {
  at: string | null;
  hostName: string | null;
  target: string;
  port: number | null;
  kind: 'dns' | 'http' | 'other';
};

function formatBytes(value: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit > 0 && size < 10 ? 1 : 0)} ${units[unit]}`;
}

function formatDuration(minutes: number) {
  if (!minutes) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatMillis(ms: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)} min`;
}

function DeviceDetail({ device, onHide, onRestore, hiding }: { device: DeviceRecord; onHide: (mac: string) => void; onRestore: (mac: string) => void; hiding: boolean }) {
  const urls = useQuery<{ mac: string; entries: UrlEntry[] }>({
    queryKey: ['admin', 'device-urls', device.mac],
    queryFn: async () => {
      const response = await fetch(`/api/admin/devices/${encodeURIComponent(device.mac)}/urls?limit=300`);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return (await response.json()) as { mac: string; entries: UrlEntry[] };
    },
    staleTime: 30_000,
  });
  const [showAllUrls, setShowAllUrls] = useState(false);
  const entries = urls.data?.entries ?? [];
  const preview = entries.slice(0, 7);
  const remaining = entries.length - preview.length;

  return (
    <>
    <section data-testid="panel-device-detail" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_hsl(211_30%_20%/.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mono-label text-slate-400">Device detail</div>
          <h2 className="mt-2 flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900">
            {device.hostNames[0] || 'Unknown device'}
            {device.hidden && <span data-testid="badge-device-hidden" className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-amber-700">Hidden</span>}
          </h2>
          <div className="mt-1 font-mono text-[11px] text-slate-400">{device.mac}</div>
        </div>
        {device.hidden ? (
          <button
            type="button"
            onClick={() => onRestore(device.mac)}
            disabled={hiding}
            data-testid="button-restore-device"
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
            title="Show this device in the list again"
          >
            <Undo2 size={14} /> {hiding ? 'Restoring' : 'Restore'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onHide(device.mac)}
            disabled={hiding}
            data-testid="button-hide-device"
            className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-bold text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
            title="Hide this device from the list (you can restore it later)"
          >
            <EyeOff size={14} /> {hiding ? 'Hiding' : 'Hide'}
          </button>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-slate-100 py-4 text-xs">
        <div><dt className="text-slate-400">IP addresses</dt><dd className="mt-1 font-mono font-bold text-slate-700">{device.ipAddresses.join(', ') || '—'}</dd></div>
        <div><dt className="text-slate-400">Total time</dt><dd className="mt-1 font-bold text-slate-700">{formatDuration(device.totalMinutes)}</dd></div>
        <div><dt className="text-slate-400">First seen</dt><dd className="mt-1 font-bold text-slate-700">{formatDate(device.firstSeen)}</dd></div>
        <div><dt className="text-slate-400">Last seen</dt><dd className="mt-1 font-bold text-slate-700">{formatDate(device.lastSeen)}</dd></div>
        <div><dt className="text-slate-400">Downloaded</dt><dd className="mt-1 font-bold text-slate-700">{formatBytes(device.totalBytesDownload)}</dd></div>
        <div><dt className="text-slate-400">Uploaded</dt><dd className="mt-1 font-bold text-slate-700">{formatBytes(device.totalBytesUpload)}</dd></div>
      </dl>

      <div className="mt-5">
        <div className="mono-label text-slate-400">Form submissions</div>
        {device.submissions.length === 0 ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">This device joined the network but never submitted the form.</p>
        ) : (
          device.submissions.map((submission) => (
            <div key={submission.requestId} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold text-slate-800">{submission.displayName}</span><StatusBadge status={submission.status} /></div>
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                <div>Contact: {submission.contact || '—'}</div>
                <div>Submitted: {formatDate(submission.submittedAt)} · time on form {formatMillis(submission.timeOnFormMs)}</div>
                <div className="font-mono">From IP: {submission.ipAddress}</div>
                <div className="font-mono">MAC: {submission.macAddress || '—'}</div>
                <div>Device: {[submission.deviceVendor, submission.deviceHostname].filter(Boolean).join(' / ') || '—'}</div>
                <div>OS: {submission.os || '—'} · {submission.deviceType || 'unknown type'}</div>
                <div>Browser: {submission.browser || '—'}</div>
                <div>Screen: {submission.screen || '—'} · viewport {submission.viewport || '—'}</div>
                <div>Language: {submission.language || '—'} · {submission.timezone || '—'}</div>
                <div>Hardware: {submission.hardware || '—'}{submission.touchPoints ? ` · ${submission.touchPoints} touch points` : ''}</div>
                <div>Network: {submission.connectionType || '—'}{submission.acceptLanguage ? ` · ${submission.acceptLanguage}` : ''}</div>
                <div className="break-all">User agent: {submission.userAgent}</div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5">
        <div className="mono-label text-slate-400">Connection history</div>
        <div className="mt-2 space-y-2">
          {device.sessions.length === 0 && <p className="text-sm text-slate-500">No session records.</p>}
          {device.sessions.map((session, index) => (
            <div key={`${session.connectedAt}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-xs">
              <span className="text-slate-600">{shortDate(session.connectedAt)} → {session.disconnectedAt ? shortDate(session.disconnectedAt) : 'still connected'}</span>
              <span className="font-bold text-slate-700">{formatDuration(session.minutes)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="mono-label text-slate-400">Browsing log</div>
          <span className="rounded-full border border-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-amber-700">Sensitive</span>
        </div>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">Recorded by MyPublicWiFi, shown because it is disclosed in the portal privacy notice.</p>
        {urls.isLoading ? (
          <p className="mt-2 text-sm text-slate-500">Loading…</p>
        ) : urls.isError ? (
          <p className="mt-2 text-sm text-slate-500">Could not read the URL log.</p>
        ) : entries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No entries recorded for this device.</p>
        ) : (
          <>
            <div className="mt-2 space-y-1 rounded-lg border border-slate-100 p-2">
              {preview.map((entry, index) => (
                <div key={`${entry.at}-${index}`} className="flex items-baseline justify-between gap-3 rounded px-1.5 py-1 text-[11px] hover:bg-slate-50">
                  <span className="truncate font-mono text-slate-600" title={entry.target}>{entry.target}</span>
                  <span className="shrink-0 text-slate-400">{entry.kind === 'dns' ? 'DNS' : (entry.port ?? '')} · {shortDate(entry.at)}</span>
                </div>
              ))}
            </div>
            {remaining > 0 && (
              <button
                type="button"
                onClick={() => setShowAllUrls(true)}
                data-testid="button-read-more-urls"
                className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <ListChecks size={14} /> Read more ({remaining})
              </button>
            )}
          </>
        )}
      </div>
    </section>

    <Dialog open={showAllUrls} onOpenChange={setShowAllUrls}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Browsing log</DialogTitle>
          <DialogDescription>
            {device.hostNames[0] || device.mac} · {entries.length} entries recorded by MyPublicWiFi.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
          {entries.map((entry, index) => (
            <div key={`all-${entry.at}-${index}`} className="flex items-baseline justify-between gap-3 rounded px-1.5 py-1 text-[11px] hover:bg-slate-50">
              <span className="truncate font-mono text-slate-600" title={entry.target}>{entry.target}</span>
              <span className="shrink-0 text-slate-400">{entry.kind === 'dns' ? 'DNS' : (entry.port ?? '')} · {shortDate(entry.at)}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

function DevicesPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [hiding, setHiding] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const devices = useQuery<DevicesResponse>({
    queryKey: ['admin', 'devices', showHidden],
    queryFn: async () => {
      const response = await fetch(`/api/admin/devices${showHidden ? '?includeHidden=true' : ''}`);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      return (await response.json()) as DevicesResponse;
    },
    refetchInterval: 15_000,
  });

  const togglePicked = (mac: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(mac)) next.delete(mac);
      else next.add(mac);
      return next;
    });
  };

  const setManyHidden = async (macs: string[], hidden: boolean) => {
    if (macs.length === 0) return;
    setHiding(macs.length === 1 ? macs[0] : 'bulk');
    try {
      await Promise.all(
        macs.map((mac) =>
          fetch(`/api/admin/devices/${encodeURIComponent(mac)}/${hidden ? 'hide' : 'unhide'}`, { method: 'POST' }),
        ),
      );
      setPicked(new Set<string>());
      setSelected(null);
      await devices.refetch();
    } finally {
      setHiding(null);
    }
  };

  const hide = (mac: string) => setManyHidden([mac], true);
  const restore = (mac: string) => setManyHidden([mac], false);

  if (devices.isLoading) {
    return (<AdminShell><Skeleton className="h-4 w-32" /><Skeleton className="mt-4 h-12 w-80" /><div className="mt-8 grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-36" />)}</div><Skeleton className="mt-6 h-[360px] w-full" /></AdminShell>);
  }
  if (devices.isError || !devices.data) {
    return <AdminShell><QueryError onRetry={() => devices.refetch()} label="Could not read the device log." /></AdminShell>;
  }

  const data = devices.data;
  const active = data.devices.find((device) => device.mac === selected) ?? null;
  const totalMinutes = data.devices.reduce((sum, device) => sum + device.totalMinutes, 0);

  return (
    <AdminShell>
      <PageHeading
        eyebrow="Operator console / devices"
        title="Connected devices"
        description="Every device that joined the hotspot, read from MyPublicWiFi, with whatever the guest submitted linked to it."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="button-toggle-select"
              onClick={() => {
                setSelectMode((value) => !value);
                setPicked(new Set<string>());
              }}
              className={cn(
                'focus-ring inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition',
                selectMode
                  ? 'border-slate-300 bg-slate-100 text-slate-800'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <ListChecks size={15} /> {selectMode ? 'Done' : 'Select'}
            </button>
            <button
              type="button"
              data-testid="button-toggle-hidden"
              onClick={() => setShowHidden((value) => !value)}
              disabled={data.hiddenCount === 0 && !showHidden}
              title="Hidden devices stay in the list but are dimmed"
              className={cn(
                'focus-ring inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                showHidden
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              {showHidden ? <Eye size={15} /> : <EyeOff size={15} />}
              {showHidden ? `Showing hidden (${data.hiddenCount})` : `Hidden (${data.hiddenCount})`}
            </button>
            <button
              type="button"
              data-testid="button-refresh-devices"
              onClick={() => devices.refetch()}
              disabled={devices.isFetching}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw size={15} className={devices.isFetching ? 'animate-spin' : ''} /> {devices.isFetching ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        }
      />

      {!data.available && (
        <div className="mb-5"><NoticeBanner notice={{ tone: 'info', text: `MyPublicWiFi data was not found at ${data.root}. Start MyPublicWiFi, or set MYPUBLICWIFI_ROOT.` }} /></div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Devices seen" value={data.connectedDeviceCount} detail="Recorded by the hotspot" icon={Database} tone="teal" />
        <StatCard label="Identified guests" value={data.identifiedDeviceCount} detail="Also submitted the form" icon={Inbox} tone="yellow" />
        <StatCard label="Total guest time" value={formatDuration(totalMinutes)} detail="Sum of all sessions" icon={Clock3} tone="slate" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_hsl(211_30%_20%/.05)]">
          {selectMode && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm">
              <span className="font-bold text-slate-700">{picked.size} selected</span>
              <button
                type="button"
                data-testid="button-bulk-hide"
                onClick={() => setManyHidden([...picked], true)}
                disabled={picked.size === 0 || hiding !== null}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
              >
                <EyeOff size={14} /> Hide selected
              </button>
              <button
                type="button"
                data-testid="button-bulk-restore"
                onClick={() => setManyHidden([...picked], false)}
                disabled={picked.size === 0 || hiding !== null}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
              >
                <Undo2 size={14} /> Restore selected
              </button>
              <button
                type="button"
                onClick={() => setPicked(new Set<string>())}
                disabled={picked.size === 0}
                className="focus-ring ml-auto rounded-lg px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          )}
          {data.devices.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">{data.hiddenCount > 0 ? <EyeOff size={22} /> : <Wifi size={22} />}</div>
              <h3 className="mt-4 font-extrabold text-slate-800">{data.hiddenCount > 0 ? 'All devices are hidden' : 'No devices recorded yet'}</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">
                {data.hiddenCount > 0
                  ? `Hidden is not deleted — ${data.hiddenCount} device${data.hiddenCount === 1 ? '' : 's'} ${data.hiddenCount === 1 ? 'is' : 'are'} still recorded and can be restored.`
                  : 'Devices appear here once they join the hotspot.'}
              </p>
              {data.hiddenCount > 0 && (
                <button
                  type="button"
                  data-testid="button-show-hidden-empty"
                  onClick={() => setShowHidden(true)}
                  className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-700 transition hover:bg-amber-100"
                >
                  <Eye size={15} /> Show {data.hiddenCount} hidden device{data.hiddenCount === 1 ? '' : 's'}
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-[.08em] text-slate-400">
                  <tr>
                    {selectMode && (
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label="Select all devices"
                          className="h-4 w-4 accent-[#14707a]"
                          checked={data.devices.length > 0 && data.devices.every((device) => picked.has(device.mac))}
                          onChange={(event) =>
                            setPicked(
                              event.target.checked
                                ? new Set(data.devices.map((device) => device.mac))
                                : new Set<string>(),
                            )
                          }
                        />
                      </th>
                    )}
                    <th className="px-5 py-3 font-bold">Device</th>
                    <th className="px-4 py-3 font-bold">Addresses</th>
                    <th className="px-4 py-3 font-bold">Sessions</th>
                    <th className="px-4 py-3 font-bold">Data</th>
                    <th className="px-4 py-3 font-bold">Last seen</th>
                    <th className="px-5 py-3 font-bold">Guest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.devices.map((device) => {
                    const isPicked = picked.has(device.mac);
                    return (
                      <tr
                        key={device.mac}
                        data-testid={`row-device-${device.mac}`}
                        onClick={() => (selectMode ? togglePicked(device.mac) : setSelected(device.mac))}
                        className={cn(
                          'cursor-pointer transition hover:bg-slate-50/70',
                          !selectMode && selected === device.mac && 'bg-slate-100',
                          isPicked && 'bg-slate-100',
                          device.hidden && 'opacity-60',
                        )}
                      >
                        {selectMode && (
                          <td className="px-3 py-4">
                            <input
                              type="checkbox"
                              aria-label={`Select ${device.hostNames[0] || device.mac}`}
                              className="h-4 w-4 accent-[#14707a]"
                              checked={isPicked}
                              onChange={() => togglePicked(device.mac)}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </td>
                        )}
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-800">{device.hostNames[0] || 'Unknown device'}</span>
                            {device.hidden && (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.08em] text-amber-700">Hidden</span>
                            )}
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-slate-400">{device.mac}</div>
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-slate-600">{device.ipAddresses.join(', ') || '—'}</td>
                        <td className="px-4 py-4 text-slate-700">{device.sessionCount}<span className="ml-2 text-xs text-slate-400">{formatDuration(device.totalMinutes)}</span></td>
                        <td className="px-4 py-4 text-xs"><div className="text-emerald-700">↓ {formatBytes(device.totalBytesDownload)}</div><div className="mt-1 text-sky-700">↑ {formatBytes(device.totalBytesUpload)}</div></td>
                        <td className="px-4 py-4 text-slate-600">{shortDate(device.lastSeen)}</td>
                        <td className="px-5 py-4">{device.submissions.length > 0 ? <StatusBadge status={device.submissions[0].status} /> : <span className="text-xs text-slate-400">No form</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="order-first lg:order-last lg:sticky lg:top-6 lg:self-start">
          {active ? <DeviceDetail device={active} onHide={hide} onRestore={restore} hiding={hiding === active.mac || hiding === 'bulk'} /> : (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-[0_8px_24px_hsl(211_30%_20%/.05)]"><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500"><Network size={19} /></div><p className="mt-3 text-sm leading-6 text-slate-500">Pick a device to see its addresses, session history and any form the guest submitted.</p></section>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}

function Router() {
  const [location] = useLocation();
  const adminRoute = location === '/admin' || location.startsWith('/admin/');
  if (adminRoute && !isLocalHost()) return <LocalOnlyNotice />;
  return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={GuestPortal} /><Route path="/admin" component={AdminOverview} /><Route path="/admin/requests" component={RequestTable} /><Route path="/admin/devices" component={DevicesPage} /><Route path="/admin/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;