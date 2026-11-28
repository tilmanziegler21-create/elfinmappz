import { useState } from "react";
import { useI18n } from "./i18n";

export type ClubView = "club" | "gifts" | "perks" | "invite" | "history";

export type ClubData = {
  code: string;
  points: number;
  spent: number;
  level: string;
  percent: number;
  toNext: number;
  next: string;
  referredBy: string;
  cashbackPercent: number;
  referralEvery: number;
  referralBonus: number;
  invites: { no: string; name: string; confirmed: boolean }[];
  ledger: { id: string; at: string; points: number }[];
};

const levels = [
  { id: "SILVER", mark: "◇", from: "0 €" },
  { id: "GOLD", mark: "✦", from: "40 €" },
  { id: "PLATINUM", mark: "◇", from: "90 €" },
  { id: "LEGEND", mark: "♛", from: "150 €" },
] as const;

const gifts = [
  { id: "1", title: "1 × VOEX", points: 70, image: "/assets/products/liquids/voex-pepper-mint.png" },
  { id: "2", title: "2 × VOEX", points: 135, image: "/assets/products/liquids/voex-pepper-mint.png" },
  { id: "3", title: "3 × VOEX", points: 200, image: "/assets/products/liquids/voex-pepper-mint.png" },
  { id: "xros", title: "XROS 6 Mini", points: 350, image: "/assets/products/pods/xros-6-mini.png" },
] as const;

export function ClubMenu({
  view,
  club,
  onView,
  onBack,
  onRefer,
}: {
  view: ClubView;
  club: ClubData | null;
  onView: (view: ClubView) => void;
  onBack: () => void;
  onRefer: (code: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [hold, setHold] = useState("");
  const [code, setCode] = useState("");
  const back = view === "history" ? () => onView("invite") : onBack;
  const points = club?.points ?? 0;
  const confirmed = club?.invites.filter((item) => item.confirmed).length ?? 0;

  async function copyCode() {
    if (!club) return;
    try {
      await navigator.clipboard.writeText(club.code);
    } catch {
      /* the code stays on screen */
    }
    setCopied(true);
  }

  async function attach() {
    setHold("");
    try {
      await onRefer(code);
      setCode("");
    } catch (reason) {
      setHold(reason instanceof Error ? reason.message : t("club.referMiss"));
    }
  }

  if (!club) {
    return (
      <div className="club">
        <div className="club-head">
          <button type="button" className="club-back" onClick={onBack}>{t("club.back")}</button>
          <strong>{t("club.brand")}</strong>
        </div>
        <p className="club-note">{t("club.login")}</p>
      </div>
    );
  }

  return (
    <div className="club">
      <div className="club-head">
        <button type="button" className="club-back" onClick={back}>{t("club.back")}</button>
        <strong>{view === "gifts" ? t("profile.gifts") : view === "history" ? t("invite.history") : t("club.brand")}</strong>
      </div>

      {view === "club" || view === "perks" ? (
        <>
          {view === "club" ? (
            <section className="club-hero">
              <div>
                <span>{t("club.level")}</span>
                <strong>{club.level}</strong>
              </div>
              <div>
                <span>{t("club.balance")}</span>
                <strong>{club.points}</strong>
                <em>{t("club.points")}</em>
              </div>
              <div className="club-meter" aria-hidden="true"><span style={{ width: club.next ? `${Math.min(100, (club.spent / (club.spent + club.toNext)) * 100)}%` : "100%" }} /></div>
              <p>{t("club.spentLabel", { sum: club.spent })}</p>
              <p>{club.next ? t("club.toNextLabel", { level: club.next, sum: club.toNext }) : t("club.top")}</p>
            </section>
          ) : null}
          {view === "club" ? (
            <section className="club-reward">
              <div>
                <strong>{t("club.reward")} {club.level}</strong>
                <span>{t("club.rewardText")}</span>
              </div>
              <button type="button" onClick={() => setHold(t("club.hold"))}>{t("club.claim")}</button>
            </section>
          ) : null}
          {view === "club" ? (
            <div className="club-section">
              <h2>{t("club.prizes")}</h2>
              <button type="button" onClick={() => onView("gifts")}>{t("club.allPrizes")}</button>
            </div>
          ) : null}
          {view === "club" ? (
            <button type="button" className="club-prize" onClick={() => onView("gifts")}>
              <img src="/assets/products/liquids/voex-pepper-mint.png" alt="" />
              <span><strong>1 VOEX</strong><em>70 {t("club.points")}</em></span>
              <b>{t("club.open")}</b>
            </button>
          ) : null}
          <div className="club-section">
            <h2>{t("club.statuses")}</h2>
            {view === "club" ? <button type="button" onClick={() => onView("perks")}>{t("club.allLevels")}</button> : null}
          </div>
          <div className="club-levels">
            {levels.map((level) => (
              <div key={level.id} className={level.id === club.level ? "is-on" : ""}>
                <span aria-hidden="true">{level.mark}</span>
                <strong>{level.id}</strong>
                <em>{t("club.from")} {level.from}</em>
              </div>
            ))}
          </div>
          <p className="club-rule">{t("club.discount", { percent: club.percent })}</p>
        </>
      ) : null}

      {view === "gifts" ? (
        <>
          <section className="club-balance">
            <span>{t("gifts.demo")}</span>
            <strong>{club.points} {t("club.points")}</strong>
          </section>
          <h2>{t("gifts.exchange")}</h2>
          <p className="club-lead">{t("gifts.lead")}</p>
          {gifts.map((gift) => (
            <article key={gift.id} className="club-gift">
              <img src={gift.image} alt="" />
              <span><strong>{gift.title}</strong><em>{gift.points} {t("club.points")}</em></span>
              <button type="button" disabled={points < gift.points} onClick={() => setHold(t("club.hold"))}>{t("gifts.pick")}</button>
            </article>
          ))}
          <h2 className="club-kicker">{t("gifts.history")}</h2>
          {club.ledger.length === 0 ? <p className="club-lead">{t("gifts.none")}</p> : club.ledger.map((row) => (
            <div key={`${row.id}-${row.at}`} className="club-ledger">
              <span><strong>{t("gifts.credit")}</strong><em>#{row.id} · {row.at}</em></span>
              <b>{row.points > 0 ? `+${row.points}` : row.points}</b>
            </div>
          ))}
        </>
      ) : null}

      {view === "invite" ? (
        <>
          <div className="club-people" aria-hidden="true">👥</div>
          <h2 className="club-title">{t("home.inviteTitle")}</h2>
          <div className="club-split">
            <span><b>{club.referralBonus}</b><em>{t("invite.youBonus")}</em></span>
            <span><b>{club.referralEvery}</b><em>{t("invite.every")}</em></span>
          </div>
          <p className="club-lead">{t("invite.points")}</p>
          <button type="button" className="club-row" onClick={() => onView("gifts")}>
            <span>{t("invite.toBonus")}</span>
            <b>›</b>
          </button>
          <section className="club-code">
            <span>{t("invite.code")}</span>
            <strong>{club.code}</strong>
            <button type="button" onClick={copyCode}>{copied ? t("invite.copied") : t("invite.copy")}</button>
          </section>
          {club.referredBy ? <p className="club-lead">{t("invite.bound", { code: club.referredBy })}</p> : (
            <section className="club-code">
              <span>{t("club.refer")}</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} aria-label={t("club.refer")} />
              <button type="button" onClick={attach} disabled={!code.trim()}>{t("club.attach")}</button>
            </section>
          )}
          <div className="club-stats">
            <span><b>{club.invites.length}</b><em>{t("invite.invited")}</em></span>
            <span><b>{confirmed}</b><em>{t("invite.confirmed")}</em></span>
          </div>
          <button type="button" className="club-row" onClick={() => onView("history")}>
            <span>{t("invite.history")}</span>
            <b>›</b>
          </button>
        </>
      ) : null}

      {view === "history" ? (
        <>
          <div className="club-stats">
            <span><b>{club.invites.length}</b><em>{t("invite.invited")}</em></span>
            <span><b>{confirmed}</b><em>{t("invite.confirmed")}</em></span>
            <span><b>{club.points}</b><em>{t("invite.accrued")}</em></span>
          </div>
          {club.invites.length === 0 ? <p className="club-lead">{t("invite.none")}</p> : club.invites.map((item) => (
            <article key={item.no} className="club-invite">
              <span>
                <strong>{t("invite.item")} №{item.no}</strong>
                <em>{item.name}</em>
              </span>
              <b className={item.confirmed ? "done" : "wait"}>{item.confirmed ? t("invite.done") : t("invite.pending")}</b>
            </article>
          ))}
          <section className="club-rules">
            <strong>{t("invite.rules")}</strong>
            <p>{t("invite.points")}</p>
            <p>{t("invite.ruleLive", { every: club.referralEvery, bonus: club.referralBonus })}</p>
            <p>{t("invite.rule3")}</p>
            <p>{t("invite.rule4")}</p>
            <button type="button" onClick={() => onView("gifts")}>{t("invite.toBonus")}</button>
          </section>
        </>
      ) : null}

      {hold ? <p className="club-hold" role="status">{hold}</p> : null}
      <p className="club-note">{t("club.note")}</p>
    </div>
  );
}
