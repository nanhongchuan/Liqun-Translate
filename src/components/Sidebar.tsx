import { Clock, Home, Mic, Settings2, Star, MessageCircle } from "lucide-react";
import type { MainView } from "../App";

type Props = {
  mainView: MainView;
  onSelectHome: () => void;
  onSelectLive: () => void;
  onSelectHistory: () => void;
  onSelectFavorites: () => void;
  onSelectSettings: () => void;
};

export function Sidebar({
  mainView,
  onSelectHome,
  onSelectLive,
  onSelectHistory,
  onSelectFavorites,
  onSelectSettings,
}: Props) {
  const homeActive = mainView === "landing";
  const liveActive = mainView === "live";
  const historyActive = mainView === "history";
  const favoritesActive = mainView === "favorites";
  const settingsActive = mainView === "settings";

  const navBtn = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
      active
        ? "bg-gradient-to-r from-violet-500/20 to-indigo-500/15 text-violet-100 shadow-sm ring-1 ring-violet-400/35"
        : "text-slate-300 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r border-slate-800/80 bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="border-b border-white/5 px-5 py-6">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-violet-500 to-violet-700 text-white shadow-lg shadow-violet-900/40">
            <MessageCircle className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="truncate text-base font-bold tracking-tight text-white">利群翻译</p>
            <p className="truncate text-xs font-medium text-slate-500">Liqun Translate</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4" aria-label="主导航">
        <button type="button" onClick={onSelectHome} className={navBtn(homeActive)}>
          <Home className={`h-[18px] w-[18px] shrink-0 ${homeActive ? "text-violet-300" : "text-slate-400"}`} />
          开始
        </button>
        <button type="button" onClick={onSelectLive} className={navBtn(liveActive)}>
          <Mic className={`h-[18px] w-[18px] shrink-0 ${liveActive ? "text-violet-300" : "text-slate-400"}`} />
          会话
        </button>
        <button type="button" onClick={onSelectHistory} className={navBtn(historyActive)}>
          <Clock className={`h-[18px] w-[18px] shrink-0 ${historyActive ? "text-violet-300" : "text-slate-400"}`} />
          记录
        </button>
        <button type="button" onClick={onSelectFavorites} className={navBtn(favoritesActive)}>
          <Star className={`h-[18px] w-[18px] shrink-0 ${favoritesActive ? "text-violet-300" : "text-slate-400"}`} />
          收藏
        </button>
        <button type="button" onClick={onSelectSettings} className={navBtn(settingsActive)}>
          <Settings2
            className={`h-[18px] w-[18px] shrink-0 ${settingsActive ? "text-violet-300" : "text-slate-400"}`}
          />
          设置
        </button>
      </nav>
    </aside>
  );
}
