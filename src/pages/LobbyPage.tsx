import { ArrowUpRight, Info } from "lucide-react";
import type { Save, Tournament } from "../domain/storage/storage";

type LobbyPageProps = {
  tournament: Tournament | null;
  pausedTournament: Save["pausedTournament"];
  roundLabel: (round: number) => string;
  onNew: (mode: "cash" | "tournament") => void;
  onModeDetails: (mode: "cash" | "tournament") => void;
  onEnterChampionship: () => void;
};

export function LobbyPage({
  tournament,
  pausedTournament,
  roundLabel,
  onNew,
  onModeDetails,
  onEnterChampionship,
}: LobbyPageProps) {
  const visibleTournament = tournament || pausedTournament?.tournament;
  const isActiveTournament = visibleTournament && !visibleTournament.complete;

  return (
    <div className="lobby lobby-home">
      <div className="lobby-atmosphere" aria-hidden="true">
        <div className="lobby-table">
          <span className="lobby-table-inlay" />
          <span className="lobby-table-mark">摸鱼德州</span>
        </div>
        <div className="lobby-playing-cards">
          <div className="ambient-playing-card"><b>A</b><span>♣</span></div>
          <div className="ambient-playing-card red"><b>K</b><span>♦</span></div>
          <div className="ambient-playing-card"><b>Q</b><span>♠</span></div>
          <div className="ambient-playing-card red"><b>J</b><span>♥</span></div>
          <div className="ambient-playing-card"><b>10</b><span>♣</span></div>
        </div>
        <div className="ambient-card-back"><span>♠</span><i>摸鱼德州</i></div>
        <div className="lobby-chip-stack stack-left"><i /><i /><i /><i /><i /></div>
        <div className="lobby-chip-stack stack-right"><i /><i /><i /><i /><i /></div>
        <div className="ambient-loose-chip chip-gold">500</div>
        <div className="ambient-loose-chip chip-red">100</div>
      </div>
      <div className="lobby-save-note">
        <div>随时退出！随时关闭！实时保存！</div>
        <div>只保存本地，可下载存档，上传恢复</div>
      </div>
      <div className="mode-grid">
        <div className="mode-card-wrap">
          <button
            type="button"
            className="mode-card home-mode-card"
            onClick={() => onNew("cash")}
          >
            <div className="mode-title-row">
              <h3>单次赛</h3>
            </div>
            <p>开启一场独立牌局，与电脑选手对战。</p>
            <div className="mode-footer"><span>2–8 人牌桌 · 难度自选</span><ArrowUpRight size={20} /></div>
          </button>
          <button
            type="button"
            className="mode-details-button"
            aria-label="查看单次赛说明"
            title="查看单次赛说明"
            onClick={() => onModeDetails("cash")}
          >
            <Info size={15} />
          </button>
        </div>
        <div className="mode-card-wrap">
          <button
            type="button"
            className="mode-card competition home-mode-card"
            onClick={onEnterChampionship}
          >
            <div className="mode-title-row">
              <h3>冠军之路</h3>
            </div>
            <p>
              {isActiveTournament
                ? visibleTournament.out
                  ? "你已出局，剩余选手正在自动模拟。"
                  : `继续你的比赛 · ${roundLabel(visibleTournament.round)}`
                : "多桌同时开赛，依次经过首轮、次轮、半决赛和总决赛。"}
            </p>
            <div className="mode-footer">
              <span>
                {visibleTournament?.complete
                  ? "查看本届结果"
                  : visibleTournament?.out
                    ? "查看实时模拟进度"
                    : visibleTournament
                      ? "冠军赛已暂停 · 点击继续"
                      : "同时模拟其他牌桌 · 逐轮晋级"}
              </span>
              <ArrowUpRight size={20} />
            </div>
          </button>
          <button
            type="button"
            className="mode-details-button"
            aria-label="查看冠军赛说明"
            title="查看冠军赛说明"
            onClick={() => onModeDetails("tournament")}
          >
            <Info size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
