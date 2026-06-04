import MarketingNav from './MarketingNav';
import MarketingFooter from './MarketingFooter';

export default function MarketingLayout({ activePage, children }) {
  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden font-marketing">
      {/* Subtle ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-rivvra-500/[0.04] rounded-full blur-[130px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-emerald-400/[0.025] rounded-full blur-[100px]" />
        <div className="absolute top-1/3 left-0 w-[420px] h-[420px] bg-rivvra-400/[0.02] rounded-full blur-[110px]" />
      </div>

      <MarketingNav activePage={activePage} />
      <main className="relative z-10">{children}</main>
      <MarketingFooter />
    </div>
  );
}
