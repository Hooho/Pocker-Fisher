import { ArrowUp, Info, LocateFixed } from "lucide-react";
import type { ReactNode, RefObject, UIEventHandler } from "react";

type LeaderboardPageProps = {
  tournamentCount: number;
  localRank: number;
  totalPlayers: number;
  leaderboardScrolled: boolean;
  leaderboardRef: RefObject<HTMLElement | null>;
  rows: ReactNode;
  onOpenPoints: () => void;
  onScroll: UIEventHandler<HTMLElement>;
  onScrollTop: () => void;
  onLocateSelf: () => void;
};

export function LeaderboardPage({
  tournamentCount,
  localRank,
  totalPlayers,
  leaderboardScrolled,
  leaderboardRef,
  rows,
  onOpenPoints,
  onScroll,
  onScrollTop,
  onLocateSelf,
}: LeaderboardPageProps) {
  return (
    <div className="content-page leaderboard-page">
      <div className="page-heading leaderboard-heading">
        <div><h1>冠军积分榜</h1></div>
        <div className="championship-count" aria-label={`已进行冠军赛 ${tournamentCount} 次`}>
          <small>已进行冠军赛</small>
          <strong>{tournamentCount} 次</strong>
        </div>
      </div>
      <div className="leaderboard-summary career-summary">
        <div><small>我的排名</small><strong>第 {localRank} 名 / {totalPlayers} 位</strong></div>
        <button
          type="button"
          className="career-summary-rule"
          onClick={onOpenPoints}
          aria-label="计分规则 · 点击查看详细说明"
        >
          <span className="career-summary-rule-label">
            <small>计分规则</small>
            <Info size={13} aria-hidden="true" />
          </span>
          <strong>赢手 +0.1 · 冠军 +20</strong>
        </button>
      </div>
      <section
        className="leaderboard-card"
        aria-label="所有选手积分与战绩"
        ref={leaderboardRef}
        onScroll={onScroll}
      >
        <div className="leaderboard-head">
          <span>排名 · 选手</span><span>积分</span><span>最佳成绩</span><span>比赛</span>
          <span>晋级</span><span>赢手</span><span>最高筹码</span>
        </div>
        <div className="leaderboard-body">{rows}</div>
      </section>
      <div className="leaderboard-floating-actions">
        {leaderboardScrolled ? (
          <button type="button" className="leaderboard-scroll-top" aria-label="滚动到顶部" onClick={onScrollTop}>
            <ArrowUp size={17} />
          </button>
        ) : null}
        <button
          type="button"
          className="leaderboard-locate-self"
          aria-label={`定位到我的排名，第 ${localRank} 名`}
          onClick={onLocateSelf}
        >
          <LocateFixed size={17} />
          <span>定位自己</span>
          <b>第 {localRank} 名</b>
        </button>
      </div>
    </div>
  );
}
