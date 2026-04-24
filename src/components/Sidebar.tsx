import { Clock, Home, Star, Settings2, MessageCircle } from "lucide-react";
import type { MainView } from "../App";

type Props = {
  mainView: MainView;
  onSelectHome: () => void;
  onSelectHistory: () => void;
  onSelectFavorites: () => void;
  onSelectSettings: () => void;
};

export function Sidebar({
  mainView,
  onSelectHome,
  onSelectHistory,
  onSelectFavorites,
  onSelectSettings,
}: Props) {
  const homeActive = mainView === "landing" || mainView === "live";
  const historyActive = mainView === "history";
  const favoritesActive = mainView === "favorites";
  const settingsActive = mainView === "settings";

  const navBtn = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
      active
        ? "bg-gradient-to-r from-violet-50 to-indigo-50/80 text-violet-900 shadow-sm ring-1 ring-violet-200/70"
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
    }`;

  return (
    <aside className="flex h-full min-h-0 w-[256px] shrink-0 flex-col border-r border-slate-200/80 bg-white">
      <div className="border-b border-slate-100 px-5 py-6">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-violet-500 to-violet-700 text-white shadow-md shadow-violet-500/25">
            <MessageCircle className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="truncate text-base font-bold tracking-tight text-slate-900">利群翻译</p>
            <p className="truncate text-xs font-medium text-slate-400">Liquun Translate</p>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4" aria-label="主导航">
        <button type="button" onClick={onSelectHome} className={navBtn(homeActive)}>
          <Home className={`h-[18px] w-[18px] shrink-0 ${homeActive ? "text-violet-600" : "text-slate-500"}`} />
          首页
        </button>
        <button type="button" onClick={onSelectHistory} className={navBtn(historyActive)}>
          <Clock className={`h-[18px] w-[18px] shrink-0 ${historyActive ? "text-violet-600" : "text-slate-500"}`} />
          历史记录
        </button>
        <button type="button" onClick={onSelectFavorites} className={navBtn(favoritesActive)}>
          <Star className={`h-[18px] w-[18px] shrink-0 ${favoritesActive ? "text-violet-600" : "text-slate-500"}`} />
          收藏短语
        </button>
        <button type="button" onClick={onSelectSettings} className={navBtn(settingsActive)}>
          <Settings2
            className={`h-[18px] w-[18px] shrink-0 ${settingsActive ? "text-violet-600" : "text-slate-500"}`}
          />
          设置
        </button>
      </nav>
    </aside>
  );
}
