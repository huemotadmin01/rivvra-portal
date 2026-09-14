import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import '../../../styles/marketing.css';
import Nav from './Nav';
import Footer from './Footer';
import TalkToUs from './TalkToUs';

const TalkContext = createContext(() => {});
export const useTalkToUs = () => useContext(TalkContext);

/** Light marketing shell: nav, footer, and the Talk-to-us dialog shared by
 *  every public page. Scrolls to top on route change like a static site. */
export default function Shell({ children }) {
  const [talk, setTalk] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);
  const openTalk = useCallback(() => setTalk(true), []);
  const closeTalk = useCallback(() => setTalk(false), []);
  return (
    <TalkContext.Provider value={openTalk}>
      <div className="mk min-h-screen flex flex-col">
        <Nav onTalk={openTalk} />
        <main className="flex-1">{children}</main>
        <Footer />
        <TalkToUs open={talk} onClose={closeTalk} />
      </div>
    </TalkContext.Provider>
  );
}
