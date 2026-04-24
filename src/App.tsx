import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { LandingPage } from "./components/LandingPage";
import { LiveSessionPage } from "./components/LiveSessionPage";
import { SettingsPage } from "./components/SettingsPage";
import { PlaceholderPage } from "./components/PlaceholderPage";

export type MainView = "landing" | "live" | "settings" | "history" | "favorites";

const SIDEBAR_W = 256;

export default function App() {
  const [mainView, setMainView] = useState<MainView>("landing");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("zh");
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const handleSwapLangs = useCallback(() => {
    const s = sourceLang;
    setSourceLang(targetLang);
    setTargetLang(s);
  }, [sourceLang, targetLang]);

  const goHome = useCallback(() => {
    setMainView("landing");
  }, []);

  const startSession = useCallback(() => {
    setMainView("live");
  }, []);

  const stopSession = useCallback(() => {
    setMainView("landing");
  }, []);

  const goSettings = useCallback(() => {
    setMainView("settings");
  }, []);

  const goHistory = useCallback(() => {
    setMainView("history");
  }, []);

  const goFavorites = useCallback(() => {
    setMainView("favorites");
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarExpanded((v) => !v);
  }, []);

  const selectHome = useCallback(() => {
    if (mainView === "live") {
      const ok = window.confirm("结束当前同传并返回首页？");
      if (!ok) return;
    }
    goHome();
  }, [mainView, goHome]);

  return (
    <div className="relative flex h-full min-h-0 bg-slate-100 text-slate-800">
      <div
        className={`relative flex h-full min-h-0 shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${
          sidebarExpanded ? "w-[256px]" : "pointer-events-none w-0"
        }`}
        aria-hidden={!sidebarExpanded}
        {...(!sidebarExpanded ? { inert: true } : {})}
      >
        <Sidebar
          mainView={mainView}
          onSelectHome={selectHome}
          onSelectHistory={goHistory}
          onSelectFavorites={goFavorites}
          onSelectSettings={goSettings}
        />
      </div>

      <button
        type="button"
        onClick={toggleSidebar}
        aria-expanded={sidebarExpanded}
        aria-label={sidebarExpanded ? "收起侧栏" : "展开侧栏"}
        title={sidebarExpanded ? "收起侧栏" : "展开侧栏"}
        className={`absolute z-40 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-card transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-300 ${
          sidebarExpanded
            ? "top-[26px] -translate-x-1/2"
            : "left-3 top-[26px] translate-x-0"
        }`}
        style={sidebarExpanded ? { left: SIDEBAR_W } : undefined}
      >
        {sidebarExpanded ? (
          <ChevronLeft className="h-4 w-4" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4" aria-hidden />
        )}
      </button>

      <main
        className={`relative min-h-0 min-w-0 flex-1 overflow-hidden ${darkMode ? "bg-slate-950" : "bg-[#fafbfc]"}`}
      >
        {mainView === "settings" ? (
          <SettingsPage onBack={goHome} />
        ) : mainView === "history" ? (
          <PlaceholderPage title="历史记录" onBack={goHome} />
        ) : mainView === "favorites" ? (
          <PlaceholderPage title="收藏短语" onBack={goHome} />
        ) : mainView === "live" ? (
          <LiveSessionPage
            sourceLang={sourceLang}
            targetLang={targetLang}
            onSourceChange={setSourceLang}
            onTargetChange={setTargetLang}
            onStop={stopSession}
          />
        ) : (
          <LandingPage
            sourceLang={sourceLang}
            targetLang={targetLang}
            onSourceChange={setSourceLang}
            onTargetChange={setTargetLang}
            onSwapLangs={handleSwapLangs}
            onStart={startSession}
            darkMode={darkMode}
            onToggleDark={() => setDarkMode((d) => !d)}
          />
        )}
      </main>
    </div>
  );
}
