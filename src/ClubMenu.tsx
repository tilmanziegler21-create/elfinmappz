import { useState } from "react";
import { useI18n } from "./i18n";

export type ClubView = "club" | "gifts" | "perks" | "invite" | "history";

const levels = [
  { id: "silver", mark: "◇", from: "0 €" },
  { id: "gold", mark: "✦", from: "40 €" },
  { id: "platinum", mark: "◇", from: "90 €" },
  { id: "legend", mark: "♛", from: "150 €" },
] as const;

const gifts = [
  { id: "1", title: "1 × VOEX", points: 70, image: "/assets/products/liquids/voex-pepper-mint.png", open: true },
  { id: "2", title: "2 × VOEX", points: 135, image: "/assets/products/liquids/voex-pepper-mint.png", open: false },
  { id: "3", title: "3 × VOEX", points: 200, image: "/assets/products/liquids/voex-pepper-mint.png", open: false },
  { id: "xros", title: "XROS 6 Mini", points: 350, image: "/assets/products/pods/xros-6-mini.png", open: false },
] as const;

const ledger = [
  { points: 42, date: "10" },
  { points: 44, date: "17" },
] as const;

const invites = [
  { id: "001", state: "done" },
  { id: "002", state: "done" },
  { id: "003", state: "wait" },
] as const;

export function ClubMenu({ view, onView, onBack }: { view: ClubView; onView: (view: ClubView) => void; onBack: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [hold, setHold] = useState(false);
  const back = view === "history" ? () => onView("invite") : onBack;

  async function copyCode() {
    const value = "ELFIN-7K2";
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* the code stays on screen */
    }
    setCopied(true);
  }

  return (
    <div className="club">
      <div className="club-head">
        <button type="button" className="club-back" onClick={back}>{t("club.back")}</button>
        <strong>{view === "gifts" ? t("profile.gifts") : view === "history" ? t("invite.history") : view === "invite" ? t("club.brand") : t("club.brand")}</strong>
      </div>

      {view === "club" || view === "perks" ? (
        <>
          {view === "club" ? (
            <section className="club-hero">
              <div>
                <span>{t("club.level")}</span>
                <strong>GOLD</strong>
              </div>
              <div>
                <span>{t("club.balance")}</span>
                <strong>72</strong>
                <em>{t("club.points")}</em>
              </div>
              <div className="club-meter" aria-hidden="true"><span /></div>
              <p>{t("club.spent")}</p>
              <p>{t("club.toNext")}</p>
            </section>
          ) : null}
          {view === "club" ? (
            <section className="club-reward">
              <div>
                <strong>{t("club.reward")}</strong>
                <span>{t("club.rewardText")}</span>
              </div>
              <button type="button" onClick={() => setHold(true)}>{t("club.claim")}</button>
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
              <div key={level.id} className={level.id === "gold" ? "is-on" : ""}>
                <span aria-hidden="true">{level.mark}</span>
                <strong>{level.id.toUpperCase()}</strong>
                <em>{t("club.from")} {level.from}</em>
              </div>
            ))}
          </div>
          <p className="club-rule">{t("club.discount")}</p>
        </>
      ) : null}

      {view === "gifts" ? (
        <>
          <section className="club-balance">
            <span>{t("gifts.demo")}</span>
            <strong>72 {t("club.points")}</strong>
          </section>
          <h2>{t("gifts.exchange")}</h2>
          <p className="club-lead">{t("gifts.lead")}</p>
          {gifts.map((gift) => (
            <article key={gift.id} className="club-gift">
              <img src={gift.image} alt="" />
              <span><strong>{gift.title}</strong><em>{gift.points} {t("club.points")}</em></span>
              <button type="button" disabled={!gift.open} onClick={() => setHold(true)}>{t("gifts.pick")}</button>
            </article>
          ))}
          <h2 className="club-kicker">{t("gifts.history")}</h2>
          {ledger.map((row) => (
            <div key={row.date} className="club-ledger">
              <span><strong>{t("gifts.credit")}</strong><em>{t("gifts.sample")} · {row.date}</em></span>
              <b>+{row.points}</b>
            </div>
          ))}
        </>
      ) : null}

      {view === "invite" ? (
        <>
          <div className="club-people" aria-hidden="true">👥</div>
          <h2 className="club-title">{t("home.inviteTitle")}</h2>
          <div className="club-split">
            <span><b>🎁</b><em>{t("home.inviteYou")}</em></span>
            <span><b>🎁</b><em>{t("home.inviteFriend")}</em></span>
          </div>
          <p className="club-lead">{t("invite.note")}</p>
          <section className="club-code">
            <span>{t("invite.code")}</span>
            <strong>ELFIN-7K2</strong>
            <button type="button" onClick={copyCode}>{copied ? t("invite.copied") : t("invite.copy")}</button>
          </section>
          <div className="club-stats">
            <span><b>3</b><em>{t("invite.invited")}</em></span>
            <span><b>2</b><em>{t("invite.confirmed")}</em></span>
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
            <span><b>3</b><em>{t("invite.invited")}</em></span>
            <span><b>2</b><em>{t("invite.confirmed")}</em></span>
            <span><b>60</b><em>{t("invite.accrued")}</em></span>
          </div>
          {invites.map((item) => (
            <article key={item.id} className="club-invite">
              <span>
                <strong>{t("invite.item")} №{item.id}</strong>
                <em>{item.state === "done" ? "+30" : t("invite.wait")}</em>
              </span>
              <b className={item.state}>{item.state === "done" ? t("invite.done") : t("invite.pending")}</b>
            </article>
          ))}
          <section className="club-rules">
            <strong>{t("invite.rules")}</strong>
            <p>{t("invite.rule1")}</p>
            <p>{t("invite.rule2")}</p>
            <p>{t("invite.rule3")}</p>
            <p>{t("invite.rule4")}</p>
          </section>
        </>
      ) : null}

      {hold ? <p className="club-hold" role="status">{t("club.hold")}</p> : null}
      <p className="club-note">{t("club.note")}</p>
    </div>
  );
}
