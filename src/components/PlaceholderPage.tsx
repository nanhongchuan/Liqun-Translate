import { ArrowLeft } from "lucide-react";

type Props = {
  title: string;
  description?: string;
  onBack: () => void;
};

export function PlaceholderPage({ title, description, onBack }: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#fafbfc]">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200/90 bg-white px-5 py-4 md:px-8">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="max-w-sm text-center text-sm text-slate-500">
          {description ?? "该功能即将推出，敬请期待。"}
        </p>
      </div>
    </div>
  );
}
